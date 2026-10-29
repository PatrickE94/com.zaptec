import cron from 'node-cron';
import { SenseObservation } from '../../lib/zaptec';
import { ChargerStateModel } from '../../lib/zaptec/models';
import { LOGGED_SENSE_OBSERVATIONS, senseCapabilityValue } from '../../lib/zaptec/sense';
import type { ZaptecApp } from '../../app';
import { ZaptecAccountDevice } from '../../lib/ZaptecAccountDevice';

const METER_CAPABILITIES = ['meter_power.imported', 'meter_power.exported'];

/**
 * A Zaptec Sense, measuring the building's grid connection.
 *
 * Written without access to a Sense, from the observations Zaptec lists for
 * APM devices. The first poll logs what it reports so testers can share it.
 */
export class Sense extends ZaptecAccountDevice {
  private cronTasks: cron.ScheduledTask[] = [];
  private loggedObservations = false;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Sense is initializing');
    await this.useAccount();

    const pollOffset = Math.floor(Math.random() * 30);
    this.cronTasks.push(
      // Every 30 seconds, offset randomly per device so devices on the same
      // account don't all hit the API rate limit at the same moment.
      cron.schedule(`${pollOffset},${pollOffset + 30} * * * * *`, () => this.pollValues()),
      cron.schedule('59 * * * * *', () => this.updateDebugLog()), //every minute
    );

    this.pollValues();

    this.log('Sense has been initialized');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Sense has been deleted');
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
    this.api
      .getChargerState(this.getData().id)
      .then(async (states) => {
        if (!this.loggedObservations) await this.onFirstStates(states);

        for (const state of states) {
          // Wrap each state handling individually so that a single bad state processing
          // doesn't drop all values. It makes the app more usable when it's failing.
          await this.handleState(state).catch((e) =>
            this.logToDebug(`Failed to handle Sense state ${state.StateId}: ${e}`),
          );
        }
        this.log(`Polled Sense state (${states.length} values)`);
      })
      .catch((e) => {
        if (this.handleAuthFailure(e)) return;
        this.logToDebug(`Failed to poll Sense state: ${e}`, e);
      });
  }

  /**
   * Log what the Sense reports, and drop the meter totals if it has none.
   *
   * Only a Sense on a HAN port reads the meter's totals, one with current
   * clamps measures power alone.
   */
  private async onFirstStates(states: ChargerStateModel[]) {
    this.loggedObservations = true;

    const logged = states
      .filter((s) => LOGGED_SENSE_OBSERVATIONS.includes(s.StateId as SenseObservation))
      .map((s) => `${s.StateName ?? s.StateId}=${s.ValueAsString}`);
    this.logToDebug(`Sense reports ${states.length} values: ${logged.join(', ')}`);

    const hasMeter = states.some((s) => s.StateId === SenseObservation.AMSCumulativeEnergyImport);
    await this.showCapabilities(METER_CAPABILITIES, hasMeter);

    const energy = hasMeter
      ? {
          cumulative: true,
          cumulativeImportedCapability: 'meter_power.imported',
          cumulativeExportedCapability: 'meter_power.exported',
        }
      : { cumulative: true };
    if (this.getEnergy()?.cumulativeImportedCapability !== energy.cumulativeImportedCapability) {
      await this.setEnergy(energy);
    }
  }

  /**
   * Perform the correct action for each interesting Sense state variable.
   *
   * @param {ChargerStateModel} state - The state variable polled from the Sense.
   */
  protected async handleState(state: ChargerStateModel) {
    switch (state.StateId) {
      case SenseObservation.IsOnline:
        if (state.ValueAsString === '1') await this.setAvailable();
        else await this.setUnavailable('Sense is offline');
        return;

      case SenseObservation.CommunicationMode:
        await this.setCapabilityValue('communication_method', state.ValueAsString);
        return;

      case SenseObservation.SoftwareApplicationVersion:
        await this.setSettings({ firmware: state.ValueAsString ?? '' });
        return;

      case SenseObservation.MeterType:
        await this.setSettings({ meterType: state.ValueAsString ?? '' });
        return;

      default: {
        const reading = senseCapabilityValue(state);
        if (reading && this.hasCapability(reading.capability)) {
          await this.setCapabilityValue(reading.capability, reading.value);
        }
      }
    }
  }
}

module.exports = Sense;
