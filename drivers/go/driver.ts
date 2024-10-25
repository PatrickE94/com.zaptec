import Homey from 'homey';
import { ChargerOperationMode, chargerOperationModeStr, ZaptecApi } from '../../lib/zaptec';
import type { GoCharger } from './device';

interface InstallationCurrentControlArgs {
  current1: number;
  current2: number;
  current3: number;
  device: GoCharger;
}

class GoDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('GoDriver has been initialized');
    this.registerFlows();
  }

  protected registerFlows() {
    this.log('GoDriver is registering flows');

    this.homey.flow
      .getActionCard('installation_current_control')
      .registerRunListener(
        async ({
          current1,
          current2,
          current3,
          device,
        }: InstallationCurrentControlArgs) => {
          this.log(
            `[${device.getName()}] Action 'installation_current_control' triggered`,
          );
          this.log(
            `[${device.getName()}] - current: '${current1}/${current2}/${current3}' amps`,
          );

          return device.setInstallationAvailableCurrent(
            current1,
            current2,
            current3,
          );
        },
      );

    this.homey.flow
      .getConditionCard('is_charging')
      .registerRunListener(async ({ device }) =>
        device.getCapabilityValue('charging_button'),
      );

    this.homey.flow
      .getConditionCard('is_connected')
      .registerRunListener(
        async ({ device }) =>
          !!device.getCapabilityValue('alarm_generic.car_connected'),
      );

    this.homey.flow
      .getConditionCard('charging_is_finished')
      .registerRunListener(
        async ({ device }) =>
          device.getCapabilityValue('charge_mode') ===
          chargerOperationModeStr(ChargerOperationMode.Connected_Finishing),
      );

    this.homey.flow
      .getActionCard('start_charging')
      .registerRunListener(async ({ device }) => device.startCharging());

    this.homey.flow
      .getActionCard('stop_charging')
      .registerRunListener(async ({ device }) => device.stopCharging());
    
    this.homey.flow
      .getActionCard('go_cable_permanent_lock')
      .registerRunListener(async ({ device }) => device.lockCable(true).then(() => device.setCapabilityValue('cable_permanent_lock', true)));
      
    this.homey.flow
      .getActionCard('go_cable_permanent_open')
      .registerRunListener(async ({ device }) => device.lockCable(false).then(() => device.setCapabilityValue('cable_permanent_lock', false)));

  }

  async onPair(session: Homey.Driver.PairSession) {
    const api = new ZaptecApi();
    let username = '';
    let password = '';

    session.setHandler(
      'login',
      async (data: { username: string; password: string }) => {
        username = data.username;
        password = data.password;

        try {
          await api.authenticate(username, password);
          return true;
        } catch (_error) {
          return false;
        }
      },
    );

    session.setHandler('list_devices', async () => {
      const chargers = await api.getChargers({
        DeviceType: 4,
        InstallationType: 1,
      });

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

module.exports = GoDriver;
