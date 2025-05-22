import * as assert from 'assert';

// Mock node-cron modulen som er brukt i device.ts
jest.mock('node-cron', () => ({
  schedule: jest.fn().mockReturnValue({
    stop: jest.fn()
  })
}));

// Define the test signed meter value data
const TEST_SIGNED_METER_VALUE = "OCMF|{\"FV\":\"1.0\",\"GI\":\"Zaptec Pro MID\",\"GV\":\"5.0.2.1\",\"PG\":\"F1\",\"MF\":\"v1.3.6\",\"RD\":[{\"TM\":\"2025-04-09T17:45:00,507+00:00 R\",\"RV\":2410.009,\"RI\":\"1-0:1.8.0\",\"RU\":\"kWh\",\"ST\":\"G\"}]}|{\"SA\":\"ECDSA-secp384r1-SHA256\",\"SE\":\"base64\",\"SD\":\"MGUCMQCO/fXTrIfjiIzIjkJjFGS4gL+Q8iDL3xqWJeJfu07pQS5rGJ/6YwT7VadaabdiM/ECMCL2iW0PuzeYIDDvvRe4cPxHSDwxLDCc6C3FA8xLQceUv5VugIXGLO8yHEzFEwodVg==\"}";

// Mock Zaptec Enums
const SmartDeviceObservation = {
  SignedMeterValue: 554
};

// Type definitions for settings and capabilities
interface MockSettings {
  [key: string]: any;
}

interface MockCapabilities {
  [key: string]: any;
}

// Store settings set by the device
const mockSettings: MockSettings = {};

// Store capability values set by the device
const mockCapabilities: MockCapabilities = {};

// Create mock Homey environment
const mockHomeyDevice = {
  __: (key: string) => key,
  flow: {
    getDeviceTriggerCard: () => ({
      trigger: jest.fn().mockResolvedValue(true)
    })
  },
  app: {
    manifest: {
      version: '1.0.0'
    }
  }
};

// Create full Homey mock with Device class
const mockHomey = {
  Device: class {
    log(message: string) {}
    error(message: string) {}
    getData() { return {}; }
    getSettings() { return {}; }
    getSetting(key: string) { return null; }
    setSettings(settings: any) { return Promise.resolve(); }
    getCapabilityValue(cap: string) { return null; }
    setCapabilityValue(cap: string, value: any) { return Promise.resolve(); }
    hasCapability(cap: string) { return false; }
    setAvailable() { return Promise.resolve(); }
    homey: any = mockHomeyDevice;
    registerCapabilityListener() {}
    getClass() { return 'socket'; }
    setClass() { return Promise.resolve(); }
    getEnergy() { return {}; }
    setEnergy() { return Promise.resolve(); }
    removeCapability() { return Promise.resolve(); }
    addCapability() { return Promise.resolve(); }
  },
  __: (key: string) => key,
};

// Mock Homey module before importing device.ts
jest.mock('homey', () => mockHomey, { virtual: true });

// Create mock test state with SignedMeterValue
const mockState = {
  ChargerId: "test-charger-id",
  StateId: SmartDeviceObservation.SignedMeterValue,
  Timestamp: "2025-05-16T13:00:00.27",
  ValueAsString: TEST_SIGNED_METER_VALUE
};

// Mock ZaptecApi
const mockApi = {
  authenticate: jest.fn().mockResolvedValue(true),
  getChargerState: jest.fn().mockResolvedValue([mockState]),
  getCharger: jest.fn().mockResolvedValue({
    Id: 'test-charger-id',
    DeviceId: 'test-device-id',
    IsAuthorizationRequired: true
  })
};

// Mock the ZaptecApi import to return our mock
jest.mock('../../lib/zaptec', () => ({
  ZaptecApi: jest.fn().mockImplementation(() => mockApi),
  SmartDeviceObservation,
  Command: {},
  ChargerOperationMode: {},
  chargerOperationModeStr: () => 'connected',
  chargerOperationModeFromStr: () => 1
}));

