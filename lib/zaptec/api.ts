import http from 'http';
import https from 'https';
import querystring from 'querystring';
import { ApiError } from './error';
import { Command, DeviceType, InstallationType, UserRole } from './enums';
import {
  ChargePriority,
  ChargerExternalUpdateModel,
  ChargerListModel,
  ChargerStateModel,
  ConnectionDescriptor,
  InstallationExternalUpdateModel,
  InstallationModel,
  InstallationTreeModel,
  PagedData,
  SessionEndData,
  TokenResponse,
  ZapChargerViewModel,
  SessionListModel,
} from './models';

/**
 * A wrapped HTTP response with some convenience
 */
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

/**
 * Perform a HTTP request against the Zaptec API and handle 429 responses with backoff
 *
 * This is a convenience function to promisify the HTTP API, alongside sane defaults.
 *
 * Assumes a 15s timeout is wanted.
 *
 * @param {string} path - URL path to endpoint
 * @param {[http.RequestOptions]} options - Generic Node HTTP options to pass with request
 * @param {[string]} data - Any data to write as the body of the request.
 * @param {[number]} maxRetries - Maximum number of retries before giving up.
 * @returns {Response<string>} A response object with the response body and HTTP message object.
 */
async function requestWithBackoff(
  path: string,
  options: https.RequestOptions,
  data?: string,
  maxRetries = 5,
): Promise<Response<string>> {
  let retries = 0;
  let backoff = 500;

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(() => resolve(), ms);
    });

  while (retries < maxRetries) {
    const response = await request(path, options, data);

    // If not a 429 response, return immediately
    if (response.response.statusCode !== 429) return response;

    // If retry after header is set, use that value
    const retryAfter = response.response.headers['retry-after'];
    if (retryAfter !== undefined && retryAfter) {
      const retryAfterSeconds = Number(retryAfter);
      if (!Number.isNaN(retryAfterSeconds)) backoff = retryAfterSeconds * 1000;
    }

    // Wait and increase backoff time
    await delay(backoff);
    backoff *= 2; // Exponential backoff
    retries += 1;
  }

  throw new Error(`Max retries exceeded for path: ${path}`);
}

/**
 * Simple HTTP wrapper around the Zaptec API
 */
export class ZaptecApi {
  private version: string;
  protected bearerToken?: string;

  constructor(version: string) {
    this.version = version;
  }

