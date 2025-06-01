import Homey from 'homey';
import {
  ChargerOperationMode,
  chargerOperationModeStr,
  ZaptecApi,
} from '../../lib/zaptec';
import type { Go2Charger } from './device';
import { Feature } from '../../lib/zaptec/enums';
import PairSession = require('homey/lib/PairSession');

interface InstallationCurrentControlArgs {
  current1: number;
  current2: number;
  current3: number;
  device: Go2Charger;
}

class Go2Driver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Go2Driver has been initialized');
    this.registerFlows();
  }

  protected registerFlows() {
    this.log('Go2Driver is registering flows');

    this.homey.flow
      .getActionCard('go2_installation_current_control')
      .registerRunListener(
        async ({
          current1,
          current2,
          current3,
          device,
        }: InstallationCurrentControlArgs) => {
          this.log(
            `[${device.getName()}] Action 'go2_installation_current_control' triggered`,
          );
          this.log(
            `[${device.getName()}] - current: '${current1}/${current2}/${current3}' amps`,
          );          
          if( !device.hasCapability('available_installation_current'))
            throw new Error(this.homey.__('errors.missing_installation_access'));

          return device.setInstallationAvailableCurrent(
            current1,
            current2,
            current3,
          );
        },
      );

    this.homey.flow
      .getConditionCard('go2_is_charging')
      .registerRunListener(async ({ device }) =>
        device.getCapabilityValue('charging_button'),
      );

    this.homey.flow
      .getConditionCard('go2_is_connected')
      .registerRunListener(
        async ({ device }) =>
          !!device.getCapabilityValue('alarm_generic.car_connected'),
      );

    this.homey.flow
      .getConditionCard('go2_charging_is_finished')
      .registerRunListener(
        async ({ device }) =>
          device.getCapabilityValue('charge_mode') ===
          chargerOperationModeStr(ChargerOperationMode.Connected_Finishing),
      );

    this.homey.flow
      .getConditionCard('go2_authentication_required')
      .registerRunListener(async ({ device }) =>
        device.getSetting('requireAuthentication'),
      );

    this.homey.flow
      .getActionCard('go2_start_charging')
      .registerRunListener(async ({ device }) => device.startCharging());

    this.homey.flow
      .getActionCard('go2_stop_charging')
      .registerRunListener(async ({ device }) => device.stopCharging());

    this.homey.flow
      .getActionCard('go2_cable_permanent_lock')
      .registerRunListener(async ({ device }) =>
        device
          .lockCable(true)
          .then(() => device.setCapabilityValue('cable_permanent_lock', true)),
      );

    this.homey.flow
      .getActionCard('go2_cable_permanent_open')
      .registerRunListener(async ({ device }) =>
        device
          .lockCable(false)
          .then(() => device.setCapabilityValue('cable_permanent_lock', false)),
      );

      this.homey.flow
      .getActionCard('go2_reboot_charger')
      .registerRunListener(async ({ device }) => device.rebootCharger());

    this.homey.flow
      .getActionCard('go2_set_authentication_requirement')
      .registerRunListener(this.onSetAuthenticationRequirement.bind(this));

    this.homey.flow
      .getActionCard('go2_set_charging_mode')
      .registerRunListener(this.onSetChargingMode.bind(this));
  }

  /**
   * Handle setting authentication requirement
   */
  private async onSetAuthenticationRequirement(
    { device, require }: { device: Go2Charger; require: string },
  ) {
    const requireAuth = require === 'true';
    if( !device.hasCapability('available_installation_current'))
      throw new Error(this.homey.__('errors.missing_installation_access'));
    return device.setInstallationAuthenticationRequirement(requireAuth);
  }

  /**
   * Handle setting charging mode
   */
  private async onSetChargingMode(
    { device, mode }: { device: Go2Charger; mode: string },
  ) {
    if( !device.hasCapability('available_installation_current'))
      throw new Error(this.homey.__('errors.missing_installation_access'));
    return device.setInstallationChargingMode(Number(mode) as Feature);
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
      const chargers = await api.getChargersByModel('Go2');

      return (
        chargers.Data?.map((charger) => ({
          name: `${charger.Name}`,
          data: {
            id: charger.Id,
            installationId: charger.InstallationId,
          },
          settings: {
            username,
            password,
            deviceid: charger.DeviceId,
          },
        })) || []
      );
    });
  }

  async onRepair(session: PairSession, device: Go2Charger) {
    this.log('Go2Driver is repairing');
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
        
        // Credentials are valid, update device settings
        await device.setSettings({
          username,
          password,
        });
        
        // Re-authenticate the device's API instance with new credentials
        // since onSettings won't be called (username/password not in driver.settings.compose.json)
        if (device) {
          await device.reAuthenticate(username, password);
        }
        
        return true;
      } catch (_error) {
        this.log("Failed to authenticate with Zaptec's API. Error:", _error);
        return false;
      }
    });
  }
}

module.exports = Go2Driver;
