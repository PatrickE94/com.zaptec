import Homey from 'homey';
import { ZaptecApi, describeChargers, describeEnergySensors, senseDevices } from '../../lib/zaptec';
import type { Sense } from './device';
import PairSession = require('homey/lib/PairSession');
import type { ZaptecApp } from '../../app';

class SenseDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('SenseDriver has been initialized');
  }

  async onPair(session: any) {
    let username = '';
    let password = '';
    let appVersion = this.homey.app.manifest.version;
    let api: ZaptecApi;

    session.setHandler('login', async (data: { username: string; password: string }) => {
      username = data.username.trim();
      password = data.password.trim();
      if (!username || username.length === 0) {
        throw new Error(this.homey.__('errors.username_missing'));
      }
      if (!password || password.length === 0) {
        throw new Error(this.homey.__('errors.password_missing'));
      }

      try {
        api = new ZaptecApi(appVersion, this.homey);

        await api.authenticate(username, password);
        return true;
      } catch (_error) {
        this.log("Failed to authenticate with Zaptec's API. Error:", _error);
        return false;
      }
    });

    session.setHandler('list_devices', async () => {
      const chargers = await api.getChargers({});
      this.log(describeChargers(chargers));

      await this.logEnergySensors(api).catch((e) => this.log('Failed to look up energy sensors:', e));

      const matching = senseDevices(chargers.Data ?? []);

      return matching.map((sense) => ({
        name: `${sense.Name}`,
        data: {
          id: sense.Id,
          installationId: sense.InstallationId,
        },
        settings: {
          username,
          // Moved to the account store by the device when it starts
          password,
          deviceid: sense.DeviceId,
        },
      }));
    });
  }

  /**
   * Log the energy sensor of each installation, for testers' diagnostic
   * reports. Each installation is fetched, as the spec doesn't say whether
   * the installation list includes the sensor.
   */
  private async logEnergySensors(api: ZaptecApi) {
    const installations = await api.getInstallations({});
    const details = await Promise.all(
      (installations.Data ?? []).flatMap((installation) =>
        installation.Id ? [api.getInstallation(installation.Id)] : [],
      ),
    );

    this.log(describeEnergySensors(details));
  }

  async onRepair(session: PairSession, device: Sense) {
    this.log('SenseDriver is repairing');
    let username = '';
    let password = '';
    let appVersion = this.homey.app.manifest.version;

    session.setHandler('login', async (data: { username: string; password: string }) => {
      username = data.username.trim();
      password = data.password.trim();
      if (!username || username.length === 0) {
        throw new Error(this.homey.__('errors.username_missing'));
      }
      if (!password || password.length === 0) {
        throw new Error(this.homey.__('errors.password_missing'));
      }

      try {
        // Validate credentials by attempting authentication
        const validationApi = new ZaptecApi(appVersion, this.homey);
        await validationApi.authenticate(username, password);

        // Credentials are valid, store them for the account and move the
        // device over to it
        const previousUsername = device.getSetting('username');
        (this.homey.app as ZaptecApp).setAccount(username, password);
        await device.setSettings({ username });
        await device.reAuthenticate();
        (this.homey.app as ZaptecApp).releaseAccount(previousUsername);

        return true;
      } catch (_error) {
        this.log("Failed to authenticate with Zaptec's API. Error:", _error);
        return false;
      }
    });
  }
}

module.exports = SenseDriver;
