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
      const chargingButton = selectedDevice.getCapabilityValue('charging_button');
      const measurePower = selectedDevice.getCapabilityValue('measure_power');
      const requireAuthentication = selectedDevice.getSetting('requireAuthentication');
      const carConnected = selectedDevice.getCapabilityValue('alarm_generic.car_connected');

      return {
        status: 'ok',
        chargerOperationMode: chargerOperationMode,
        driverType: selectedDriverId,
        cablePermanentLock: cablePermanentLock,
        chargingMode: chargingMode,
        chargingButton: chargingButton,
        measurePower: (measurePower / 1000).toFixed(1),
        requireAuthentication: requireAuthentication,
        carConnected: carConnected
      };
    } else {
      // console.log('Device not found in any driver');
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  },

  async lockCharger({ homey, query, body }) {
    const selectedDeviceId = query.deviceId;
    const lockState = body.lock;
    
    // console.log('lockCharger called:', { deviceId: selectedDeviceId, lock: lockState });
    
    // Liste over alle driver typer
    const driverTypes = ['pro', 'go', 'go2', 'home'];
    let selectedDevice = null;

    // Søk gjennom alle driver typer
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      try {
        // Call the device's lockCable method which uses api.ts lockCharger function
        await selectedDevice.lockCable(lockState);
        
        return {
          status: 'ok',
          message: 'Cable lock updated successfully',
          lockState: lockState
        };
      } catch (error) {
        console.error('Error setting cable lock:', error);
        return {
          status: 'error',
          message: 'Failed to set cable lock: ' + error.message
        };
      }
    } else {
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  },

  async setAuthenticationRequirement({ homey, query, body }) {
    const selectedDeviceId = query.deviceId;
    const requireAuthentication = body.requireAuthentication;
    
    console.log('setAuthenticationRequirement called:', { deviceId: selectedDeviceId, requireAuthentication: requireAuthentication });
    
    // Liste over alle driver typer
    const driverTypes = ['pro', 'go', 'go2', 'home'];
    let selectedDevice = null;

    // Søk gjennom alle driver typer
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      try {
        // Call the device's setInstallationAuthenticationRequirement method
        await selectedDevice.setInstallationAuthenticationRequirement(requireAuthentication);
        
        // Update setting to reflect the change
        // await selectedDevice.setSettings({ requireAuthentication: requireAuthentication });
        
        return {
          status: 'ok',
          message: 'Authentication requirement updated successfully',
          requireAuthentication: requireAuthentication
        };
      } catch (error) {
        console.error('Error setting authentication requirement:', error);
        return {
          status: 'error',
          message: 'Failed to set authentication requirement: ' + error.message
        };
      }
    } else {
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  },

  async setChargingMode({ homey, query, body }) {
    const selectedDeviceId = query.deviceId;
    const chargingMode = body.chargingMode;
    
    console.log('setChargingMode called:', { deviceId: selectedDeviceId, chargingMode: chargingMode });
    
    // Liste over alle driver typer
    const driverTypes = ['pro', 'go', 'go2', 'home'];
    let selectedDevice = null;

    // Søk gjennom alle driver typer
    for (const driverType of driverTypes) {
      try {
        const driver = await homey.drivers.getDriver(driverType);
        const devices = driver.getDevices();
        selectedDevice = devices.find(device => device.getId() === selectedDeviceId);
        if (selectedDevice) {
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (selectedDevice) {
      try {
        // Set charging_mode capability
        await selectedDevice.setCapabilityValue('charging_mode', chargingMode);
        
        // Trigger capability update to ensure UI reflects the change
        await selectedDevice.triggerCapabilityListener('charging_mode', chargingMode);
        
        return {
          status: 'ok',
          message: 'Charging mode updated successfully',
          chargingMode: chargingMode
        };
      } catch (error) {
        console.error('Error setting charging mode:', error);
        return {
          status: 'error',
          message: 'Failed to set charging mode: ' + error.message
        };
      }
    } else {
      return {
        status: 'error',
        message: 'Device not found'
      };
    }
  }
};
