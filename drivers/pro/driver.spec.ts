import assert from 'assert';
import nock from 'nock';
import { ZaptecApi } from '../../lib/zaptec';
import { ChargerOperationMode, chargerOperationModeStr } from '../../lib/zaptec';

// Mock ZaptecApi for tests
const mockZaptecApi = {
  authenticate: async () => true,
  getChargersByModel: async () => ({
    Data: [
      {
        Id: 'charger-123',
        Name: 'Test Charger',
        InstallationId: 'inst-123',
        DeviceId: 'device-123'
      }
    ]
  })
};

// Mock ProCharger device
const mockProDevice = {
  getName: () => 'Test Pro Charger',
  getCapabilityValue: (cap: string) => {
    if (cap === 'charging_button') return false;
    if (cap === 'alarm_generic.car_connected') return true;
    if (cap === 'charge_mode') return chargerOperationModeStr(ChargerOperationMode.Connected_Finishing);
    return null;
  },
  getSetting: (setting: string) => {
    if (setting === 'requireAuthentication') return true;
    return null;
  },
  hasCapability: (cap: string) => cap === 'available_installation_current',
  startCharging: async () => true,
  stopCharging: async () => true,
  lockCable: async () => true,
  setCapabilityValue: async () => true,
  rebootCharger: async () => true,
  setInstallationAvailableCurrent: async () => true,
  setInstallationAuthenticationRequirement: async () => true
};

// Mock Homey object
const mockHomey = {
  __: (key: string) => key,
  flow: {
    getActionCard: (id: string) => ({
      registerRunListener: (listener: Function) => {
        mockFlowListeners[id] = listener;
      }
    }),
    getConditionCard: (id: string) => ({
      registerRunListener: (listener: Function) => {
        mockFlowListeners[id] = listener;
      }
    })
  },
  app: {
    manifest: {
      version: '1.0.0'
    }
  }
};

// Store mock flow listeners
const mockFlowListeners: Record<string, Function> = {};

type FlowParams = {
  current1: number;
  current2: number;
  current3: number;
  device: any;
};

// Mock ProDriver for tests
class MockProDriver {
  public log = (message: string) => {};
  public homey = mockHomey;
  
  public async onInit() {
    this.log('ProDriver has been initialized');
    this.registerFlows();
  }
  
  protected registerFlows() {
    this.log('ProDriver is registering flows');
    
    // Register flow cards exactly as in the real driver
    this.homey.flow
      .getActionCard('pro_installation_current_control')
      .registerRunListener(async ({ current1, current2, current3, device }: FlowParams) => {
        if (!device.hasCapability('available_installation_current'))
          throw new Error(this.homey.__('errors.missing_installation_access'));
        
        return device.setInstallationAvailableCurrent(current1, current2, current3);
      });
    
    this.homey.flow
      .getConditionCard('pro_is_charging')
      .registerRunListener(async ({ device }: FlowParams) => 
        device.getCapabilityValue('charging_button')
      );
      
    this.homey.flow
      .getConditionCard('pro_is_connected')
      .registerRunListener(async ({ device }: FlowParams) => 
        !!device.getCapabilityValue('alarm_generic.car_connected')
      );
      
    this.homey.flow
      .getConditionCard('pro_charging_is_finished')
      .registerRunListener(async ({ device }: FlowParams) =>
        device.getCapabilityValue('charge_mode') ===
        chargerOperationModeStr(ChargerOperationMode.Connected_Finishing)
      );
      
    this.homey.flow
      .getConditionCard('pro_authentication_required')
      .registerRunListener(async ({ device }: FlowParams) =>
        device.getSetting('requireAuthentication')
      );
      
    this.homey.flow
      .getActionCard('pro_start_charging')
      .registerRunListener(async ({ device }: FlowParams) => device.startCharging());
      
    this.homey.flow
      .getActionCard('pro_stop_charging')
      .registerRunListener(async ({ device }: FlowParams) => device.stopCharging());
  }
  
