import Homey from 'homey';
import { chargerOperationModeFromStr, Command, ZaptecApi } from './zaptec';
import { chargingStateFor, isCharging, isCommandRejected, whyResumeWasRejected } from './zaptec/charging';
import { InvalidCredentialsError, MissingCredentialsError } from './zaptec/error';
import { InstallationModel } from './zaptec/models';
import { currentForPower, PowerLimits, powerLimits, targetPowerOptions } from './zaptec/power';
import type { ZaptecApp } from '../app';

/**
 * What every Zaptec charger device shares: the account's API client, the
 * debug log and handling of rejected or missing credentials.
 */
export abstract class ZaptecDevice extends Homey.Device {
  protected debugLog: string[] = [];
  protected api!: ZaptecApi;
  private credentialsRejected = false;

  /** MaxPhases from the charger state, if the charger reports it */
  protected chargerMaxPhases?: number;
  private powerLimits?: PowerLimits;
  /** Per-phase current last set for target_power, so setpoints that don't change it aren't sent */
  private targetCurrent?: number;

  /** Whether the model charges on one phase below the installation's switch current */
  protected abstract readonly switchesPhases: boolean;

  protected abstract pollValues(): void;
  protected abstract pollSlowValues(): void;
  public abstract setInstallationAvailableCurrent(
    current1: number,
    current2: number,
    current3: number,
  ): Promise<boolean>;

  /**
   * Add or remove capabilities, leaving the ones already as wanted alone so
   * this is safe to call on every start.
   */
  protected async showCapabilities(capabilities: string[], show: boolean) {
    for (const cap of capabilities) {
      if (show && !this.hasCapability(cap)) await this.addCapability(cap);
      if (!show && this.hasCapability(cap)) await this.removeCapability(cap);
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
   * Handle a request failing because the credentials were rejected or are
   * missing.
   *
   * The device becomes unavailable and the failure is logged once, until new
   * credentials are set through repair.
   *
   * @returns {boolean} - true if the error was a rejected or missing login
   */
  protected handleAuthFailure(e: unknown): boolean {
    const missing = e instanceof MissingCredentialsError;
    if (!missing && !(e instanceof InvalidCredentialsError)) return false;
    if (this.credentialsRejected) return true;

    this.credentialsRejected = true;
    this.logToDebug(
      missing
        ? `No credentials stored for this account, repair the device to log in`
        : `Zaptec rejected the credentials, repair the device to update them: ${e.message}`,
    );
    const reason = missing ? 'errors.missing_credentials' : 'errors.authentication_failed';
    this.setUnavailable(this.homey.__(reason)).catch((err) => this.error('Failed to mark device unavailable', err));
    return true;
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

  /**
   * Push a logline onto the debug log visible to user
   *
   * @param {string} line - Line to log
   * @param {unknown} error - Error to print in full to the app log
   */
  protected logToDebug(line: string, error?: unknown) {
    this.debugLog.push(`[${new Date().toJSON()}] ${line}`);
    if (this.debugLog.length > 50) this.debugLog.shift();
    // The debug log stays one line, the app log gets the stack and cause
    if (error === undefined) this.log(line);
    else this.log(line, error);
  }

  /**
   * Push current cache of debug log into the device settings view.
   *
   * This makes it visible to the user, but we don't want to constantly
   * push data to the Homey settings module. We should trigger this function
   * periodically.
   */
  protected updateDebugLog() {
    this.setSettings({ log: this.debugLog.join('\n') }).catch((e) => this.error('Failed to update debug log', e));
  }

  /**
   * Connect to the shared client for this device's account.
   *
   * Pairing and older app versions put the password in the device settings.
   * It is moved to the account store so it lives in one place.
   */
  protected async useAccount() {
    const app = this.homey.app as ZaptecApp;
    const username = this.getSetting('username');
    const password = this.getSetting('password');
    if (password) {
      app.setAccount(username, password);
      await this.setSettings({ password: '' });
    }

    this.api = app.getApi(username);
  }

  /**
   * Re-authenticate the device with new credentials
   * Used during repair process when credentials are updated
   */
  public async reAuthenticate() {
    await this.useAccount();
    this.log('Device credentials updated');
    this.credentialsRejected = false;
    await this.setAvailable();
    this.pollValues();
    this.pollSlowValues();
  }
}
