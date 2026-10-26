import cron from 'node-cron';
import { ApolloDeviceObservation, Command, ChargerOperationMode } from '../../lib/zaptec';
import { chargingStateFor, operationModeFor } from '../../lib/zaptec/charging';
import { ApiError } from '../../lib/zaptec/error';
import { ChargerStateModel } from '../../lib/zaptec/models';
import { Feature } from '../../lib/zaptec/enums';
import type { ZaptecApp } from '../../app';
import { ZaptecDevice } from '../../lib/ZaptecDevice';

export class Go2Charger extends ZaptecDevice {
  private cronTasks: cron.ScheduledTask[] = [];
  protected readonly switchesPhases = true;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Go2Charger is initializing');
    await this.useAccount();

    await this.migrateEnergy();
    await this.migrateChargingCapabilities();
    this.registerCapabilityListeners();

    const pollOffset = Math.floor(Math.random() * 30);
    this.cronTasks.push(
      // Every 30 seconds, offset randomly per device so chargers on the same
      // account don't all hit the API rate limit at the same moment.
      cron.schedule(`${pollOffset},${pollOffset + 30} * * * * *`, () => this.pollValues()),
      cron.schedule('59 * * * * *', () => this.updateDebugLog()), //every minute
      cron.schedule('0 0 7 * * *', () => {
        // 7AM every day
        // Random delay between 0 and 120 seconds
        const jitter = Math.floor(Math.random() * 120000);
        setTimeout(() => this.pollSlowValues(), jitter);
      }),
    );

    // Do initial slow poll at start, we don't know how long ago we read it out.
    this.pollSlowValues();

