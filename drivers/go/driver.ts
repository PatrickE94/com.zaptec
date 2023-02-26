import Homey from 'homey';
import { ZaptecApi } from '../../lib/ZaptecApi';

class GoDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('GoDriver has been initialized');
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
          name: charger.name,
          data: {
            id: charger.id,
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
