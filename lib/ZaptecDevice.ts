import { chargerOperationModeFromStr, Command } from './zaptec';
import { chargingStateFor, isCharging, isCommandRejected, whyResumeWasRejected } from './zaptec/charging';
import {
  archivedYear,
  ArchivedYear,
  chargerSessions,
  ChargerSessions,
  liveMeter,
  MeterSession,
  yearlyEnergy,
} from './zaptec/energy';
import { ChargerStateModel, InstallationModel } from './zaptec/models';
import { currentForPower, PowerLimits, powerLimits, targetPowerOptions } from './zaptec/power';
import { ZaptecAccountDevice } from './ZaptecAccountDevice';

/** The meter Homey Energy reads, moving while charging */
const LIVE_METER = 'meter_power.charged';
const SIGNED_METER = 'meter_power.signed_meter_value';

/**
 * What every Zaptec charger device shares: starting, stopping and steering
 * charging on top of the account handling.
 */
export abstract class ZaptecDevice extends ZaptecAccountDevice {
  /** MaxPhases from the charger state, if the charger reports it */
  protected chargerMaxPhases?: number;
  private powerLimits?: PowerLimits;
  /** Per-phase current last set for target_power, so setpoints that don't change it aren't sent */
  private targetCurrent?: number;

  /** This year's archived sessions, once fetched */
  private archived?: ArchivedYear;
  /** The sessions in the last charger state */
  private sessions: ChargerSessions = { energy: new Map() };
  /** What the archive was last fetched again for, so it's fetched once per completed session */
  private refetchedFor?: string;

  /** Whether the model charges on one phase below the installation's switch current */
  protected abstract readonly switchesPhases: boolean;

  protected abstract pollSlowValues(): void;
  public abstract setInstallationAvailableCurrent(
    current1: number,
    current2: number,
    current3: number,
  ): Promise<boolean>;

  /**
   * Point Homey Energy at the live meter, starting it from the signed meter
   * so Energy sees no jump.
   */
  protected async migrateEnergy() {
    if (!this.hasCapability(LIVE_METER)) {
      await this.addCapability(LIVE_METER);

      const signed = this.getCapabilityValue(SIGNED_METER);
      if (typeof signed === 'number') await this.setCapabilityValue(LIVE_METER, signed);
    }

    const energyConfig = this.getEnergy();
    if (
      energyConfig?.cumulative === true
      || energyConfig?.evCharger !== true
      || energyConfig?.meterPowerImportedCapability !== LIVE_METER
    ) {
      await this.setEnergy({ evCharger: true, meterPowerImportedCapability: LIVE_METER }).catch((e) =>
        this.logToDebug(`Failed to migrate energy: ${e}`),
      );
    }
  }

  /**
   * Replace our own charging capabilities with Homey's EV charger ones, which
   * come with Homey's flow cards and are what Homey Energy reads.
   */
  protected async migrateChargingCapabilities() {
    if (this.hasCapability('charging_button')) {
      await this.removeCapability('charging_button');
    }

    if (!this.hasCapability('evcharger_charging')) {
      await this.addCapability('evcharger_charging');
    }

    if (!this.hasCapability('evcharger_charging_state')) {
      // Carry the mode over so the first poll doesn't trigger flows for a change that didn't happen
      const mode = chargerOperationModeFromStr(this.getCapabilityValue('charge_mode'));
      await this.addCapability('evcharger_charging_state');
      await this.setCapabilityValue('evcharger_charging_state', chargingStateFor(mode));
    }

    if (this.hasCapability('charge_mode')) {
      await this.removeCapability('charge_mode');
    }
  }

