import http from 'node:http';
import https from 'node:https';
import querystring from 'node:querystring';
import { paths } from './apiSchema';

export enum GroupBy {
  Charger = 0,
  Day = 1,
  User = 2,
}

export enum DetailLevel {
  Summary = 0,
  EnergyDetails = 1,
}

export enum CommitMetadata {
  None = 0,
  Online = 1,
  Offline = 2,
  ReliableClock = 4,
  StoppedByRFID = 8,
  Signed = 16,
  Void = 32,
  Aborted = 64,
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface Response<T> {
  data: T;
  response: http.IncomingMessage;
}

/**
 * Perform a HTTP request against the Zaptec API
 *
 * This is a convenience function to promisify the HTTP API, alongside sane defaults.
 *
 * Assumes a 15s timeout is wanted.
 *
 * @param {string} path - URL path to endpoint
 * @param {[http.RequestOptions]} options - Generic Node HTTP options to pass with request
 * @param {[string]} data - Any data to write as the body of the request.
 * @returns {Response<string>} A response object with the response body and HTTP message object.
 */
async function request(
  path: string,
  options: http.RequestOptions,
  data?: string,
): Promise<Response<string>> {
  return new Promise<Response<string>>((resolve, reject) => {
    const req = https.request(
      `https://api.zaptec.com${path}`,
      options,
      (response) => {
        const responseData: string[] = [];
        response.setEncoding('utf8');
        response.on('data', (chunk) => responseData.push(chunk));
        response.on('end', () => {
          try {
            resolve({
              data: responseData.join(''),
              response,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(15_000); // Default 15s timeout
    req.on('timeout', () => reject(new Error(`Request timed out`)));
    if (data !== undefined) req.write(data);
    req.end();
  });
}

export class ZaptecApi {
  protected bearerToken?: string;

  protected async get<T>(
    path: string,
    options: http.RequestOptions,
  ): Promise<Response<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.bearerToken !== undefined)
      headers.Authorization = `Bearer ${this.bearerToken}`;

    const response = await request(path, {
      method: 'GET',
      headers,
      ...options,
    });

    return {
      data: JSON.parse(response.data),
      response: response.response,
    };
  }

  protected async post<T>(
    path: string,
    data?: string | object,
    options?: http.RequestOptions,
  ): Promise<Response<T>> {
    const headers: Record<string, string> = {
      'Content-Type':
        typeof data === 'object'
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    if (this.bearerToken !== undefined)
      headers.Authorization = `Bearer ${this.bearerToken}`;

    const response = await request(
      path,
      {
        method: 'POST',
        headers,
        ...options,
      },
      typeof data === 'object' ? JSON.stringify(data) : data,
    );

    return {
      data: JSON.parse(response.data),
      response: response.response,
    };
  }

  public async authenticate(username: string, password: string): Promise<void> {
    const { data, response } = await this.post<TokenResponse>(
      '/oauth/token',
      querystring.stringify({
        grant_type: 'password',
        username,
        password,
      }),
    );

    if (response.statusCode === 200) {
      if (data.token_type !== 'Bearer') {
        throw new Error(
          `Invalid token type received ${data.token_type}, expected ${data.token_type}`,
        );
      }

      this.bearerToken = data.access_token;
      // TODO: Handle token expiry
    } else if (response.statusCode === 400) {
      throw new Error(`Username or password is invalid`);
    } else {
      throw new Error(
        `Unexpected authentication response of ${response.statusCode}`,
      );
    }
  }

  public async getChargers(
    params: paths['/api/chargers']['get']['parameters']['query'],
  ) {
    const { data, response } = await this.get<
      paths['/api/chargers']['get']['responses'][200]['content']['application/json']
    >(`/api/chargers?${querystring.stringify(params)}`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getCharger(id: string) {
    const { data, response } = await this.get<
      paths['/api/chargers/{id}']['get']['responses'][200]['content']['application/json']
    >(`/api/chargers/${id}`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  /*
  public static async chargeHistory(
    installationId: string,
    userId: string,
    chargerId: string,
    from: Date,
    to: Date,
    groupBy = GroupBy.Charger,
    detailLevel = DetailLevel.Summary,
    sortProperty?: string,
    sortDescending = false,
    pageSize = 500,
    pageIndex = 0,
    includeDisabled = false,
    exclude: string[] = [],
  ): Promise<PagedData<SessionList>> {
    if (pageSize > 5000) throw new Error('Page size must be lower than 5000');

    const response = await http.get<PagedData<SessionList>>({
      uri: 'https://api.zaptec.com/api/chargehistory',
      form: {
        InstallationId: installationId,
        UserId: userId,
        ChargerId: chargerId,
        From: from,
        To: to,
        GroupBy: groupBy,
        DetailLevel: detailLevel,
        SortProperty: sortProperty,
        SortDescending: sortDescending,
        PageSize: pageSize,
        PageIndex: pageIndex,
        IncludeDisabled: includeDisabled,
        Exclude: exclude,
      },
    });

    if (response.response.statusCode === 200) return response.data;

    throw new Error(
      `API request failed with status ${response.response.statusCode}`,
    );
  }
  */
}