    this.log('Go2Charger has been initialized');
  }

  /**
   * Migrate energy settings from the old settings format to the new one.
   */
  private async migrateEnergy() {
    const energyConfig = this.getEnergy();

    if (
      energyConfig?.cumulative === true
      || energyConfig?.evCharger !== true
      || energyConfig?.meterPowerImportedCapability !== 'meter_power.signed_meter_value'
    ) {
      this.setEnergy({
        evCharger: true,
        meterPowerImportedCapability: 'meter_power.signed_meter_value',
      }).catch((e) => this.logToDebug(`Failed to migrate energy: ${e}`));
    }
  }

  /**
   * Assign reactions to capability changes triggered by others.
   */
  protected registerCapabilityListeners() {
    this.registerChargingListener();

    this.registerCapabilityListener('cable_permanent_lock', async (value) => {
      if (value) await this.lockCable(true);
      else await this.lockCable(false);
    });

    this.registerCapabilityListener('charging_mode', async (value) => {
      await this.setInstallationChargingMode(Number(value) as Feature);
    });

    this.registerCapabilityListener('available_installation_current', async (value) => {
      await this.setInstallationAvailableCurrent(value, value, value);
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Go2Charger has been added');

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
    // Allow user to select if they want phase voltage as a capability or not.
    if (changes.changedKeys.some((k) => k === 'showVoltage')) {
      await this.showCapabilities(
        ['measure_voltage.phase1', 'measure_voltage.phase2', 'measure_voltage.phase3'],
        Boolean(changes.newSettings.showVoltage),
      );
    }

    // Allow user to select if they want phase current as a capability or not.
    if (changes.changedKeys.some((k) => k === 'showCurrent')) {
      await this.showCapabilities(
        ['measure_current.phase1', 'measure_current.phase2', 'measure_current.phase3'],
        Boolean(changes.newSettings.showCurrent),
      );
    }

    // Handle changes to authentication requirement
    if (changes.changedKeys.some((k) => k === 'requireAuthentication')) {
      const requireAuthValue = changes.newSettings.requireAuthentication;
      const requireAuth =
        typeof requireAuthValue === 'string' ? requireAuthValue === 'true' : Boolean(requireAuthValue);

      await this.setInstallationAuthenticationRequirement(requireAuth)
        .then(() => this.logToDebug(`Updated authentication requirement to ${requireAuth} via settings`))
        .catch((e) => {
          this.logToDebug(`Failed to update authentication requirement via settings: ${e}`);
          throw e;
        });
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log(`Go2Charger ${this.getName()} was renamed to ${name}`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Go2Charger has been deleted');
    for (const task of this.cronTasks) task.stop();
    (this.homey.app as ZaptecApp).releaseAccount(this.getSetting('username'), this.getData().id);
  }

  /**
   * Poll values from Portal.
   *
   * This is intentionally not async since nothing is catching the errors.
   * We should catch errors inside this function!
   */
  protected pollValues() {
    try {
      // Poll charger info
      this.api
        .getCharger(this.getData().id)
        .then((charger) => this.setSettings({ requireAuthentication: charger.IsAuthorizationRequired }))
        .catch((e) => {
          if (this.handleAuthFailure(e)) return;
          this.logToDebug(`Failed to poll charger info: ${e}`, e);
        });

      // Poll state variables from the API.
      this.api
        .getChargerState(this.getData().id)
        .then(async (states) => {
          for (const state of states) {
            // Wrap each state handling individually so that a single bad state processing
            // doesn't drop all values. It makes the app more usable when it's failing.
            await this.handleState(state).catch((e) =>
              this.logToDebug(`Failed to handle charger state ${state.StateId}: ${e}`),
            );
          }
          this.log(`Polled charger state (${states.length} values)`);
        })
        .catch((e) => {
          if (this.handleAuthFailure(e)) return;
          this.logToDebug(`Failed to poll charger state: ${e}`, e);
        });

      // Poll the available current for the installation.
      // TODO: Is this really necessary? Is it interesting to watch live?
      // It's more likely to be changed by us?
      this.pollInstallationValues().catch((e) => {
        if (this.handleAuthFailure(e)) return;
        this.logToDebug(`Failed to poll available current: ${e}`, e);
      });
    } catch (error) {
      this.logToDebug(`Unexpected error in pollValues: ${error}`);
    }
  }

  /**
   * Poll values which change slowly and thus have a lower refresh rate.
   *
   * E.g. yearly charging consumption.
   */
  protected pollSlowValues() {
    const year = new Date().getFullYear();

    this.api
      .getInstallation(this.getData().installationId)
      .then(async (installation) => {
        // Have we ever seen this guard catch anything?
        if (installation.Id === this.getData().installationId) {
          if (!this.hasCapability('available_installation_current')) {
            await this.addCapability('available_installation_current');
          }

          if (!this.hasCapability('charging_mode')) {
            await this.addCapability('charging_mode');
          }
        }
      })
      .catch(async (e) => {
        if (this.handleAuthFailure(e)) return;

        this.logToDebug(`Failed to poll installation: ${e}`, e);

        if (this.hasCapability('available_installation_current')) {
          await this.removeCapability('available_installation_current').catch((err) =>
            this.logToDebug(`Failed to remove available_installation_current: ${err}`),
          );
        }

        await this.removePowerControl().catch((err) => this.logToDebug(`Failed to remove target power: ${err}`));

        if (this.hasCapability('charging_mode')) {
          await this.removeCapability('charging_mode').catch((err) =>
            this.logToDebug(`Failed to remove charging_mode: ${err}`),
          );
        }
      });

    this.api
      .getChargeHistory({
        ChargerId: this.getData().id,
        From: new Date(year, 0, 1, 0, 0, 1).toJSON(),
        DetailLevel: 0,
        PageSize: 50,
      })
      .then((charges) => {
        const yearlyEnergy = charges?.reduce((sum, charge) => sum + charge.Energy, 0) || 0;
        return this.setCapabilityValue('meter_power', yearlyEnergy);
      })
      .then(() => this.logToDebug(`Got yearly power history`))
      .catch((e) => {
        if (this.handleAuthFailure(e)) return;

        this.logToDebug(`Failed to poll charge history: ${e}`, e);
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
          await this.updateChargeMode(Number(state.ValueAsString) as ChargerOperationMode);
        }
        break;

      // Charger connectivity
      case ApolloDeviceObservation.IsOnline:
        if (state.ValueAsString === '1') await this.setAvailable();
        else await this.setUnavailable('Charger is offline');
        break;

      case ApolloDeviceObservation.CurrentPhase1:
        if (this.hasCapability('measure_current.phase1')) {
          await this.setCapabilityValue('measure_current.phase1', Number(state.ValueAsString));
        }
        break;

      case ApolloDeviceObservation.CurrentPhase2:
        if (this.hasCapability('measure_current.phase2')) {
          await this.setCapabilityValue('measure_current.phase2', Number(state.ValueAsString));
        }
        break;

      case ApolloDeviceObservation.CurrentPhase3:
        if (this.hasCapability('measure_current.phase3')) {
          await this.setCapabilityValue('measure_current.phase3', Number(state.ValueAsString));
        }
        break;

      case ApolloDeviceObservation.VoltagePhase1:
        if (this.hasCapability('measure_voltage.phase1')) {
          await this.setCapabilityValue('measure_voltage.phase1', Number(state.ValueAsString));
        }
        break;

      case ApolloDeviceObservation.VoltagePhase2:
        if (this.hasCapability('measure_voltage.phase2')) {
          await this.setCapabilityValue('measure_voltage.phase2', Number(state.ValueAsString));
        }
        break;

      case ApolloDeviceObservation.VoltagePhase3:
        if (this.hasCapability('measure_voltage.phase3')) {
          await this.setCapabilityValue('measure_voltage.phase3', Number(state.ValueAsString));
        }
        break;

      case ApolloDeviceObservation.TotalChargePower:
        await this.setCapabilityValue('measure_power', Number(state.ValueAsString));
        break;

      case ApolloDeviceObservation.TotalChargePowerSession:
        await this.setCapabilityValue('meter_power.current_session', Number(state.ValueAsString));
        break;

      case ApolloDeviceObservation.Humidity:
        await this.setCapabilityValue('measure_humidity', Number(state.ValueAsString));
        break;

      case ApolloDeviceObservation.TemperatureInternal5:
        await this.setCapabilityValue('measure_temperature', Number(state.ValueAsString));
        break;

      case ApolloDeviceObservation.SmartComputerSoftwareApplicationVersion:
        await this.setSettings({ firmware: state.ValueAsString });
        break;

      // The data for the previous session is JSON stringified into this state
      // variable
      case ApolloDeviceObservation.CompletedSession:
        if (state.ValueAsString) await this.onLastSession(state.ValueAsString);
        break;

      case ApolloDeviceObservation.PermanentCableLock:
        await this.setCapabilityValue('cable_permanent_lock', state.ValueAsString === '1');
        break;

      case ApolloDeviceObservation.SignedMeterValue:
        if (state.ValueAsString) await this.onSignedMeterValue(state.ValueAsString);
        break;

      case ApolloDeviceObservation.CommunicationSignalStrength:
        await this.setCapabilityValue('measure_signal_strength', Number(state.ValueAsString));
        break;

      case ApolloDeviceObservation.CommunicationMode:
        await this.setCapabilityValue('communication_method', state.ValueAsString);
        break;

      case ApolloDeviceObservation.MaxPhases:
        this.chargerMaxPhases = Number(state.ValueAsString);
        break;

      default:
        break;
    }
  }

  /**
   * Poll the available current for the installation.
   */
  protected async pollInstallationValues() {
    if (!this.hasCapability('available_installation_current')) return;

    const info = await this.api.getInstallation(this.getData().installationId).catch(async (e) => {
      if (this.handleAuthFailure(e)) throw e;

      if (
        e instanceof ApiError
        && e.message.indexOf('Unknown object') >= 0
        && this.hasCapability('available_installation_current')
      ) {
        await this.removeCapability('available_installation_current');
        await this.removePowerControl();
      }

      this.logToDebug(`Failed to get installation info when updating available current: ${e}`, e);
      throw e;
    });

    // Update the authentication requirement setting to match the actual value from the installation
    if (info.IsRequiredAuthentication !== undefined) {
      const currentSetting = this.getSetting('requireAuthentication');
      if (currentSetting !== info.IsRequiredAuthentication) {
        this.setSettings({ requireAuthentication: info.IsRequiredAuthentication }).catch((e) =>
          this.logToDebug(`Failed to update requireAuthentication setting: ${e}`),
        );
      }
    }

    // Update the charging mode capability to match the actual value from the installation
    if (info.EnabledFeatures !== undefined) {
      if (info.EnabledFeatures === Feature.None) {
        await this.setCapabilityValue('charging_mode', '0');
      } else if (info.EnabledFeatures === Feature.PowerManagement_Schedule) {
        await this.setCapabilityValue('charging_mode', '16');
      } else if (info.EnabledFeatures === Feature.PowerManagement_Apm) {
        await this.setCapabilityValue('charging_mode', '4');
      }
    }

    const isNumber = (n: number | undefined | null): n is number => n !== undefined && n !== null;
    const maxCurrent = isNumber(info.MaxCurrent) ? info.MaxCurrent : 40;

    // TODO: Should we bring back phase individual installation current?
    const availableCurrent = Math.min(
      isNumber(info.AvailableCurrentPhase1) ? info.AvailableCurrentPhase1 : maxCurrent,
      isNumber(info.AvailableCurrentPhase2) ? info.AvailableCurrentPhase2 : maxCurrent,
      isNumber(info.AvailableCurrentPhase3) ? info.AvailableCurrentPhase3 : maxCurrent,
    );

    await this.setCapabilityValue('available_installation_current', availableCurrent);
    await this.updatePowerLimits(info);
  }

  /**
   * Update the charging state and trigger relevant flow cards
   */
  protected async updateChargeMode(newMode: ChargerOperationMode) {
    // We only consider us charging if we are connected AND charging.
    const charging = newMode === ChargerOperationMode.Connected_Charging;
    await this.setCapabilityValue('evcharger_charging', charging);

    const previousMode = operationModeFor(this.getCapabilityValue('evcharger_charging_state'));

    const previouslyDisconnected =
      previousMode === ChargerOperationMode.Unknown || previousMode === ChargerOperationMode.Disconnected;

    const newModeConnected =
      newMode === ChargerOperationMode.Connected_Requesting
      || newMode === ChargerOperationMode.Connected_Charging
      || newMode === ChargerOperationMode.Connected_Finishing;

    await this.setCapabilityValue('evcharger_charging_state', chargingStateFor(newMode));
    await this.setCapabilityValue('alarm_generic.car_connected', newModeConnected);

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
      await this.homey.flow.getDeviceTriggerCard('go2_charging_starts').trigger(this, tokens);
    }

    // Changed from charging state => Charging stops
    if (previousMode === ChargerOperationMode.Connected_Charging) {
      await this.homey.flow.getDeviceTriggerCard('go2_charging_stops').trigger(this, tokens);
    }

    // Was disconnected and now becomes connected => Car connected
    if (newModeConnected && previouslyDisconnected) {
      await this.homey.flow.getDeviceTriggerCard('go2_car_connects').trigger(this, tokens);
    }

    // Was connected and now becomes disconnected => Car disconnected
    if (!newModeConnected && !previouslyDisconnected) {
      await this.homey.flow.getDeviceTriggerCard('go2_car_disconnects').trigger(this, tokens);
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

      await this.setCapabilityValue('meter_power.last_session', Number(session.Energy));
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

        this.setSettings({ signedMeterValue: formatted })
          .then(() => this.setCapabilityValue('meter_power.signed_meter_value', num))
          .catch((e) => this.logToDebug(`Failed to get OCMF-signed value: ${e}`));
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
  public async setInstallationAvailableCurrent(current1: number, current2: number, current3: number) {
    if (!this.hasCapability('available_installation_current')) {
      throw new Error(this.homey.__('errors.missing_installation_access'));
    }

    return this.api
      .updateInstallation(this.getData().installationId, {
        AvailableCurrentPhase1: current1,
        AvailableCurrentPhase2: current2,
        AvailableCurrentPhase3: current3,
      })
      .then(async () => {
        // Poll new value to see what was actually set
        await this.pollInstallationValues();
        this.logToDebug(`Updated available current`);
        return true;
      })
      .catch((e) => {
        this.logToDebug(`adjustCurrent failure: ${e}`);
        throw new Error(`${this.homey.__('errors.failed_installation_current_update')}: ${e}`);
      });
  }

  /**
   * Adjust the current at which the installation switches from 3-phase to
   * 1-phase charging.
   *
   * @param {number} current - Switch current in Ampere
   */
  public async setInstallationThreeToOnePhaseSwitchCurrent(current: number) {
    if (!this.hasCapability('available_installation_current')) {
      throw new Error(this.homey.__('errors.missing_installation_access'));
    }

    return this.api
      .updateInstallation(this.getData().installationId, { ThreeToOnePhaseSwitchCurrent: current })
      .then(() => {
        this.logToDebug(`Updated 3 to 1-phase switch current`);
        return true;
      })
      .catch((e) => {
        this.logToDebug(`setThreeToOnePhaseSwitchCurrent failure: ${e}`);
        throw new Error(`${this.homey.__('errors.failed_phase_switch_current_update')}: ${e}`);
      });
  }

  public async lockCable(lockCable: boolean) {
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
    if (!this.hasCapability('available_installation_current')) {
      throw new Error(this.homey.__('errors.missing_installation_access'));
    }

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
   * Sends a command to reboot the charger
   *
   * @returns {Promise<boolean>} - true if the operation succeeded
   */
  public async rebootCharger() {
    return this.api
      .sendCommand(this.getData().id, Command.RestartCharger)
      .then(() => true)
      .catch((e) => {
        this.logToDebug(`rebootCharger failure: ${e}`);
        throw new Error(`Failed to reboot charger: ${e}`);
      });
  }

  /**
   * Sets the charging mode for the installation
   *
   * @param {Feature} chargingMode - the charging mode to set
   * @returns {Promise<boolean>} - true if the operation succeeded
   */
  public async setInstallationChargingMode(chargingMode: Feature) {
    if (!this.hasCapability('available_installation_current')) {
      throw new Error(this.homey.__('errors.missing_installation_access'));
    }

    return this.api
      .updateInstallationProperties(this.getData().installationId, { EnabledFeatures: chargingMode })
      .then(() => {
        this.logToDebug(`Updated charging mode to ${chargingMode}`);
        return true;
      })
      .catch((e) => {
        this.logToDebug(`setInstallationChargingMode failure: ${e}`);
        throw new Error(`${this.homey.__('errors.failed_charging_mode_update')}: ${e}`);
      });
  }
}

module.exports = Go2Charger;
