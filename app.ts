import sourceMapSupport from 'source-map-support';
import { App } from 'homey';
import * as appJson from './app.json';

sourceMapSupport.install();

class ZaptecApp extends App {
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

  async onUninit(): Promise<void> {
    this.log('ZaptecApp is stopping');
  }
}

module.exports = ZaptecApp;
