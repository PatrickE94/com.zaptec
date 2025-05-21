import nock from 'nock';
import { ZaptecApi } from './api';
import assert from 'assert';
import { ApiError } from './error';
import { ErrorCode } from './enums';

// Mock Homey object for tests
const mockHomey = {
  __: (key: string) => key
};

const api = new ZaptecApi('1.0.0', mockHomey);

describe('Zaptec API Client', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should use token after authentication', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=test&password=123')
      .reply(200, {
        access_token: 'VALID_TOKEN',
        token_type: 'Bearer',
        expires_in: 9000,
      });

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', 'Bearer VALID_TOKEN')
      .get('/api/chargers')
      .reply(200, {});

    await api.authenticate('test', '123');
    await api.getChargers({});
  });

  it('should handle 429 responses with backoff', async () => {
    // First authenticate
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=test&password=123')
      .reply(200, {
        access_token: 'VALID_TOKEN',
        token_type: 'Bearer',
        expires_in: 9000,
      });

    // First attempt gets 429
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', 'Bearer VALID_TOKEN')
      .get('/api/chargers')
      .reply(429, {}, { 'Retry-After': '1' });

    // Second attempt succeeds
    nock('https://api.zaptec.com')
      .matchHeader('Authorization', 'Bearer VALID_TOKEN')
      .get('/api/chargers')
      .reply(200, { Data: [] });

    await api.authenticate('test', '123');
    const result = await api.getChargers({});
    
    assert.deepStrictEqual(result.Data, []);
  });

  it('should handle API errors correctly', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=test&password=123')
      .reply(200, {
        access_token: 'VALID_TOKEN',
        token_type: 'Bearer',
        expires_in: 9000,
      });

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', 'Bearer VALID_TOKEN')
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

  it('should fetch charger state correctly', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=test&password=123')
      .reply(200, {
        access_token: 'VALID_TOKEN',
        token_type: 'Bearer',
        expires_in: 9000,
      });

    const mockState = { 
      ChargerId: 'charger-123',
      StateId: 1,
      Timestamp: '2023-01-01T12:00:00Z',
      ValueAsString: 'Connected_Charging',
      ObservationId: 123
    };

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', 'Bearer VALID_TOKEN')
      .get('/api/chargers/charger-123/state')
      .reply(200, mockState);

    await api.authenticate('test', '123');
    const state = await api.getChargerState('charger-123');
    
    assert.deepStrictEqual(state, mockState);
  });

  it('should send command to charger correctly', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=test&password=123')
      .reply(200, {
        access_token: 'VALID_TOKEN',
        token_type: 'Bearer',
        expires_in: 9000,
      });

    nock('https://api.zaptec.com')
      .matchHeader('Authorization', 'Bearer VALID_TOKEN')
      .post('/api/chargers/charger-123/sendCommand/2') // Command 2 = StartCharging
      .reply(200, {});

    await api.authenticate('test', '123');
    await api.sendCommand('charger-123', 2); // 2 = StartCharging
    // If we got here without error, the test passes
  });
});