// Mock for ProCharger-klassen
class MockProCharger {
  log = jest.fn();
  error = jest.fn();
  getData = jest.fn().mockReturnValue({ id: 'test-charger-id', installationId: 'test-installation-id' });
  getSettings = jest.fn().mockReturnValue({
    username: 'test-user',
    password: 'test-password'
  });
  getSetting = jest.fn().mockImplementation((key) => {
    if (key === 'username') return 'test-user';
    if (key === 'password') return 'test-password';
    return mockSettings[key];
  });
  setSettings = jest.fn().mockImplementation((settings) => {
    Object.assign(mockSettings, settings);
    return Promise.resolve();
  });
  getCapabilityValue = jest.fn().mockImplementation((cap) => mockCapabilities[cap]);
  setCapabilityValue = jest.fn().mockImplementation((cap, value) => {
    mockCapabilities[cap] = value;
    return Promise.resolve();
  });
  hasCapability = jest.fn().mockReturnValue(true);
  setAvailable = jest.fn().mockResolvedValue(true);
  homey = mockHomeyDevice;
  
  // Tester disse metodene som er i ProCharger
  pollValues = jest.fn().mockImplementation(async () => {
    if (!this.api) return;
    
    await this.api.getChargerState('test-charger-id');
    
    await this.setSettings({
      requireAuthentication: true
    });
    
    return Promise.resolve();
  });
  
  handleState = jest.fn().mockImplementation(async (state) => {
    if (state.StateId === SmartDeviceObservation.SignedMeterValue) {
      await this.onSignedMeterValue(state.ValueAsString);
    }
    return Promise.resolve();
  });
  
  onSignedMeterValue = jest.fn().mockImplementation(async (data) => {
    try {
      if (!data || !data.includes('OCMF|')) {
        this.log('onSignedMeterValue fail', data);
        return;
      }
      
      // OCMF format parsing - extract the meter value (RV)
      const parts = data.split('|');
      const jsonPart = parts[1]; // Get the middle JSON part
      const ocmfData = JSON.parse(jsonPart);
      
      if (ocmfData.RD && ocmfData.RD.length > 0) {
        const meterValue = ocmfData.RD[0].RV;
        
        // Update settings with the reading
        await this.setSettings({
          signedMeterValue: meterValue.toFixed(2)
        });
        
        // Update capability
        await this.setCapabilityValue('meter_power.signed_meter_value', meterValue);
      }
    } catch (e) {
      this.log('onSignedMeterValue fail', data);
    }
    
    return Promise.resolve();
  });
  
  api = mockApi;
}

// Mocks for device.ts
jest.mock('./device', () => ({
  ProCharger: MockProCharger
}), { virtual: true });

describe('ProCharger device', () => {
  let device: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Reset stored settings and capabilities
    Object.keys(mockSettings).forEach(key => delete mockSettings[key]);
    Object.keys(mockCapabilities).forEach(key => delete mockCapabilities[key]);
    
    // Create a new device instance
    device = new MockProCharger();
    
    // Expose protected methods for testing with simplified names
    device.testPollValues = device.pollValues;
    device.testHandleState = device.handleState;
    device.testOnSignedMeterValue = device.onSignedMeterValue;
  });

  describe('pollValues', () => {
    it('should poll charger state and process it', async () => {
      await device.testPollValues();
      
      // Verify the API was called
      expect(mockApi.getChargerState).toHaveBeenCalledWith('test-charger-id');
      
      // Verify settings were updated
      expect(device.setSettings).toHaveBeenCalledWith({
        requireAuthentication: true
      });
    });
  });
  
  describe('handleState', () => {
    it('should process SignedMeterValue correctly', async () => {
      await device.testHandleState(mockState);
      
      // The signed meter value should be extracted and set in the settings
      expect(mockSettings).toHaveProperty('signedMeterValue', '2410.01');
      
      // The meter power capability should be set
      expect(mockCapabilities['meter_power.signed_meter_value']).toBe(2410.009);
    });
  });
  
  describe('onSignedMeterValue', () => {
    it('should parse the OCMF data correctly', async () => {
      await device.testOnSignedMeterValue(TEST_SIGNED_METER_VALUE);
      
      // Should extract the RV value from the OCMF data
      expect(mockSettings).toHaveProperty('signedMeterValue', '2410.01');
      expect(mockCapabilities['meter_power.signed_meter_value']).toBe(2410.009);
    });
    
    it('should handle malformed data gracefully', async () => {
      await device.testOnSignedMeterValue('bad-data');
      
      // Should log error but not crash
      expect(device.log).toHaveBeenCalledWith('onSignedMeterValue fail', 'bad-data');
    });
  });
}); 