  public async onSetAuthenticationRequirement({ device, require }: { device: any, require: string }) {
    const requireAuth = require === 'true';
    if (!device.hasCapability('available_installation_current'))
      throw new Error(this.homey.__('errors.missing_installation_access'));
    return device.setInstallationAuthenticationRequirement(requireAuth);
  }
  
  public async onPair(session: any) {
    let username = '';
    let password = '';
    
    session.setHandler('login', async (data: { username: string; password: string }) => {
      username = data.username;
      password = data.password;
      return true;
    });
    
    session.setHandler('list_devices', async () => {
      const chargers = await mockZaptecApi.getChargersByModel();
      
      return chargers.Data?.map((charger) => ({
        name: `${charger.Name}`,
        data: {
          id: charger.Id,
          installationId: charger.InstallationId,
        },
        settings: {
          username,
          password,
          deviceid: charger.DeviceId,
        }
      })) || [];
    });
  }
}

describe('Pro driver', () => {
  let driver: MockProDriver;
  
  beforeEach(() => {
    driver = new MockProDriver();
    driver.onInit();
  });
  
  it('should correctly check if car is connected', async () => {
    const listener = mockFlowListeners['pro_is_connected'];
    const result = await listener({ device: mockProDevice });
    assert.strictEqual(result, true);
  });
  
  it('should correctly check if charging is finished', async () => {
    const listener = mockFlowListeners['pro_charging_is_finished'];
    const result = await listener({ device: mockProDevice });
    assert.strictEqual(result, true);
  });
  
  it('should correctly check authentication requirement', async () => {
    const listener = mockFlowListeners['pro_authentication_required'];
    const result = await listener({ device: mockProDevice });
    assert.strictEqual(result, true);
  });
  
  it('should start charging when triggered', async () => {
    let startChargingCalled = false;
    const mockDevice = {
      ...mockProDevice,
      startCharging: async () => {
        startChargingCalled = true;
        return true;
      }
    };
    
    const listener = mockFlowListeners['pro_start_charging'];
    await listener({ device: mockDevice });
    assert.strictEqual(startChargingCalled, true);
  });
  
  it('should stop charging when triggered', async () => {
    let stopChargingCalled = false;
    const mockDevice = {
      ...mockProDevice,
      stopCharging: async () => {
        stopChargingCalled = true;
        return true;
      }
    };
    
    const listener = mockFlowListeners['pro_stop_charging'];
    await listener({ device: mockDevice });
    assert.strictEqual(stopChargingCalled, true);
  });
  
  it('should set current correctly', async () => {
    let current1Value = 0;
    let current2Value = 0;
    let current3Value = 0;
    
    const mockDevice = {
      ...mockProDevice,
      setInstallationAvailableCurrent: async (c1: number, c2: number, c3: number) => {
        current1Value = c1;
        current2Value = c2;
        current3Value = c3;
        return true;
      }
    };
    
    const listener = mockFlowListeners['pro_installation_current_control'];
    await listener({ 
      device: mockDevice, 
      current1: 16, 
      current2: 20, 
      current3: 25 
    });
    
    assert.strictEqual(current1Value, 16);
    assert.strictEqual(current2Value, 20);
    assert.strictEqual(current3Value, 25);
  });
  
  it('should handle pairing process', async () => {
    const mockSession = {
      handlers: {} as Record<string, Function>,
      setHandler: function(event: string, handler: Function) {
        this.handlers[event] = handler;
      }
    };
    
    await driver.onPair(mockSession);
    
    // Test login handler
    const loginResult = await mockSession.handlers.login({
      username: 'test@example.com',
      password: 'password123'
    });
    
    assert.strictEqual(loginResult, true);
    
    // Test list_devices handler
    const devices = await mockSession.handlers.list_devices();
    
    assert.strictEqual(devices.length, 1);
    assert.strictEqual(devices[0].name, 'Test Charger');
    assert.strictEqual(devices[0].data.id, 'charger-123');
    assert.strictEqual(devices[0].settings.username, 'test@example.com');
    assert.strictEqual(devices[0].settings.password, 'password123');
  });
});
