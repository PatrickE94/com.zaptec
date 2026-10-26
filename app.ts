import sourceMapSupport from 'source-map-support';
import { App } from 'homey';
import * as appJson from './app.json';
import { ZaptecApi } from './lib/zaptec';

sourceMapSupport.install();

/** homey.settings key holding { [username]: password } for every account */
const ACCOUNTS = 'accounts';

export class ZaptecApp extends App {
  private clients = new Map<string, ZaptecApi>();

  /**
   * onInit is called when the app is initialized.
   */
  async onInit(): Promise<void> {
    this.log('ZaptecApp is initializing...');

    const { version: firmwareVersion } = this.homey;
    const { version: appVersion } = appJson;

    this.log(`firmwareVersion: ${firmwareVersion}`);
    this.log(`appVersion: ${appVersion}`);
  }

  /**
   * Save the password for an account. A client already shared by devices on
   * the account uses it from the next request.
   */
  setAccount(username: string, password: string) {
    const accounts = this.homey.settings.get(ACCOUNTS) ?? {};
    this.homey.settings.set(ACCOUNTS, { ...accounts, [username]: password });
    this.clients.get(username)?.setCredentials(username, password);
  }

  /**
   * The client shared by every device on an account.
   */
  getApi(username: string): ZaptecApi {
    let api = this.clients.get(username);
    if (api !== undefined) return api;

    api = new ZaptecApi(this.homey.manifest.version, this.homey);
    // Without a stored password requests fail until the account is repaired
    const password = this.homey.settings.get(ACCOUNTS)?.[username];
    if (password !== undefined) api.setCredentials(username, password);
    this.clients.set(username, api);
    return api;
  }

  /**
   * Forget an account when no device uses it any more.
   */
  releaseAccount(username: string, ignoreChargerId?: string) {
    const inUse = Object.values(this.homey.drivers.getDrivers())
      .flatMap((driver) => driver.getDevices())
      .some((device) => device.getData().id !== ignoreChargerId && device.getSetting('username') === username);
    if (inUse) {
      this.log('Keeping account, a device still uses it');
      return;
    }

    const { [username]: _, ...accounts } = this.homey.settings.get(ACCOUNTS) ?? {};
    this.homey.settings.set(ACCOUNTS, accounts);
    this.clients.delete(username);
    this.log('Forgot an account no device uses');
  }

  async onUninit(): Promise<void> {
    this.log('ZaptecApp is stopping');
  }
}

module.exports = ZaptecApp;
