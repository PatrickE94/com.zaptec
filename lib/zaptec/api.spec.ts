import nock from 'nock';
import { ZaptecApi } from './api';

describe('Zaptec API Client', () => {
  it('should use token after authentication', async () => {
    const api = new ZaptecApi();
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
    api.close();
  });
});
