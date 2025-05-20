import Homey from 'homey';
import {
  ChargerOperationMode,
  chargerOperationModeStr,
  ZaptecApi,
} from '../../lib/zaptec';
import type { Go2Charger } from './device';

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
            throw new Error('Device does not support setting available current, because of missing access to the installation');

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
      
  }

  async onPair(session: Homey.Driver.PairSession) {
    const appVersion = this.homey.app.manifest.version;
    const api = new ZaptecApi(appVersion);
    let username = '';
    let password = '';

    session.setHandler(
      'login',
      async (data: { username: string; password: string }) => {
        username = data.username;
        password = data.password;
        this.log("Trying to authenticate with Zaptec's API");

        try {
          await api.authenticate(username, password);
          return true;
        } catch (_error) {
          this.log("Failed to authenticate with Zaptec's API. Error:", _error);
          return false;
        }
      },
    );

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
}

module.exports = Go2Driver;
