import Homey from 'homey';
import cron from 'node-cron';
import {
  ZaptecApi,
  ApolloDeviceObservation,
  Command,
  ChargerOperationMode,
  chargerOperationModeStr,
  chargerOperationModeFromStr,
} from '../../lib/zaptec';
import { ChargerStateModel } from '../../lib/zaptec/models';

export class GoCharger extends Homey.Device {
  private debugLog: string[] = [];
  private cronTasks: cron.ScheduledTask[] = [];
  private api?: ZaptecApi;
  private tokenRenewalTimeout: NodeJS.Timeout | undefined;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('GoCharger is initializing');
    const appVersion = this.homey.app.manifest.version;
    this.api = new ZaptecApi(appVersion);
    this.renewToken();

    await this.api.authenticate(
      this.getSetting('username'),
      this.getSetting('password'),
    );

    await this.migrateCapabilities();
    await this.migrateSettings();
    this.registerCapabilityListeners();

    this.cronTasks.push(
      cron.schedule('0,30 * * * * *', () => this.pollValues()),
      cron.schedule('59 * * * * *', () => this.updateDebugLog()),
      cron.schedule('0 0 7 * * * *', () => {
        // Random delay between 0 and 120 seconds
        const jitter = Math.floor(Math.random() * 120000);
        setTimeout(() => {
          this.pollSlowValues();
        }, jitter);
      }),
    );

    // Do initial slow poll at start, we don't know how long ago we read it out.
    this.pollSlowValues();

    this.log('GoCharger has been initialized');
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
        .then((charger) => {
          this.setSettings({
            deviceid: charger.DeviceId,
          });
        })
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
  }

  /**
   * Verify all expected capabilities and apply changes to capabilities.
   *
   * This avoids having to re-add the device when modifying capabilities.
   */
  private async migrateCapabilities() {
    const remove = [
      'available_installation_current.phase1',
      'available_installation_current.phase2',
      'available_installation_current.phase3',
      'meter_power',
      'onoff',
    ];

    for (const cap of remove)
      if (this.hasCapability(cap)) await this.removeCapability(cap);

    const add = [
      'available_installation_current',
      'meter_power.last_session',
      'meter_power.this_year',
      'meter_power.current_session',
      'alarm_generic.car_connected',
      'charging_button', // replaces onoff
      'measure_temperature',
      'measure_humidity',
      'cable_permanent_lock',
    ];

    for (const cap of add)
      if (!this.hasCapability(cap)) await this.addCapability(cap);
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
    this.log('GoCharger has been added');
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
    //this.log('GoCharger settings where changed: ', JSON.stringify(changes));

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
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log(`GoCharger ${this.getName()} was renamed to ${name}`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('GoCharger has been deleted');
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
      .getChargeHistory({
        ChargerId: this.getData().id,
        From: new Date(year, 0, 1, 0, 0, 1).toJSON(),
        DetailLevel: 0,
        PageSize: 50,
      })
      .then((charges) => {
        const yearlyEnergy =
          charges?.reduce((sum, charge) => sum + charge.Energy, 0) || 0;
        return this.setCapabilityValue('meter_power.this_year', yearlyEnergy);
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
      case ApolloDeviceObservation.ChargerOperationMode:
        if (state.ValueAsString !== undefined && state.ValueAsString !== null) {
          await this.updateChargeMode(
            Number(state.ValueAsString) as ChargerOperationMode,
          );
        }
        break;

      // Charger connectivity
      case ApolloDeviceObservation.IsOnline:
        if (state.ValueAsString === '1') await this.setAvailable();
        else await this.setUnavailable('Charger is offline');
        break;

      case ApolloDeviceObservation.CurrentPhase1:
        await this.setCapabilityValue(
          'measure_current.phase1',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.CurrentPhase2:
        await this.setCapabilityValue(
          'measure_current.phase2',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.CurrentPhase3:
        await this.setCapabilityValue(
          'measure_current.phase3',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.VoltagePhase1:
        if (this.hasCapability('measure_voltage.phase1')) {
          await this.setCapabilityValue(
            'measure_voltage.phase1',
            Number(state.ValueAsString),
          );
        }
        break;

      case ApolloDeviceObservation.VoltagePhase2:
        if (this.hasCapability('measure_voltage.phase2')) {
          await this.setCapabilityValue(
            'measure_voltage.phase2',
            Number(state.ValueAsString),
          );
        }
        break;

      case ApolloDeviceObservation.VoltagePhase3:
        if (this.hasCapability('measure_voltage.phase3')) {
          await this.setCapabilityValue(
            'measure_voltage.phase3',
            Number(state.ValueAsString),
          );
        }
        break;

      case ApolloDeviceObservation.TotalChargePower:
        await this.setCapabilityValue(
          'measure_power',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.TotalChargePowerSession:
        await this.setCapabilityValue(
          'meter_power.current_session',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.Humidity:
        await this.setCapabilityValue(
          'measure_humidity',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.TemperatureInternal5:
        await this.setCapabilityValue(
          'measure_temperature',
          Number(state.ValueAsString),
        );
        break;

      case ApolloDeviceObservation.SmartComputerSoftwareApplicationVersion:
        await this.setSettings({
          firmware: state.ValueAsString,
        });
        break;

      // The data for the previous session is JSON stringified into this state
      // variable
      case ApolloDeviceObservation.CompletedSession:
        if (state.ValueAsString) await this.onLastSession(state.ValueAsString);
        break;

      case ApolloDeviceObservation.PermanentCableLock:
        await this.setCapabilityValue(
          'cable_permanent_lock',
          Number(state.ValueAsString) === 1 ? true : false,
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
    if (this.api === undefined) return;
    const info = await this.api
      .getInstallation(this.getData().installationId)
      .catch((e) => {
        this.logToDebug(
          `Failed to get installation info when updating available current: ${e}`,
        );
        throw e;
      });

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

    // If no mode change occurs, don't run the triggers
    if (previousMode === newMode) return;

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

    this.logToDebug(`Charge mode update: ${previousMode} to ${newMode}`);

    // TODO: Don't these just duplicate the capabilities now?
    const tokens = {
      charging: newMode === ChargerOperationMode.Connected_Charging,
      car_connected: newModeConnected,
      current_limit: this.getCapabilityValue('available_installation_current'),
    };

    // Entering charging state => Charging starts
    if (newMode === ChargerOperationMode.Connected_Charging) {
      await this.homey.flow
        .getDeviceTriggerCard('charging_starts')
        .trigger(this, tokens);
    }

    // Changed from charging state => Charging stops
    if (previousMode === ChargerOperationMode.Connected_Charging) {
      await this.homey.flow
        .getDeviceTriggerCard('charging_stops')
        .trigger(this, tokens);
    }

    // Was disconnected and now becomes connected => Car connected
    if (newModeConnected && previouslyDisconnected) {
      await this.homey.flow
        .getDeviceTriggerCard('car_connects')
        .trigger(this, tokens);
    }

    // Was connected and now becomes disconnected => Car disconnected
    if (!newModeConnected && !previouslyDisconnected) {
      await this.homey.flow
        .getDeviceTriggerCard('car_disconnects')
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
        throw new Error(`Failed to adjust current: ${e}`);
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

module.exports = GoCharger;
