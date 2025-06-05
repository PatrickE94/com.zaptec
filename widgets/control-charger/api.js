'use strict';
// import {
//   ChargerOperationMode,
//   chargerOperationModeStr,
// } from '../../lib/zaptec';

module.exports = {
  async getChargerState({ homey, query }) {

    const selectedDeviceId = query.deviceId;
    
    // Liste over alle driver typer
    const driverTypes = query.driverType ? [query.driverType] : ['pro', 'go', 'go2', 'home'];
    let selectedDevice = null;
    let selectedDriverId = null;

    // Søk gjennom alle driver typer
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          selectedDriverId = driverType;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      const chargerOperationMode = selectedDevice.getCapabilityValue('charge_mode');
      const cablePermanentLock = selectedDevice.getCapabilityValue('cable_permanent_lock');
      const chargingMode = selectedDevice.getCapabilityValue('charging_mode');
      const requireAuthentication = selectedDevice.getSetting('requireAuthentication');

      return {
        status: 'ok',
        chargerOperationMode: chargerOperationMode,
        driverType: selectedDriverId,
        cablePermanentLock: cablePermanentLock,
        chargingMode: chargingMode,
        requireAuthentication: requireAuthentication
      };
    } else {
      // console.log('Device not found in any driver');
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  }
};