  /**
   * Start, stop and steer charging from Homey's EV charger capabilities.
   *
   * A flow setting the target power changes all three at once, so they're
   * handled as one change.
   */
  protected registerChargingListener() {
    this.registerMultipleCapabilityListener(
      ['evcharger_charging', 'target_power', 'target_power_mode'],
      async ({ evcharger_charging, target_power, target_power_mode }) => {
        if (target_power_mode === 'device') await this.releasePowerControl();

        if (evcharger_charging === false) {
          await this.stopCharging();
          return;
        }

        const mode = target_power_mode ?? this.getCapabilityValue('target_power_mode');
        const power = target_power ?? this.getCapabilityValue('target_power');
        const changed = target_power !== undefined || target_power_mode === 'homey';
        if (mode === 'homey' && changed && power !== null) await this.applyTargetPower(power);

        if (evcharger_charging === true) await this.startCharging();
      },
      500,
    );
  }

  /**
   * Set the installation's available current to charge at no more than `watts`.
   *
   * The current from before Homey took over is kept, to restore when it hands
   * control back.
   */
  private async applyTargetPower(watts: number) {
    if (!this.powerLimits) throw new Error(this.homey.__('errors.target_power_unknown_limits'));

    const current = currentForPower(watts, this.powerLimits);
    if (current === 0) {
      await this.stopCharging();
      return;
    }

    if (current === this.targetCurrent) return;

    const previous = this.getCapabilityValue('available_installation_current');
    if (!this.getStoreValue('currentBeforeHomey') && previous) {
      await this.setStoreValue('currentBeforeHomey', previous);
    }

    await this.setInstallationAvailableCurrent(current, current, current);
    this.targetCurrent = current;
    this.logToDebug(`Target power ${watts} W set the available current to ${current} A`);
  }

  /**
   * Restore the available current from before Homey took over.
   */
  private async releasePowerControl() {
    this.targetCurrent = undefined;

    const previous = this.getStoreValue('currentBeforeHomey');
    if (!previous) return;

    await this.setInstallationAvailableCurrent(previous, previous, previous);
    await this.unsetStoreValue('currentBeforeHomey');
    this.logToDebug(`Restored the available current to ${previous} A`);
  }

  /**
   * Keep the target power range in line with the installation and charger.
   *
   * Only called with installation access, which target power needs.
   */
  protected async updatePowerLimits(installation: InstallationModel) {
    if (!this.hasCapability('target_power')) {
      await this.addCapability('target_power');
    }

    if (!this.hasCapability('target_power_mode')) {
      await this.addCapability('target_power_mode');
      await this.setCapabilityValue('target_power_mode', 'device');
    }

    this.powerLimits = powerLimits(installation, this.chargerMaxPhases, this.switchesPhases);

    // Changing options is expensive, only do it when the range changes
    const options = targetPowerOptions(this.powerLimits);
    const current = this.targetPowerOptions();
    if (Object.entries(options).every(([key, value]) => current[key] === value)) return;

    await this.setCapabilityOptions('target_power', options);
    this.logToDebug(
      `Target power range ${options.min}-${options.max} W for ${this.powerLimits.phases} phase(s), `
        + `MaxPhases ${this.chargerMaxPhases === undefined ? 'not read yet' : this.chargerMaxPhases}`,
    );
  }

  private targetPowerOptions(): Record<string, unknown> {
    try {
      return this.getCapabilityOptions('target_power');
    } catch {
      // Homey throws until the device has options of its own
      return {};
    }
  }

  /**
   * Remove target power when the installation can't be controlled.
   */
  protected async removePowerControl() {
    for (const capability of ['target_power', 'target_power_mode']) {
      if (this.hasCapability(capability)) {
        await this.removeCapability(capability);
      }
    }
  }

  /**
   * Fetch this year's archived sessions, the base of this year's energy.
   */
  protected pollYearlyEnergy() {
    const year = new Date().getFullYear();

    this.api
      .getArchivedSessions({
        ChargerId: this.getData().id,
        From: new Date(year, 0, 1, 0, 0, 1).toJSON(),
        To: new Date().toJSON(),
      })
      .then((sessions) => {
        this.archived = archivedYear(year, sessions);
        this.logToDebug(`Got yearly power history`);
        return this.updateYearlyEnergy();
      })
      .catch((e) => {
        if (this.handleAuthFailure(e)) return;

        this.logToDebug(`Failed to poll charge history: ${e}`, e);
      });
  }

