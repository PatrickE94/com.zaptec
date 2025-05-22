import Homey from 'homey';
import cron from 'node-cron';
import {
  ZaptecApi,
  SmartDeviceObservation,
  Command,
  ChargerOperationMode,
  chargerOperationModeStr,
  chargerOperationModeFromStr,
} from '../../lib/zaptec';
import { ApiError } from '../../lib/zaptec/error';
import { ChargerStateModel } from '../../lib/zaptec/models';

export class HomeCharger extends Homey.Device {
  private debugLog: string[] = [];
  private cronTasks: cron.ScheduledTask[] = [];
  private api?: ZaptecApi;
  private tokenRenewalTimeout: NodeJS.Timeout | undefined;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('HomeCharger is initializing');
    const appVersion = this.homey.app.manifest.version;
    this.api = new ZaptecApi(appVersion, this.homey);
    this.renewToken();

    await this.api.authenticate(
      this.getSetting('username'),
      this.getSetting('password'),
    );

    await this.migrateClass();
    await this.migrateCapabilities();
    await this.migrateSettings();
    await this.migrateEnergy();
    this.registerCapabilityListeners();

    this.cronTasks.push(
      cron.schedule('0,30 * * * * *', () => this.pollValues()), //every 30 seconds
      cron.schedule('59 * * * * *', () => this.updateDebugLog()), //every minute
      cron.schedule('0 0 7 * * * *', () => { // 7AM every day
        // Random delay between 0 and 120 seconds
        const jitter = Math.floor(Math.random() * 120000);
        setTimeout(() => {
          this.pollSlowValues();
        }, jitter);
      }),
    );

    // Do initial slow poll at start, we don't know how long ago we read it out.
    this.pollSlowValues();

