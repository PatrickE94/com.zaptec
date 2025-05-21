import nock from 'nock';
import { ZaptecApi } from './api';
import assert from 'assert';
import { ApiError } from './error';
import { ErrorCode } from './enums';

// Mock Homey object for tests
const mockHomey = {
  __: (key: string) => key
};

// Test data models
const testModels = {
  chargers: {
    pro: {
      "OperatingMode": 1,
      "IsOnline": true,
      "Id": "aa1e305c-402a-383a-7c33-eba7270a5e6b",
      "MID": "ZPR000001",
      "DeviceId": "ZPR000001",
      "SerialNo": "Plass 1234",
      "Name": "Plass 1234",
      "CreatedOnDate": "2022-10-28T12:10:02.513",
      "CircuitId": "02122765-28c2-3d52-a533-daa42b1d1c2c",
      "Active": true,
      "CurrentUserRoles": 3,
      "DeviceType": 1,
      "InstallationName": "Boligsameie A",
      "InstallationId": "aa841220-c6ad-3318-a5c0-73476b86a781",
      "AuthenticationType": 2,
      "IsAuthorizationRequired": true
    },
    go: {
      "OperatingMode": 1,
      "IsOnline": true,
      "Id": "7861eb1a-e276-3024-a6e9-cad68e200c99",
      "MID": "ZAP000001",
      "DeviceId": "ZAP000001",
      "SerialNo": "Lader",
      "Name": "Lader",
      "CreatedOnDate": "2023-08-10T08:47:59.73",
      "CircuitId": "cca84503-4962-3618-ac0c-0be5a8860064",
      "Active": true,
      "CurrentUserRoles": 3,
      "Pin": "0000",
      "DeviceType": 4,
      "InstallationName": "Testveien 10",
      "InstallationId": "355d0c88-0bc8-3023-ab7c-2801a0c750b",
      "AuthenticationType": 0,
      "IsAuthorizationRequired": false
    }
  },
  
  // Alle ladere sammen for bruk i API-respons
  allChargers: function() {
    return [this.chargers.pro, this.chargers.go];
  },
  
  state: {
    charging: {
      ChargerId: 'charger-123',
      StateId: 1,
      Timestamp: '2023-01-01T12:00:00Z',
      ValueAsString: 'Connected_Charging',
      ObservationId: 123
    }
  },
  
  auth: {
    token: 'VALID_TOKEN',
    type: 'Bearer',
    expires: 9000
  }
};

// Helper for setting up authentication nock
function mockAuthentication() {
  return nock('https://api.zaptec.com')
    .post('/oauth/token', 'grant_type=password&username=test&password=123')
    .reply(200, {
      access_token: testModels.auth.token,
      token_type: testModels.auth.type,
      expires_in: testModels.auth.expires,
    });
}

const api = new ZaptecApi('1.0.0', mockHomey);

describe('Zaptec API Client', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should use token after authentication', async () => {
    mockAuthentication();

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(200, {});

    await api.authenticate('test', '123');
    await api.getChargers({});
  });

  it('should handle 429 responses with backoff', async () => {
    // First authenticate
    mockAuthentication();

    // First attempt gets 429
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(429, {}, { 'Retry-After': '1' });

    // Second attempt succeeds
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(200, { Data: [] });

    await api.authenticate('test', '123');
    const result = await api.getChargers({});
    
    assert.deepStrictEqual(result.Data, []);
  });

  it('should handle API errors correctly', async () => {
    mockAuthentication();

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .reply(500, { 
        Code: ErrorCode.ConfigurationError,
        Details: 'Something went wrong'
      });

    await api.authenticate('test', '123');
    
    try {
      await api.getChargers({});
      assert.fail('Expected error was not thrown');
    } catch (error) {
      assert(error instanceof ApiError);
      assert.strictEqual(error.message.includes('Configuration error'), true);
      assert.strictEqual(error.message.includes('Something went wrong'), true);
    }
  });

  it('should handle authentication failures', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=wrong&password=wrong')
      .reply(400, {
        error: 'invalid_grant',
        error_description: 'Invalid username or password'
      });

    try {
      await api.authenticate('wrong', 'wrong');
      assert.fail('Expected error was not thrown');
    } catch (error) {
      assert(error instanceof Error);
    }
  });

  it('should get chargers by model', async () => {
    mockAuthentication();
  
    // Samme data returneres for alle kall, filtreringen skjer i getChargersByModel
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers')
      .query(true)
      .times(3)
      .reply(200, { 
        Data: testModels.allChargers() 
      });
  
    // Utfør testen
    await api.authenticate('test', '123');
    
    // Test Pro-modell
    let result = await api.getChargersByModel('Pro');
    assert.strictEqual(result.Data?.length, 1);
    assert.strictEqual(result.Data?.[0].DeviceId, testModels.chargers.pro.DeviceId);

    // Test Go-modell
    result = await api.getChargersByModel('Go');
    assert.strictEqual(result.Data?.length, 1);
    assert.strictEqual(result.Data?.[0].DeviceId, testModels.chargers.go.DeviceId);

    // Test Go2-modell - skal gi tomt resultat da vi ikke har noen Go2
    result = await api.getChargersByModel('Go2');
    assert.strictEqual(result.Data?.length, 0);
  });

  it('should fetch charger state correctly', async () => {
    mockAuthentication();

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .get('/api/chargers/charger-123/state')
      .reply(200, testModels.state.charging);

    await api.authenticate('test', '123');
    const state = await api.getChargerState('charger-123');
    
    assert.deepStrictEqual(state, testModels.state.charging);
  });

  it('should send command to charger correctly', async () => {
    mockAuthentication();

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', `${testModels.auth.type} ${testModels.auth.token}`)
      .post('/api/chargers/charger-123/sendCommand/2') // Command 2 = StartCharging
      .reply(200, {});

    await api.authenticate('test', '123');
    await api.sendCommand('charger-123', 2); // 2 = StartCharging
    // If we got here without error, the test passes
  });
});