  /**
   * Add the sessions in the charger state that aren't archived yet to this
   * year's energy, so it grows while charging instead of once a day.
   */
  protected async trackSessions(states: ChargerStateModel[]) {
    const year = new Date().getFullYear();
    this.sessions = chargerSessions(states, year);
    await this.updateLiveMeter();
    if (!this.archived) return;

    // The archive has a session once it completes, and starts over each year
    const { completed } = this.sessions;
    const stale = this.archived.year !== year || (completed !== undefined && !this.archived.ids.has(completed));
    const key = `${year}:${completed}`;
    if (stale && this.refetchedFor !== key) {
      this.refetchedFor = key;
      this.pollYearlyEnergy();
    }

    await this.updateYearlyEnergy();
  }

  private async updateLiveMeter() {
    const previous = this.getCapabilityValue(LIVE_METER);
    const signed = this.getCapabilityValue(SIGNED_METER);
    // Without a reading to start from, the meter would start at zero
    if (typeof previous !== 'number' && typeof signed !== 'number') return;

    const saved: MeterSession | null = this.getStoreValue('meterSession');
    const { value, session } = liveMeter(
      typeof previous === 'number' ? previous : signed,
      typeof signed === 'number' ? signed : undefined,
      saved ?? undefined,
      this.sessions,
    );

    if (session?.id !== saved?.id) await this.setStoreValue('meterSession', session ?? null);
    await this.setCapabilityValue(LIVE_METER, Math.round(value * 1000) / 1000);
  }

  private async updateYearlyEnergy() {
    // Last year's archive would count this year's sessions on top of it
    if (!this.archived || this.archived.year !== new Date().getFullYear()) return;

    const energy = Math.round(yearlyEnergy(this.archived, this.sessions) * 1000) / 1000;
    await this.setCapabilityValue('meter_power', energy);
  }

  /**
   * Send command to resume a paused charging session.
   *
   * Zaptec has no command to start a new session, so when it rejects the
   * resume we read the charger state to tell the user why.
   */
  public async startCharging() {
    try {
      // TODO: Send different command if it has old firmware
      await this.api.sendCommand(this.getData().id, Command.ResumeCharging);
      return true;
    } catch (e) {
      const states = await this.stateAfterRejection(e);
      const reason = states && whyResumeWasRejected(states);
      if (reason === 'charging') {
        this.logToDebug(`Resume rejected, the charger is already charging`);
        return true;
      }

      this.logToDebug(`startCharging failure: ${e}`, e);
      if (reason === undefined) throw new Error(`Failed to turn on the charger: ${e}`);
      throw new Error(
        `${this.homey.__('errors.failed_resume_charging')}: ${this.homey.__(`errors.resume_${reason}`)}`,
        { cause: e },
      );
    }
  }

  /**
   * Send command to pause an ongoing charging session.
   */
  public async stopCharging() {
    try {
      // TODO: Send different command if it has old firmware
      await this.api.sendCommand(this.getData().id, Command.StopChargingFinal);
      return true;
    } catch (e) {
      const states = await this.stateAfterRejection(e);
      if (states && !isCharging(states)) {
        this.logToDebug(`Pause rejected, the charger is not charging`);
        return true;
      }

      this.logToDebug(`stopCharging failure: ${e}`, e);
      throw new Error(`Failed to turn off the charger: ${e}`);
    }
  }

  /**
   * Read the charger state after Zaptec rejected a command for it.
   *
   * @returns undefined if the command failed for another reason, or the
   * state can't be read either
   */
  private async stateAfterRejection(e: unknown) {
    if (!isCommandRejected(e)) return undefined;
    try {
      return await this.api.getChargerState(this.getData().id);
    } catch (stateError) {
      this.logToDebug(`Failed to read state after rejected command: ${stateError}`, stateError);
      return undefined;
    }
  }
}
