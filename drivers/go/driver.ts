import Homey from 'homey';
import { ZaptecApi } from '../../lib/ZaptecApi';
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
      .getActionCard('pause_charging')
      .registerRunListener(async ({ device }) => device.pauseCharging());

    this.homey.flow
      .getActionCard('resume_charging')
      .registerRunListener(async ({ device }) => device.resumeCharging());
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
        Roles: 2,
        ReturnIdNameOnly: true,
      });

      return (
        chargers.data?.map((charger) => ({
          name: `${charger.name} (${charger.installationName})`,
          data: {
            id: charger.id,
            installationId: charger.installationId,
          },
          settings: {
            username,
            password,
          },
        })) || []
      );
    });
  }
}

module.exports = GoDriver;
