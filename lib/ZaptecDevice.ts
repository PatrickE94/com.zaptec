import Homey from 'homey';
import { Command, ZaptecApi } from './zaptec';
import { isCharging, isCommandRejected, whyResumeWasRejected } from './zaptec/charging';
import { InvalidCredentialsError, MissingCredentialsError } from './zaptec/error';
import type { ZaptecApp } from '../app';

/**
 * What every Zaptec charger device shares: the account's API client, the
 * debug log and handling of rejected or missing credentials.
 */
export abstract class ZaptecDevice extends Homey.Device {
  protected debugLog: string[] = [];
  protected api!: ZaptecApi;
  private credentialsRejected = false;

  protected abstract pollValues(): void;
  protected abstract pollSlowValues(): void;

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
