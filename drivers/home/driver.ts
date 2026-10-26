import Homey from 'homey';
import { ZaptecApi, describeChargers } from '../../lib/zaptec';
import type { HomeCharger } from './device';
import { Feature } from '../../lib/zaptec/enums';
import PairSession = require('homey/lib/PairSession');
import type { ZaptecApp } from '../../app';

interface InstallationCurrentControlArgs {
  current1: number;
  current2: number;
  current3: number;
  device: HomeCharger;
}

class HomeDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('HomeDriver has been initialized');
    this.registerFlows();
  }

  protected registerFlows() {
    this.log('HomeDriver is registering flows');

    this.homey.flow
      .getActionCard('home_installation_current_control')
      .registerRunListener(async ({ current1, current2, current3, device }: InstallationCurrentControlArgs) => {
        this.log(`[${device.getName()}] Action 'installation_current_control' triggered`);
        this.log(`[${device.getName()}] - current: '${current1}/${current2}/${current3}' amps`);

        return device.setInstallationAvailableCurrent(current1, current2, current3);
      });

    this.homey.flow
      .getConditionCard('home_is_charging')
      .registerRunListener(async ({ device }) => device.getCapabilityValue('evcharger_charging'));

    this.homey.flow
      .getConditionCard('home_is_connected')
      .registerRunListener(async ({ device }) => !!device.getCapabilityValue('alarm_generic.car_connected'));

    this.homey.flow
      .getConditionCard('home_charging_is_finished')
      .registerRunListener(
        async ({ device }) => device.getCapabilityValue('evcharger_charging_state') === 'plugged_in_paused',
      );

    this.homey.flow
      .getConditionCard('home_authentication_required')
      .registerRunListener(async ({ device }) => device.getSetting('requireAuthentication'));

    this.homey.flow
      .getActionCard('home_start_charging')
      .registerRunListener(async ({ device }) => device.startCharging());

    this.homey.flow
      .getActionCard('home_stop_charging')
      .registerRunListener(async ({ device }) => device.stopCharging());

    this.homey.flow
      .getActionCard('home_cable_permanent_lock')
      .registerRunListener(async ({ device }) =>
        device.lockCable(true).then(() => device.setCapabilityValue('cable_permanent_lock', true)),
      );

    this.homey.flow
      .getActionCard('home_cable_permanent_open')
      .registerRunListener(async ({ device }) =>
        device.lockCable(false).then(() => device.setCapabilityValue('cable_permanent_lock', false)),
      );

    this.homey.flow
      .getActionCard('home_reboot_charger')
      .registerRunListener(async ({ device }) => device.rebootCharger());

    this.homey.flow
      .getActionCard('home_set_authentication_requirement')
      .registerRunListener(async ({ device, require }) =>
        device.setInstallationAuthenticationRequirement(require === 'true'),
      );

    this.homey.flow
      .getActionCard('home_set_charging_mode')
      .registerRunListener(async ({ device, chargingMode }) =>
        device.setInstallationChargingMode(Number(chargingMode) as Feature),
      );
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
        return false;
      }
    });

    session.setHandler('list_devices', async () => {
      const chargers = await api.getChargers({
        DeviceType: 3 /* home */,
        //InstallationType: 0 /* pro */,
      });
      this.log(describeChargers(chargers));

      return (
        chargers.Data?.map((charger) => ({
          name: `${charger.Name}`,
          data: {
            id: charger.Id,
            installationId: charger.InstallationId,
          },
          settings: {
            username,
            // Moved to the account store by the device when it starts
            password,
            deviceid: charger.DeviceId,
          },
        })) || []
      );
    });
  }

  async onRepair(session: PairSession, device: HomeCharger) {
    this.log('HomeDriver is repairing');
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

module.exports = HomeDriver;
