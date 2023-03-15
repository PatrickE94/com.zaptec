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
    this.log('GoCharger has been initialized');
    this.api = new ZaptecApi();
    this.renewToken();

    await this.api.authenticate(
      this.getSetting('username'),
      this.getSetting('password'),
    );

    if (this.hasCapability('available_installation_current.phase1'))
      await this.removeCapability('available_installation_current.phase1');

    if (this.hasCapability('available_installation_current.phase2'))
      await this.removeCapability('available_installation_current.phase2');

    if (this.hasCapability('available_installation_current.phase3'))
      await this.removeCapability('available_installation_current.phase3');

    if (!this.hasCapability('available_installation_current'))
      await this.addCapability('available_installation_current');

    if (this.hasCapability('meter_power'))
      await this.removeCapability('meter_power');

    if (!this.hasCapability('meter_power.last_session'))
      await this.addCapability('meter_power.last_session');

    if (!this.hasCapability('meter_power.this_year'))
      await this.addCapability('meter_power.this_year');

    if (this.hasCapability('onoff')) await this.removeCapability('onoff');

    if (!this.hasCapability('charging_button'))
      await this.addCapability('charging_button');

    if (!this.hasCapability('meter_power.current_session'))
      await this.addCapability('meter_power.current_session');

    // TODO: Should we make this dynamic? Poll more frequently during charging?
    this.cronTasks.push(cron.schedule('0,30 * * * * *', () => this.pollValues()));
    this.cronTasks.push(cron.schedule('59 * * * * *', () => this.updateDebugLog()));
    this.cronTasks.push(cron.schedule('0 0 7 * * * *', () => this.pollSlowValues()));

    this.registerCapabilityListeners();

    // Do initial slow poll
    this.pollSlowValues();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('GoCharger has been added');
    this.pollValues(); // Trigger initial poll to make it look nice immediately!
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
    this.log('GoCharger settings where changed: ', JSON.stringify(changes));

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

  protected renewToken() {
    if (this.api === undefined) {
      if (this.tokenRenewalTimeout === undefined) {
        // retry in 30 seconds
        this.tokenRenewalTimeout = setTimeout(this.renewToken.bind(this), 30);
      }

      this.logToDebug(`API class not created`);
      return;
    }

    clearTimeout(this.tokenRenewalTimeout);
    this.tokenRenewalTimeout = undefined;

    this.api
      ?.authenticate(this.getSetting('username'), this.getSetting('password'))
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
        this.tokenRenewalTimeout = setTimeout(this.renewToken.bind(this), 30_000);
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
  }

  protected pollSlowValues() {
    if (this.api === undefined) return;
    const year = new Date().getFullYear();

    this.api
      .getChargeHistory({
        ChargerId: this.getData().id,
        From: new Date(year, 0, 1, 0, 0, 1).toJSON(),
        DetailLevel: 0,
        PageSize: 5000,
      })
      .then((charges) => {
        const yearlyEnergy =
          charges.Data?.reduce((sum, charge) => sum + charge.Energy, 0) || 0;
        return this.setCapabilityValue('meter_power.this_year', yearlyEnergy);
      })
      .then(() => {
        this.logToDebug(`Got yearly power history`);
      })
      .catch((e) => {
        this.logToDebug(`Failed to poll charge history: ${e}`);
      });
  }

  protected async handleState(state: ChargerStateModel) {
    switch (state.StateId) {
      case ApolloDeviceObservation.ChargerOperationMode:
        if (state.ValueAsString !== undefined && state.ValueAsString !== null) {
          await this.updateChargeMode(
            Number(state.ValueAsString) as ChargerOperationMode,
          );
        }
        break;

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

      case ApolloDeviceObservation.CompletedSession:
        if (state.ValueAsString) await this.onLastSession(state.ValueAsString);
        break;

      /* Lifetime measurement
      case ApolloDeviceObservation.SignedMeterValue:
        if (state.ValueAsString?.startsWith('OCMF')) {
          try {
            const mv = JSON.parse(state.ValueAsString.substring(5));
            if ('RD' in mv && 'RV' in mv.RD[0])
              await this.setCapabilityValue('meter_power.lifetime', mv.RD[0].RV);
          } catch (e) {
            this.logToDebug(`Failed to extract meter value: ${e}`);
          }
        }
        break;
      */

      case ApolloDeviceObservation.DetectedCar:
        await this.setCapabilityValue(
          'car_connected',
          state.ValueAsString === '1',
        );
        await this.homey.flow
          .getDeviceTriggerCard(
            state.ValueAsString === '1' ? 'car_connects' : 'car_disconnects',
          )
          .trigger(this, {
            charging:
              this.getCapabilityValue('charge_mode') ===
              chargerOperationModeStr(ChargerOperationMode.Connected_Charging),
            car_connected: this.getCapabilityValue('car_connected'),
            current_limit: this.getCapabilityValue('available_installation_current'),
          });
        break;

      case ApolloDeviceObservation.SessionIdentifier:
        await this.setStoreValue('active_session_id', state.ValueAsString);
        break;

      default:
        break;
    }
  }

  /**
   * Poll values from Portal.
   *
   * This is intentionally not async since nothing is catching the errors.
   * We should catch errors inside this function!
   */
  protected pollValues() {
    if (this.api === undefined) return;

    this.api
      .getChargerState(this.getData().id)
      .then(async (states) => {
        for (const state of states) {
          try {
            await this.handleState(state);
          } catch (e) {
            this.logToDebug(`Failed to handle charger state: ${e}`);
          }
        }
        this.logToDebug(`Updated charger state`);
      })
      .catch((e) => {
        this.logToDebug(`Failed to poll charger state: ${e}`);
      });

    this.updateAvailableCurrent().catch((e) => {
      this.logToDebug(`Failed to poll available current: ${e}`);
    });
  }

  public async setInstallationAvailableCurrent(
    current1: number,
    current2: number,
    current3: number,
  ) {
    return this.api
      ?.updateInstallation(this.getData().installationId, {
        AvailableCurrentPhase1: current1,
        AvailableCurrentPhase2: current2,
        AvailableCurrentPhase3: current3,
      })
      .then(async () => {
        // Update capability values to see what was set
        await this.updateAvailableCurrent();
        this.logToDebug(`Updated available current`);
        return true;
      })
      .catch((e) => {
        this.logToDebug(`adjustCurrent failure: ${e}`);
        throw new Error(`Failed to adjust current: ${e}`);
      });
  }

  public async startCharging() {
    // TODO: Send different command if it has old firmware
    return this.api
      ?.sendCommand(this.getData().id, Command.ResumeCharging)
      .then(() => true)
      .catch((e) => {
        this.logToDebug(`startCharging failure: ${e}`);
        throw new Error(`Failed to turn on the charger: ${e}`);
      });
  }

  public async stopCharging() {
    // TODO: Send different command if it has old firmware
    return this.api
      ?.sendCommand(this.getData().id, Command.StopChargingFinal)
      .then(() => true)
      .catch((e) => {
        this.logToDebug(`stopCharging failure: ${e}`);
        throw new Error(`Failed to turn off the charger: ${e}`);
      });
  }

  /**
   * Update the charge_mode capability and trigger relevant flow cards
   */
  protected async updateChargeMode(newMode: ChargerOperationMode) {
    await this.setCapabilityValue(
      'charging_button',
      newMode === ChargerOperationMode.Connected_Charging ||
        newMode === ChargerOperationMode.Connected_Requesting ||
        newMode === ChargerOperationMode.Connected_Finishing,
    );

    const previousMode = chargerOperationModeFromStr(
      this.getCapabilityValue('charge_mode'),
    );
    if (previousMode === newMode) return; // No-op
    await this.setCapabilityValue(
      'charge_mode',
      chargerOperationModeStr(newMode),
    );

    const tokens = {
      charging: newMode === ChargerOperationMode.Connected_Charging,
      car_connected: this.getCapabilityValue('car_connected'),
      current_limit: this.getCapabilityValue('available_installation_current'),
    };

    // Car connects
    if (
      newMode !== ChargerOperationMode.Unknown &&
      newMode !== ChargerOperationMode.Disconnected &&
      (previousMode === ChargerOperationMode.Disconnected ||
        previousMode === ChargerOperationMode.Unknown)
    ) {
      await this.homey.flow
        .getDeviceTriggerCard('car_connects')
        .trigger(this, tokens);
    }

    // Car disconnects
    if (
      newMode === ChargerOperationMode.Disconnected &&
      previousMode !== ChargerOperationMode.Disconnected
    ) {
      await this.homey.flow
        .getDeviceTriggerCard('car_disconnects')
        .trigger(this, tokens);
    }

    // Charging starts
    if (
      newMode === ChargerOperationMode.Connected_Charging &&
      previousMode !== ChargerOperationMode.Connected_Charging
    ) {
      await this.homey.flow
        .getDeviceTriggerCard('charging_starts')
        .trigger(this, tokens);
    }

    // Charging stops
    if (
      newMode !== ChargerOperationMode.Connected_Charging &&
      previousMode === ChargerOperationMode.Connected_Charging
    ) {
      await this.homey.flow
        .getDeviceTriggerCard('charging_stops')
        .trigger(this, tokens);
    }
  }

  protected async updateAvailableCurrent() {
    if (this.api === undefined) return;
    const info = await this.api
      .getInstallation(this.getData().installationId)
      .catch((e) => {
        this.logToDebug(
          `Failed to get installation info when updating available current: ${e}`,
        );
        throw e;
      });
    const availableCurrent = Math.min(
      info.AvailableCurrentPhase1 || 40,
      info.AvailableCurrentPhase2 || 40,
      info.AvailableCurrentPhase3 || 40,
      info.MaxCurrent || 40,
    );

    await this.setCapabilityValue(
      'available_installation_current',
      availableCurrent,
    );
  }

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

      await this.setCapabilityValue('meter_power.last_session', session.Energy);
    } catch (e) {
      this.logToDebug(`onLastSession fail: ${e}`);
    }
  }

  protected logToDebug(line: string) {
    this.debugLog.push(`[${new Date().toJSON()}] ${line}`);
    if (this.debugLog.length > 50) this.debugLog.shift();
    this.log(line);
  }

  protected updateDebugLog() {
    this.setSettings({ log: this.debugLog.join('\n') }).catch((e) =>
      this.error('Failed to update debug log', e),
    );
  }
}

module.exports = GoCharger;
