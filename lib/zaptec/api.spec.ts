import nock from 'nock';
import { ZaptecApi, networkErrorDetails } from './api';
import { InvalidCredentialsError, MissingCredentialsError } from './error';
import assert from 'assert';

// Mock Homey object for tests
const mockHomey = {
  __: (key: string) => key
};

const api = new ZaptecApi('1.0.0', mockHomey);

describe('Zaptec API Client', () => {
  it('should use token after authentication', async () => {
    nock('https://api.zaptec.com')
      .post('/oauth/token', 'grant_type=password&username=test&password=123&scope=offline_access')
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

  it('should retry after being rate limited', async function () {
    this.timeout(5000);

    nock('https://api.zaptec.com')
      .get('/api/chargers/abc')
      .reply(429, '', { 'Retry-After': '0' })
      .get('/api/chargers/abc')
      .reply(200, { Id: 'abc' });

    const charger = await api.getCharger('abc');
    assert.strictEqual(charger.Id, 'abc');
  });

  it('should retry when DNS lookup fails', async function () {
    this.timeout(5000);

    nock('https://api.zaptec.com')
      .get('/api/chargers/abc')
      .replyWithError(Object.assign(new Error('getaddrinfo ENOTFOUND api.zaptec.com'), { code: 'ENOTFOUND' }))
      .get('/api/chargers/abc')
      .reply(200, { Id: 'abc' });

    const charger = await api.getCharger('abc');
    assert.strictEqual(charger.Id, 'abc');
  });

  it('should read errors serialized by the Homey runtime', () => {
    // nock can't emit a non-Error, so the unwrapping is tested on its own
    const serialized = {
      $__type: 'Error',
      data: { message: 'getaddrinfo ENOTFOUND api.zaptec.com', code: 'ENOTFOUND' },
    };
    assert.deepStrictEqual(networkErrorDetails(serialized), {
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND api.zaptec.com',
    });
    assert.deepStrictEqual(
      networkErrorDetails(Object.assign(new Error('reset'), { code: 'ECONNRESET' })),
      { code: 'ECONNRESET', message: 'reset' },
    );
  });

  it('should fail without contacting Zaptec when no credentials are stored', async () => {
    const emptyApi = new ZaptecApi('1.0.0', mockHomey);
    // Any request reaching nock would fail with "No match" instead
    await assert.rejects(emptyApi.getCharger('abc'), MissingCredentialsError);
  });

  describe('with credentials', () => {
    const tokenReply = (token: string) => ({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 9000,
    });

    it('should log in once for concurrent requests', async function () {
      this.timeout(5000);
      const lazyApi = new ZaptecApi('1.0.0', mockHomey);
      lazyApi.setCredentials('lazy', 'secret');

      const login = nock('https://api.zaptec.com')
        .post('/oauth/token', 'grant_type=password&username=lazy&password=secret&scope=offline_access')
        .once()
        .reply(200, tokenReply('LAZY_TOKEN'));

      nock('https://api.zaptec.com')
        .matchHeader('Authorization', 'Bearer LAZY_TOKEN')
        .get('/api/chargers/a')
        .reply(200, { Id: 'a' })
        .get('/api/chargers/b')
        .reply(200, { Id: 'b' });

      await Promise.all([lazyApi.getCharger('a'), lazyApi.getCharger('b')]);
      assert.ok(login.isDone());
    });

    it('should log in again and retry once when the token is rejected', async function () {
      this.timeout(10000);
      const lazyApi = new ZaptecApi('1.0.0', mockHomey);
      lazyApi.setCredentials('retry', 'secret');

      nock('https://api.zaptec.com')
        .post('/oauth/token')
        .reply(200, tokenReply('OLD_TOKEN'))
        .post('/oauth/token')
        .reply(200, tokenReply('NEW_TOKEN'));

      nock('https://api.zaptec.com')
        .matchHeader('Authorization', 'Bearer OLD_TOKEN')
        .get('/api/chargers/abc')
        .reply(401, '');

      nock('https://api.zaptec.com')
        .matchHeader('Authorization', 'Bearer NEW_TOKEN')
        .get('/api/chargers/abc')
        .reply(200, { Id: 'abc' });

      const charger = await lazyApi.getCharger('abc');
      assert.strictEqual(charger.Id, 'abc');
    });

    it('should stop logging in after the credentials are rejected', async function () {
      this.timeout(10000);
      const lazyApi = new ZaptecApi('1.0.0', mockHomey);
      lazyApi.setCredentials('wrong', 'password');

      nock('https://api.zaptec.com').post('/oauth/token').once().reply(400, {});

      await assert.rejects(lazyApi.getCharger('abc'), InvalidCredentialsError);
      // No login is attempted, nock would fail the request with "No match"
      await assert.rejects(lazyApi.getCharger('abc'), InvalidCredentialsError);

      nock('https://api.zaptec.com')
        .post('/oauth/token')
        .reply(200, tokenReply('FIXED_TOKEN'))
        .get('/api/chargers/abc')
        .reply(200, { Id: 'abc' });

      lazyApi.setCredentials('wrong', 'fixed');
      const charger = await lazyApi.getCharger('abc');
      assert.strictEqual(charger.Id, 'abc');
    });
  });
});
