import Homey from 'homey';
import {
  ZaptecApi,
  SmartDeviceObservations,
  Command,
} from '../../lib/ZaptecApi';

export class GoCharger extends Homey.Device {
  private pollInterval?: NodeJS.Timer;
  private api?: ZaptecApi;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('GoCharger has been initialized');
    this.api = new ZaptecApi();

    await this.api.authenticate(
      this.getSetting('username'),
      this.getSetting('password'),
    );

    // TODO: Should we make this dynamic? Poll more frequently during charging?
    this.pollInterval = setInterval(() => this.pollValues(), 30_000);

    this.registerCapabilityListeners();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('GoCharger has been added');
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
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(_name: string) {
    this.log('GoCharger was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('GoCharger has been deleted');
    clearInterval(this.pollInterval);
  }

  /**
   * Assign reactions to capability changes triggered by others.
   */
  protected registerCapabilityListeners() {
    this.registerCapabilityListener('onoff', async (value) => {
      if (value) await this.startCharging();
      else await this.stopCharging();
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

    this.api
      .getChargerState(this.getData().id)
      .then(async (states) => {
        for (const state of states) {
          switch (state.stateId) {
            case SmartDeviceObservations.ChargeMode:
              await this.setCapabilityValue('charge_mode', state.valueAsString);
              // TODO: Trigger cards
              break;

            case SmartDeviceObservations.DetectedCar:
              await this.setCapabilityValue(
                'car_connected',
                state.valueAsString === 'true',
              );
              await this.homey.flow
                .getDeviceTriggerCard(
                  state.valueAsString === 'true'
                    ? 'car_connects'
                    : 'car_disconnects',
                )
                .trigger(this);
              break;

            default:
              break;
          }
        }
      })
      .catch((e) => {
        this.log(`Failed to poll ${e}`);
      });

    this.api
      .getCharger(this.getData().id)
      .then(async (charger) => {
        await this.setCapabilityValue('onoff', charger.active);
        // TODO: Add more?
      })
      .catch((e) => {
        this.log(`Failed to poll ${e}`);
      });
  }

  public async setInstallationAvailableCurrent(
    current1: number,
    current2: number,
    current3: number,
  ) {
    return this.api
      ?.updateInstallation(this.getData().installationId, {
        availableCurrentPhase1: current1,
        availableCurrentPhase2: current2,
        availableCurrentPhase3: current3,
      })
      .then(async () => {
        await this.setCapabilityValue('available_installation_current.phase1', current1);
        await this.setCapabilityValue('available_installation_current.phase2', current2);
        await this.setCapabilityValue('available_installation_current.phase3', current3);
        return true;
      })
      .catch((e) => {
        throw new Error(`Failed to adjust current: ${e}`);
      });
  }

  public async startCharging() {
    return this.api
      ?.sendCommand(this.getData().id, Command.StartCharging)
      .then(() => true)
      .catch((e) => {
        throw new Error(`Failed to turn on the charger: ${e}`);
      });
  }

  public async stopCharging() {
    return this.api
      ?.sendCommand(this.getData().id, Command.StopCharging)
      .then(() => true)
      .catch((e) => {
        throw new Error(`Failed to turn off the charger: ${e}`);
      });
  }

  public async pauseCharging() {
    return this.api
      ?.sendCommand(this.getData().id, Command.PauseCharging)
      .then(() => true)
      .catch((e) => {
        throw new Error(`Failed to pause charging: ${e}`);
      });
  }

  public async resumeCharging() {
    return this.api
      ?.sendCommand(this.getData().id, Command.ResumeCharging)
      .then(() => true)
      .catch((e) => {
        throw new Error(`Failed to resume charging: ${e}`);
      });
  }
}

module.exports = GoCharger;
