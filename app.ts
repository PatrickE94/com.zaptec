import Homey from 'homey';

class ZaptecApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('ZaptecApp has been initialized');
  }

}

module.exports = ZaptecApp;