    this.log('HomeCharger has been initialized');
  }

  /**
   * Athom addded an EV Charger class, we'll want to use that one!
   *
   * This takes care of migrating already added devices to the new class.
   */
  private async migrateClass() {
    if (this.getClass() !== 'evcharger') {
      await this.setClass('evcharger')
        .then(() => {
          this.logToDebug(`Updated device class to EV Charger`);
        })
        .catch((e) => {
          this.logToDebug(`Failed to set device class: ${e}`);
        });
    }
  }

  private async migrateEnergy() {
    const energyConfig = this.getEnergy();
      if (energyConfig?.cumulative !== true) {
        this.setEnergy({
          cumulative: true
        }).catch((e) => {
          this.logToDebug(`Failed to migrate energy: ${e}`);
        });
    }
  }

  /**
   * Migrate settings from the old settings format to the new one.
   * If the deviceid setting is empty, poll the charger info and store the device id.
   */
  private async migrateSettings() {
    if (this.api === undefined) return;

    if (this.getSetting('deviceid') === '') {
      await this.api
        .getCharger(this.getData().id)
        .then((charger) =>
          this.setSettings({
            deviceid: charger.DeviceId,
          }),
        )
        .then(() => {
          this.logToDebug(`Got charger info - added device id`);
        })
        .catch((e) => {
          this.logToDebug(`Failed to poll charger info: ${e}`);
        });
      }
      
      if (this.getSetting('showVoltage')){
        await this.addCapability('measure_voltage.phase1');
        await this.addCapability('measure_voltage.phase2');
        await this.addCapability('measure_voltage.phase3');
      }else{
        await this.removeCapability('measure_voltage.phase1');
        await this.removeCapability('measure_voltage.phase2');
        await this.removeCapability('measure_voltage.phase3');    
      }
      if (this.getSetting('showCurrent')){
        await this.addCapability('measure_current.phase1');
        await this.addCapability('measure_current.phase2');
        await this.addCapability('measure_current.phase3');
      }else{
        await this.removeCapability('measure_current.phase1');
        await this.removeCapability('measure_current.phase2');
        await this.removeCapability('measure_current.phase3');    
      }
    }

  /**
   * Verify all expected capabilities and apply changes to capabilities.
   *
   * This avoids having to re-add the device when modifying capabilities.
   */
  private async migrateCapabilities() {
    //get lastInstalledVersion from settings
    const lastInstalledVersion = this.getSetting('lastInstalledVersion') || '0.0.0';

    if (lastInstalledVersion <= '1.8.1' && !this.hasCapability('charging_mode')) {
      await this.addCapability('charging_mode');
    }

    // Log version information for debugging
    this.logToDebug(`Migration: Current version is ${this.homey.app.manifest.version}, previously installed version was ${lastInstalledVersion}`);
    
    // Only run migrations if needed
    if (lastInstalledVersion < '1.7.2') {
      const remove: string[] = ['measure_temperature','meter_power.this_year',
        'meter_power.current_session','meter_power','meter_power.last_session','measure_power','alarm_generic.car_connected','measure_humidity',
        'measure_temperature.sensor1','measure_temperature.sensor2',
        'measure_signal_strength','communication_method'
      ];

      for (const cap of remove)
        if (this.hasCapability(cap)) await this.removeCapability(cap);

      const add = [
        'measure_power',
        'meter_power.current_session',
        'meter_power',
        'meter_power.last_session',
        'alarm_generic.car_connected',
        'measure_humidity',
        'measure_temperature.sensor1',
        'measure_temperature.sensor2',
        'cable_permanent_lock', 
        'meter_power.signed_meter_value',
        'measure_signal_strength',
        'communication_method'
      ];

      for (const cap of add)
        if (!this.hasCapability(cap)) await this.addCapability(cap);
    }
    
    // Store current version as "last installed" after migration
    await this.setSettings({
      lastInstalledVersion: this.homey.app.manifest.version
    }).catch(e => {
      this.logToDebug(`Error storing version information: ${e}`);
    });
  }

  /**
   * Assign reactions to capability changes triggered by others.
   */
  protected registerCapabilityListeners() {
    this.registerCapabilityListener('charging_button', async (value) => {
      if (value) await this.startCharging();
      else await this.stopCharging();
    });
    this.registerCapabilityListener('cable_permanent_lock', async (value) => {
      if (value) await this.lockCable(true);
      else await this.lockCable(false);
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('HomeCharger has been added');
    // Trigger initial polls to make it look nice immediately!
    this.pollValues();
    this.pollSlowValues();
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings(changes: {
    oldSettings: { [key: string]: string };
    newSettings: { [key: string]: string };
    changedKeys: string[];
  }): Promise<string | void> {
    //this.log('HomeCharger settings where changed: ', JSON.stringify(changes));

    // Allow user to select if they want phase voltage as a capability or not.
    if (changes.changedKeys.some((k) => k === 'showVoltage')) {
      if (changes.newSettings.showVoltage) {
        await this.addCapability('measure_voltage.phase1');
        await this.addCapability('measure_voltage.phase2');
        await this.addCapability('measure_voltage.phase3');
      } else {
        await this.removeCapability('measure_voltage.phase1');
        await this.removeCapability('measure_voltage.phase2');
        await this.removeCapability('measure_voltage.phase3');
      }
    }
    // Allow user to select if they want phase current as a capability or not.
    if (changes.changedKeys.some((k) => k === 'showCurrent')) {
      if (changes.newSettings.showCurrent) {
        await this.addCapability('measure_current.phase1');
        await this.addCapability('measure_current.phase2');
        await this.addCapability('measure_current.phase3');
      } else {
        await this.removeCapability('measure_current.phase1');
        await this.removeCapability('measure_current.phase2');
        await this.removeCapability('measure_current.phase3');
      }
    }
    
    // Handle changes to authentication requirement
    if (changes.changedKeys.some((k) => k === 'requireAuthentication')) {
      try {
        if (!this.hasCapability('available_installation_current')) {
          throw new Error(this.homey.__('errors.missing_installation_access'));
        }
        
        const requireAuthValue = changes.newSettings.requireAuthentication;
        const requireAuth = typeof requireAuthValue === 'string' 
          ? requireAuthValue === 'true' 
          : Boolean(requireAuthValue);
        
        await this.setInstallationAuthenticationRequirement(requireAuth);
        this.logToDebug(`Updated authentication requirement to ${requireAuth} via settings`);
      } catch (e) {
        this.logToDebug(`Failed to update authentication requirement via settings: ${e}`);
        throw e;
      }
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log(`HomeCharger ${this.getName()} was renamed to ${name}`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('HomeCharger has been deleted');
    for (const task of this.cronTasks) task.stop();
  }

  /**
   * Renew the access token to the API
   */
  protected renewToken() {
    if (this.api === undefined) {
      if (this.tokenRenewalTimeout === undefined) {
        // retry in 30 seconds
        this.tokenRenewalTimeout = setTimeout(this.renewToken.bind(this), 30);
      }

      this.logToDebug(`API class not created yet`);
      return;
    }

    clearTimeout(this.tokenRenewalTimeout);
    this.tokenRenewalTimeout = undefined;

    // We renew the token by simply authenticating again.
    this.api
      .authenticate(this.getSetting('username'), this.getSetting('password'))
      .then((expires) => {
        // Renew 30 seconds before expiry
        this.tokenRenewalTimeout = setTimeout(
          this.renewToken.bind(this),
          (expires - 30) * 1000,
        );
        this.logToDebug(`Renewed token successfully`);
      })
      .catch((e) => {
        this.logToDebug(`Failed to renew authentication token: ${e}`);
        // retry in 30 seconds
        this.tokenRenewalTimeout = setTimeout(() => this.renewToken(), 30_000);
      });
  }

  /**
   * Poll values from Portal.
   *
   * This is intentionally not async since nothing is catching the errors.
   * We should catch errors inside this function!
   */
  protected pollValues() {
    if (this.api === undefined) return;
    
    // Poll charger info
    this.api
      .getCharger(this.getData().id)
      .then((charger) => {
        this.setSettings({
          requireAuthentication: charger.IsAuthorizationRequired,
        });
      });

    // Poll state variables from the API.
    this.api
      .getChargerState(this.getData().id)
      .then(async (states) => {
        for (const state of states) {
          // Wrap each state handling individually so that a single bad state processing
          // doesn't drop all values. It makes the app more usable when it's failing.
          try {
            await this.handleState(state);
          } catch (e) {
            this.logToDebug(
              `Failed to handle charger state ${state.StateId}: ${e}`,
            );
          }
        }
      })
      .catch((e) => {
        this.logToDebug(`Failed to poll charger state: ${e}`);
      });

    // Poll the available current for the installation.
    // TODO: Is this really necessary? Is it interesting to watch live?
    // It's more likely to be changed by us?
    this.pollAvailableCurrent().catch((e) => {
      this.logToDebug(`Failed to poll available current: ${e}`);
    });
  }

  /**
   * Poll values which change slowly and thus have a lower refresh rate.
   *
   * E.g. yearly charging consumption.
   */
  protected pollSlowValues() {
    if (this.api === undefined) return;
    const year = new Date().getFullYear();

    this.api
      .getInstallation(this.getData().installationId)
      .then((installation) => {
        if (installation.Id === this.getData().installationId && !this.hasCapability('available_installation_current'))
          this.addCapability('available_installation_current');
      })
      .catch((e) => {
        this.logToDebug(`Failed to poll installation: ${e}`);
        if (this.hasCapability('available_installation_current')) 
          this.removeCapability('available_installation_current');
      });

    this.api
      .getChargeHistory({
        ChargerId: this.getData().id,
        From: new Date(year, 0, 1, 0, 0, 1).toJSON(),
        DetailLevel: 0,
        PageSize: 50,
      })
      .then((charges) => {
        const yearlyEnergy =
          charges?.reduce((sum, charge) => sum + charge.Energy, 0) || 0;
        return this.setCapabilityValue('meter_power', yearlyEnergy);
      })
      .then(() => {
        this.logToDebug(`Got yearly power history`);
      })
      .catch((e) => {
        this.logToDebug(`Failed to poll charge history: ${e}`);
      });
  }

  /**
   * Perform the correct action for each interesting charger state variable.
   *
   * @param {ChargerStateModel} state - The state variable polled from the charger.
   */
  protected async handleState(state: ChargerStateModel) {
    switch (state.StateId) {
      // Operation mode is the basis of most of our state!
      case SmartDeviceObservation.ChargerOperationMode:
        if (state.ValueAsString !== undefined && state.ValueAsString !== null) {
          await this.updateChargeMode(
            Number(state.ValueAsString) as ChargerOperationMode,
          );
        }
        break;

      // Charger connectivity
      case SmartDeviceObservation.IsOnline:
        if (state.ValueAsString === '1') await this.setAvailable();
        else await this.setUnavailable('Charger is offline');
        break;

      case SmartDeviceObservation.CurrentPhase1:
        if (this.hasCapability('measure_current.phase1')) {
          await this.setCapabilityValue(
            'measure_current.phase1',
            Number(state.ValueAsString),
          );
        }
        break;

      case SmartDeviceObservation.CurrentPhase2:
        if (this.hasCapability('measure_current.phase2')) {
          await this.setCapabilityValue(
            'measure_current.phase2',
            Number(state.ValueAsString),
          );
        }
        break;

      case SmartDeviceObservation.CurrentPhase3:
        if (this.hasCapability('measure_current.phase3')) {
          await this.setCapabilityValue(
            'measure_current.phase3',
            Number(state.ValueAsString),
          );
        }
        break;

      case SmartDeviceObservation.VoltagePhase1:
        if (this.hasCapability('measure_voltage.phase1')) {
          await this.setCapabilityValue(
            'measure_voltage.phase1',
            Number(state.ValueAsString),
          );
        }
        break;

      case SmartDeviceObservation.VoltagePhase2:
        if (this.hasCapability('measure_voltage.phase2')) {
          await this.setCapabilityValue(
            'measure_voltage.phase2',
            Number(state.ValueAsString),
          );
        }
        break;

      case SmartDeviceObservation.VoltagePhase3:
        if (this.hasCapability('measure_voltage.phase3')) {
          await this.setCapabilityValue(
            'measure_voltage.phase3',
            Number(state.ValueAsString),
          );
        }
        break;

      case SmartDeviceObservation.TotalChargePower:
        await this.setCapabilityValue(
          'measure_power',
          Number(state.ValueAsString),
        );
        break;

      case SmartDeviceObservation.TotalChargePowerSession:
        await this.setCapabilityValue(
          'meter_power.current_session',
          Number(state.ValueAsString),
        );
        break;

      case SmartDeviceObservation.TemperatureInternal5:
        await this.setCapabilityValue(
          'measure_temperature.sensor1',
          Number(state.ValueAsString),
        );
        break;

      case SmartDeviceObservation.TemperatureInternal6:
        await this.setCapabilityValue(
          'measure_temperature.sensor2',
          Number(state.ValueAsString),
        );
        break;

      case SmartDeviceObservation.Humidity:
        await this.setCapabilityValue(
          'measure_humidity',
          Number(state.ValueAsString),
        );
        break;

      case SmartDeviceObservation.SmartComputerSoftwareApplicationVersion:
        await this.setSettings({
          firmware: state.ValueAsString,
        });
        break;

      // The data for the previous session is JSON stringified into this state
      // variable
      case SmartDeviceObservation.CompletedSession:
        if (state.ValueAsString) await this.onLastSession(state.ValueAsString);
        break;

      case SmartDeviceObservation.PermanentCableLock:
        await this.setCapabilityValue(
          'cable_permanent_lock',
          Number(state.ValueAsString) === 1,
        );
        break;

      case SmartDeviceObservation.SignedMeterValue:
        if (state.ValueAsString) await this.onSignedMeterValue(state.ValueAsString);
        break;

      case SmartDeviceObservation.CommunicationSignalStrength:
        await this.setCapabilityValue(
          'measure_signal_strength',
          Number(state.ValueAsString),
        );
        break;

      case SmartDeviceObservation.CommunicationMode:
        await this.setCapabilityValue(
          'communication_method',
          state.ValueAsString
        );
        break;
        
      default:
        break;
    }
  }

  /**
   * Poll the available current for the installation.
   */
  protected async pollAvailableCurrent() {
    if (this.api === undefined || !this.hasCapability('available_installation_current')) return;
    const info = await this.api
      .getInstallation(this.getData().installationId)
      .catch((e) => {     
        if (e instanceof ApiError && e.message.indexOf('Unknown object') >= 0 && this.hasCapability('available_installation_current'))
          this.removeCapability('available_installation_current');
        this.logToDebug(
          `Failed to get installation info when updating available current: ${e}`,
        );
        throw e;
      });

    // Update the authentication requirement setting to match the actual value from the installation
    if (info.IsRequiredAuthentication !== undefined) {
      const currentSetting = this.getSetting('requireAuthentication');
      if (currentSetting !== info.IsRequiredAuthentication) {
        this.setSettings({ requireAuthentication: info.IsRequiredAuthentication })
          .catch(e => this.logToDebug(`Failed to update requireAuthentication setting: ${e}`));
      }
    }

    const isNumber = (n: number | undefined | null): n is number =>
      n !== undefined && n !== null;
    const maxCurrent = isNumber(info.MaxCurrent) ? info.MaxCurrent : 40;

    // TODO: Should we bring back phase individual installation current?
    const availableCurrent = Math.min(
      isNumber(info.AvailableCurrentPhase1)
        ? info.AvailableCurrentPhase1
        : maxCurrent,
      isNumber(info.AvailableCurrentPhase2)
        ? info.AvailableCurrentPhase2
        : maxCurrent,
      isNumber(info.AvailableCurrentPhase3)
        ? info.AvailableCurrentPhase3
        : maxCurrent,
    );

    // TODO: Is this interesting as a capability or should we expose it as a
    // global token only?
    await this.setCapabilityValue(
      'available_installation_current',
      availableCurrent,
    );
  }

  /**
   * Update the charge_mode capability and trigger relevant flow cards
   */
  protected async updateChargeMode(newMode: ChargerOperationMode) {
    await this.setCapabilityValue(
      'charging_button',
      // We only consider us charging if we are connected AND charging.
      newMode === ChargerOperationMode.Connected_Charging,
    );

    const previousMode = chargerOperationModeFromStr(
      this.getCapabilityValue('charge_mode'),
    );

    const previouslyDisconnected =
      previousMode === ChargerOperationMode.Unknown ||
      previousMode === ChargerOperationMode.Disconnected;

    const newModeConnected =
      newMode === ChargerOperationMode.Connected_Requesting ||
      newMode === ChargerOperationMode.Connected_Charging ||
      newMode === ChargerOperationMode.Connected_Finishing;

    await this.setCapabilityValue(
      'charge_mode',
      chargerOperationModeStr(newMode),
    );
    await this.setCapabilityValue(
      'alarm_generic.car_connected',
      newModeConnected,
    );

    // If no mode change occurs, don't run the triggers
    if (previousMode === newMode) return;    

    this.logToDebug(`Charger operation mode update: ${previousMode} to ${newMode}`);

    // TODO: Don't these just duplicate the capabilities now?
    const tokens = {
      charging: newMode === ChargerOperationMode.Connected_Charging,
      car_connected: newModeConnected,
      current_limit: Number(this.getCapabilityValue('available_installation_current')),
    };

    // Entering charging state => Charging starts
    if (newMode === ChargerOperationMode.Connected_Charging) {
      await this.homey.flow
        .getDeviceTriggerCard('home_charging_starts')
        .trigger(this, tokens);
    }

    // Changed from charging state => Charging stops
    if (previousMode === ChargerOperationMode.Connected_Charging) {
      await this.homey.flow
        .getDeviceTriggerCard('home_charging_stops')
        .trigger(this, tokens);
    }

    // Was disconnected and now becomes connected => Car connected
    if (newModeConnected && previouslyDisconnected) {
      await this.homey.flow
        .getDeviceTriggerCard('home_car_connects')
        .trigger(this, tokens);
    }

    // Was connected and now becomes disconnected => Car disconnected
    if (!newModeConnected && !previouslyDisconnected) {
      await this.homey.flow
        .getDeviceTriggerCard('home_car_disconnects')
        .trigger(this, tokens);
    }
  }

  /**
   * Extract information from last charging session.
   *
   * @param {string} data - JSON stringified data from the state variable.
   */
  protected async onLastSession(data: string) {
    try {
      const session: {
        SessionId: string;
        Energy: string;
        StartDateTime: string;
        EndDateTime: string;
        ReliableClock: boolean;
        StoppedByRFID: boolean;
        AuthenticationCode: string;
        SignedSession: string;
      } = JSON.parse(data);

      await this.setCapabilityValue(
        'meter_power.last_session',
        Number(session.Energy),
      );
    } catch (e) {
      this.logToDebug(`onLastSession fail: ${e}`);
    }
  }

  protected async onSignedMeterValue(data: string) {
    try {
      const parts = data.split('|');
      const jsonStr = parts[1].replace(/\\"/g, '"');
      const ocmf: {
        FV: string;
        GI: string;
        GS: string;
        GV: string;
        PG: string;
        MF: string;
        RD: {
          RV: number;
          TM?: string;
          RI?: string;
          RU?: string;
          ST?: string;
        }[];
      } = JSON.parse(jsonStr);
      
      const rv = ocmf.RD?.[0]?.RV;
      if (rv !== undefined) {
        const num = Number(rv);
        const formatted = Number.isInteger(num) ? num.toString() : num.toFixed(2);
        this.setSettings({
          signedMeterValue: formatted,
        }).then(() => {
          this.setCapabilityValue('meter_power.signed_meter_value', num);
        })
        .catch((e) => {
          this.logToDebug(`Failed to get OCMF-signed value: ${e}`);
        });
      }
    } catch (e) {
      this.logToDebug(`onSignedMeterValue fail: ${e}`);
    }
  }

  /**
   * Adjust the available current for the installation.
   *
   * @param {number} current1 - Phase 1 current in Ampere
   * @param {number} current2 - Phase 2 current in Ampere
   * @param {number} current3 - Phase 3 current in Ampere
   */
  public async setInstallationAvailableCurrent(
    current1: number,
    current2: number,
    current3: number,
  ) {
    if (this.api === undefined) throw new Error(`API not initialized!`);
    return this.api
      .updateInstallation(this.getData().installationId, {
        AvailableCurrentPhase1: current1,
        AvailableCurrentPhase2: current2,
        AvailableCurrentPhase3: current3,
      })
      .then(async () => {
        // Poll new value to see what was actually set
        await this.pollAvailableCurrent();
        this.logToDebug(`Updated available current`);
        return true;
      })
      .catch((e) => {
        this.logToDebug(`adjustCurrent failure: ${e}`);
        throw new Error(`${this.homey.__('errors.failed_installation_current_update')}: ${e}`);
      });
  }

  /**
   * Send command to start/resume a charging session.
   */
  public async startCharging() {
    if (this.api === undefined) throw new Error(`API not initialized!`);
    // TODO: Send different command if it has old firmware
    return this.api
      .sendCommand(this.getData().id, Command.ResumeCharging)
      .then(() => true)
      .catch((e) => {
        this.logToDebug(`startCharging failure: ${e}`);
        throw new Error(`Failed to turn on the charger: ${e}`);
      });
  }

  /**
   * Send command to pause/stop an ongoing charging session.
   */
  public async stopCharging() {
    if (this.api === undefined) throw new Error(`API not initialized!`);
    // TODO: Send different command if it has old firmware
    return this.api
      .sendCommand(this.getData().id, Command.StopChargingFinal)
      .then(() => true)
      .catch((e) => {
        this.logToDebug(`stopCharging failure: ${e}`);
        throw new Error(`Failed to turn off the charger: ${e}`);
      });
  }

  public async lockCable(lockCable: boolean) {
    if (this.api === undefined) throw new Error(`API not initialized!`);
    return this.api
      .lockCharger(this.getData().id, lockCable)
      .then(() => true)
      .catch((e) => {
        this.logToDebug(`lockCable failure: ${e}`);
        throw new Error(`Failed to lock/unlock cable: ${e}`);
      });
  }

  /**
   * Sets whether the installation requires authentication for charging
   * 
   * @param {boolean} requireAuthentication - true if authentication is required, false otherwise
   * @returns {Promise<boolean>} - true if the operation succeeded
   */
  public async setInstallationAuthenticationRequirement(requireAuthentication: boolean) {
    if (this.api === undefined) throw new Error(`API not initialized!`);
    return this.api
      .updateInstallationAuthenticationRequirement(this.getData().installationId, requireAuthentication)
      .then(() => {
        this.logToDebug(`Updated authentication requirement to ${requireAuthentication}`);
        return true;
      })
      .catch((e) => {
        this.logToDebug(`setInstallationAuthenticationRequirement failure: ${e}`);
        throw new Error(`${this.homey.__('errors.failed_auth_update')}: ${e}`);
      });
  }

  /**
   * Push a logline onto the debug log visible to user
   *
   * @param {string} line - Line to log
   */
  protected logToDebug(line: string) {
    this.debugLog.push(`[${new Date().toJSON()}] ${line}`);
    if (this.debugLog.length > 50) this.debugLog.shift();
    this.log(line);
  }

  /**
   * Push current cache of debug log into the device settings view.
   *
   * This makes it visible to the user, but we don't want to constantly
   * push data to the Homey settings module. We should trigger this function
   * periodically.
   */
  protected updateDebugLog() {
    this.setSettings({ log: this.debugLog.join('\n') }).catch((e) =>
      this.error('Failed to update debug log', e),
    );
  }
}

module.exports = HomeCharger;