  protected async get<T>(
    path: string,
    options: http.RequestOptions,
  ): Promise<Response<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.getUserAgent(),
    };

    if (this.bearerToken !== undefined)
      headers.Authorization = `Bearer ${this.bearerToken}`;

    const response = await requestWithBackoff(path, {
      method: 'GET',
      headers,
      ...options,
    });

    let responseData;
    try {
      responseData =
        response.data.length > 0 ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error(`Failed to parse response: ${response.data}`);
    }

    if (response.response.statusCode === 500) {
      // Service returned error, decode the error code
      if ('Code' in responseData)
        throw new ApiError(responseData.Code, responseData.Details);
    }

    return {
      data: responseData,
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
      'User-Agent': this.getUserAgent(),
    };

    if (this.bearerToken !== undefined)
      headers.Authorization = `Bearer ${this.bearerToken}`;

    const response = await requestWithBackoff(
      path,
      {
        method: 'POST',
        headers,
        ...options,
      },
      typeof data === 'object' ? JSON.stringify(data) : data,
    );

    let responseData;
    try {
      responseData =
        response.data.length > 0 ? JSON.parse(response.data) : response.data;
    } catch (e) {
      throw new Error(`Failed to parse response: ${response.data}`);
    }

    if (response.response.statusCode === 500) {
      // Service returned error, decode the error code
      if ('Code' in responseData)
        throw new ApiError(responseData.Code, responseData.Details);
    }

    return {
      data: responseData,
      response: response.response,
    };
  }

  public async authenticate(
    username: string,
    password: string,
  ): Promise<number> {
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
      return data.expires_in;
    }

    if (response.statusCode === 400) {
      throw new Error(`Username or password is invalid`);
    } else {
      throw new Error(
        `Unexpected authentication response of ${response.statusCode}`,
      );
    }
  }

  // -------------------------- //
  //  Charge History
  // -------------------------- //

  public async getChargeHistory(params: {
    InstallationId?: string;
    UserId?: string;
    ChargerId?: string;
    From?: string;
    To?: string;
    GroupBy?: 0 | 1 | 2;
    DetailLevel?: 0 | 1;
    SortProperty?: string;
    SortDescending?: boolean;
    PageSize?: number;
    PageIndex?: number;
    IncludeDisabled?: boolean;
    Exclude?: string[];
  }): Promise<SessionListModel[]> {
    let allData: SessionListModel[] = [];
    let currentPage = 0;
    const pageSize = params.PageSize || 50;
    let totalPages = 1;

    while (currentPage < totalPages) {
      const { data, response } = await this.get<PagedData<SessionListModel>>(
        `/api/chargehistory?${querystring.stringify({
          ...params,
          PageSize: pageSize,
          PageIndex: currentPage,
        })}`,
        {},
      );

      if (response.statusCode !== 200) {
        throw new Error(
          `Unexpected response statusCode ${response.statusCode}`,
        );
      }

      const pageData = data.Data ?? [];
      if (!Array.isArray(pageData)) {
        throw new Error(
          `Expected Data to be an array, but got ${typeof pageData}`,
        );
      }

      allData = allData.concat(pageData);

      totalPages = data.Pages ?? 0;
      if (currentPage >= totalPages - 1) break;

      currentPage += 1;
    }

    return allData;
  }

  // -------------------------- //
  //  Chargers
  // -------------------------- //

  public async getChargers(params: {
    Roles?: UserRole;
    DeviceType?: DeviceType;
    InstallationType?: InstallationType;
    NameFilter?: string;
    ReturnIdNameOnly?: boolean;
    SortProperty?: string;
    SortDescending?: boolean;
    PageSize?: number;
    PageIndex?: number;
    IncludeDisabled?: boolean;
    Exclude?: string[];
  }) {
    const { data, response } = await this.get<PagedData<ChargerListModel>>(
      `/api/chargers?${querystring.stringify(params)}`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getCharger(id: string) {
    const { data, response } = await this.get<ZapChargerViewModel>(
      `/api/chargers/${id}`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateCharger(
    id: string,
    properties: ChargerExternalUpdateModel,
  ): Promise<void> {
    const { response } = await this.post(
      `/api/chargers/${id}/update`,
      properties,
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async getChargerState(id: string) {
    const { data, response } = await this.get<ChargerStateModel[]>(
      `/api/chargers/${id}/state`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async sendCommand(chargerId: string, command: Command): Promise<void> {
    const { response } = await this.post(
      `/api/chargers/${chargerId}/sendCommand/${command}`,
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async lockCharger(chargerId: string, lock: boolean): Promise<void> {
    const { data, response } = await this.post<TokenResponse>(
      `/api/chargers/${chargerId}/localSettings`,
      {
        Cable: {
          PermanentLock: lock,
        },
      },
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async setHmiBrightness(chargerId: string, brightness: number): Promise<void> {
    if (brightness < 0 || brightness > 1) 
      throw new Error(`Unexpected brightness value ${brightness}`);    
    const { data, response } = await this.post<TokenResponse>(
      `/api/chargers/${chargerId}/localSettings`,
      {
        Device: {
          HmiBrightness: brightness,
        },
      },
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);
    
  }

  // -------------------------- //
  //  Installation
  // -------------------------- //

  public async getInstallations(params: {
    Roles?: UserRole;
    InstallationType?: InstallationType;
    ExcludeIfVisibleForUserGroupLookupKey?: string;
    NameFilter?: string;
    ReturnIdNameOnly?: boolean;
    SortProperty?: string;
    SortDescending?: boolean;
    PageSize?: number;
    PageIndex?: number;
    IncludeDisabled?: boolean;
    Exclude?: string[];
  }) {
    const { data, response } = await this.get<PagedData<InstallationModel>>(
      `/api/installation?${querystring.stringify(params)}`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallation(id: string) {
    const { data, response } = await this.get<InstallationModel>(
      `/api/installation/${id}`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallationMessagingConnectionDetails(id: string) {
    const { data, response } = await this.get<ConnectionDescriptor>(
      `/api/installation/${id}/messagingConnectionDetails`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateInstallation(
    id: string,
    properties: InstallationExternalUpdateModel,
  ): Promise<void> {
    const { response } = await this.post(
      `/api/installation/${id}/update`,
      properties,
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async getInstallationHierarchy(id: string) {
    const { data, response } = await this.get<InstallationTreeModel>(
      `/api/installation/${id}/hierarchy`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  Session
  // -------------------------- //

  public async getSession(id: string) {
    const { data, response } = await this.get<SessionEndData>(
      `/api/session/${id}`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateSessionPriority(
    id: string,
    properties: ChargePriority,
  ): Promise<void> {
    const { response } = await this.post(
      `/api/session/${id}/priority`,
      properties,
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  // -------------------------- //
  //  UserGroup
  // -------------------------- //

  public async getUserGroupsMessagingConnectionDetails(id: string) {
    const { data, response } = await this.get<ConnectionDescriptor>(
      `/api/userGroups/${id}/messagingConnectionDetails`,
      {},
    );

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  User Agent
  // -------------------------- //

  private getUserAgent(): string {
    return `AthomHomey/com.zaptec/${this.version} (https://github.com/PatrickE94/com.zaptec)`;
  }
}
