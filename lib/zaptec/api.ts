import http from 'http';
import https from 'https';
import querystring from 'querystring';
import { ApiError, InvalidCredentialsError, MissingCredentialsError } from './error';
import {
  RateLimiter,
  apiLimiterFor,
  backoffWithJitter,
  parseRetryAfter,
  sleep,
  tokenEndpointLimiter,
} from './ratelimit';
import {
  Command,
  DeviceType,
  InstallationType,
  UserRole,
  Feature,
  MODEL_PREFIX_MAP,
  SENSE_DEVICE_TYPES,
} from './enums';
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

// Configure global https agent with proper maxSockets
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 25,
  maxFreeSockets: 10,
  timeout: 15000,
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
  session: undefined,
  sessionTimeout: 60,
});

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
async function request(path: string, options: http.RequestOptions, data?: string): Promise<Response<string>> {
  return new Promise<Response<string>>((resolve, reject) => {
    const req = https.request(
      `https://api.zaptec.com${path}`,
      {
        ...options,
        agent, // Use our configured agent
      },
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
    req.on('timeout', () => reject(new Error(`Request timed out after 15 seconds`)));
    if (data !== undefined) req.write(data);
    req.end();
  });
}

/**
 * Read the code and message of a failed request.
 *
 * The Homey runtime hands network errors over serialized as
 * { $__type: 'Error', data: { code, message } } rather than as an Error.
 */
export function networkErrorDetails(error: any): { code?: string; message?: string } {
  const { code, message } = error?.data ?? error ?? {};
  return { code, message };
}

/**
 * Perform a HTTP request against the Zaptec API, respecting rate limits and
 * retrying on 429 responses and transient errors.
 *
 * Every attempt waits for a token from the given limiter. On 429 the whole
 * limiter is paused, so every device sharing it backs off together rather
 * than each one retrying into the limit on its own.
 *
 * Assumes a 15s timeout is wanted.
 *
 * @param {RateLimiter} limiter - Limiter shared by all requests counted against the same limit.
 * @param {string} path - URL path to endpoint
 * @param {[http.RequestOptions]} options - Generic Node HTTP options to pass with request
 * @param {[string]} data - Any data to write as the body of the request.
 * @param {[number]} maxRetries - Maximum number of retries before giving up.
 * @returns {Response<string>} A response object with the response body and HTTP message object.
 */
async function requestWithBackoff(
  limiter: RateLimiter,
  path: string,
  options: https.RequestOptions,
  data?: string,
  maxRetries = 5,
): Promise<Response<string>> {
  let retries = 0;
  let backoff = 500;
  let lastError: Error | null = null;

  while (retries < maxRetries) {
    try {
      await limiter.acquire();
      const response = await request(path, options, data);

      // Handle nginx errors (500, 502, 503, 504)
      const statusCode = response.response.statusCode || 0;
      if ([500, 502, 503, 504].includes(statusCode) && response.data.includes('nginx')) {
        await sleep(backoffWithJitter(retries, backoff));
        retries += 1;
        continue;
      }

      // If not a 429 response, return immediately
      if (response.response.statusCode !== 429) return response;

      // Respect Retry-After, but keep growing the delay if we keep hitting the
      // limit. Pausing the limiter holds back every request sharing it, and
      // this request waits for the pause when acquiring its next token.
      const retryAfter = parseRetryAfter(response.response.headers['retry-after']);
      limiter.pause(Math.max(retryAfter ?? 1000, backoffWithJitter(retries, 1000)));
      lastError = new Error('Rate limited by the Zaptec API');
      retries += 1;
    } catch (error: any) {
      const { code, message } = networkErrorDetails(error);
      lastError = new Error(message, { cause: error });

      // If it's a network error, database availability error, or TLS error, retry
      if (
        (code
          && [
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ECONNRESET',
            'ENETUNREACH',
            'EPROTO', // TLS protocol error
            'ECONNABORTED', // Connection was aborted
            'ERR_SSL_WRONG_VERSION_NUMBER', // TLS version mismatch
            'DEPTH_ZERO_SELF_SIGNED_CERT', // Self-signed certificate
            'EAI_AGAIN', // DNS lookup timed out
            'ENOTFOUND', // DNS lookup failed, seen briefly on Homey
          ].includes(code))
        || message?.includes('availability replica config/state change')
        || message?.includes('before secure TLS connection was established')
        || message?.includes('Request timed out')
      ) {
        // For timeouts, connection resets, and DNS errors, use longer backoff
        if (
          message?.includes('Request timed out')
          || code === 'ECONNRESET'
          || code === 'EAI_AGAIN'
          || code === 'ENOTFOUND'
        ) {
          backoff = Math.max(backoff, 2000); // Minimum 2 sekunder for disse feilene
        }

        await sleep(backoffWithJitter(retries, backoff));
        retries += 1;
        continue;
      }

      // If it's not a retryable error, throw immediately
      throw new Error(`Network error while communicating with charger: ${message}`, {
        cause: error,
      });
    }
  }

  // If we get here, we've exceeded max retries
  const baseMsg = `Could not reach charger after ${maxRetries} attempts`;
  const errorDetail = lastError ? `: ${lastError.message}` : '';
  throw new Error(`${baseMsg}${errorDetail}. Please check your internet connection and try again.`, {
    cause: lastError?.cause,
  });
}

/**
 * Simple HTTP wrapper around the Zaptec API
 */
export class ZaptecApi {
  private version: string;
  protected bearerToken?: string;
  private homey: any;
  private account = '';
  private credentials?: { username: string; password: string };
  private tokenExpiresAt = 0;
  private login?: Promise<number>;
  private rejectedLogin?: InvalidCredentialsError;

  constructor(version: string, homey: any) {
    this.version = version;
    this.homey = homey;
  }

  protected async get<T>(path: string, options: http.RequestOptions): Promise<Response<T>> {
    return this.send<T>('GET', path, undefined, options);
  }

  protected async post<T>(path: string, data?: string | object, options?: http.RequestOptions): Promise<Response<T>> {
    return this.send<T>('POST', path, data, options);
  }

  protected async put<T>(path: string, data?: string | object, options?: http.RequestOptions): Promise<Response<T>> {
    return this.send<T>('PUT', path, data, options);
  }

  /**
   * Store the credentials used to log in when a request needs a token.
   *
   * Setting them again lets a rejected login be tried once more, as Zaptec
   * can reject a correct password for a while.
   */
  public setCredentials(username: string, password: string) {
    this.rejectedLogin = undefined;
    if (this.credentials?.username === username && this.credentials?.password === password) return;
    this.credentials = { username, password };
    this.bearerToken = undefined;
  }

  /**
   * Make sure we hold a token which isn't about to expire.
   *
   * Concurrent callers share a single login. Once the credentials are
   * rejected we stop trying until new ones are set, so a wrong password
   * doesn't keep the shared token endpoint busy.
   */
  private async ensureToken() {
    if (this.credentials === undefined) {
      // Pairing logs in directly with authenticate() instead
      if (this.bearerToken !== undefined) return;
      throw new MissingCredentialsError();
    }
    if (this.rejectedLogin !== undefined) throw this.rejectedLogin;
    if (this.bearerToken !== undefined && Date.now() < this.tokenExpiresAt - 60_000) return;

    const { username, password } = this.credentials;
    this.login ??= this.authenticate(username, password)
      .catch((e) => {
        if (e instanceof InvalidCredentialsError) this.rejectedLogin = e;
        throw e;
      })
      .finally(() => {
        this.login = undefined;
      });
    await this.login;
  }

  /**
   * Send a request and decode the JSON response.
   *
   * Objects are sent as JSON, strings as form data. Logs in first when we have
   * credentials, and once more if the token is rejected.
   */
  private async send<T>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    data?: string | object,
    options?: http.RequestOptions,
  ): Promise<Response<T>> {
    const isLogin = path.startsWith('/oauth/token');
    if (!isLogin) await this.ensureToken();

    let response = await this.sendOnce(method, path, data, options);
    if (response.response.statusCode === 401 && !isLogin && this.credentials !== undefined) {
      this.bearerToken = undefined;
      await this.ensureToken();
      response = await this.sendOnce(method, path, data, options);
    }

    let responseData;
    try {
      responseData = response.data.length > 0 ? JSON.parse(response.data) : response.data;
    } catch {
      throw new Error(`Failed to parse response: ${response.data}`);
    }

    if (response.response.statusCode === 500) {
      // Service returned error, decode the error code
      if ('Code' in responseData) throw new ApiError(responseData.Code, responseData.Details);
    }

    return {
      data: responseData,
      response: response.response,
    };
  }

  private async sendOnce(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    data?: string | object,
    options?: http.RequestOptions,
  ): Promise<Response<string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': this.getUserAgent(),
    };

    if (method !== 'GET') {
      headers['Content-Type'] = typeof data === 'object' ? 'application/json' : 'application/x-www-form-urlencoded';
    }

    if (this.bearerToken !== undefined) headers.Authorization = `Bearer ${this.bearerToken}`;

    return requestWithBackoff(
      this.limiterFor(path),
      path,
      {
        method,
        headers,
        ...options,
      },
      typeof data === 'object' ? JSON.stringify(data) : data,
    );
  }

  /**
   * Pick the rate limiter a request counts against.
   */
  private limiterFor(path: string): RateLimiter {
    if (path.startsWith('/oauth/token')) return tokenEndpointLimiter();
    return apiLimiterFor(this.account);
  }

  public async authenticate(username: string, password: string): Promise<number> {
    const { data, response } = await this.post<TokenResponse>(
      '/oauth/token',
      querystring.stringify({
        grant_type: 'password',
        username,
        password,
        scope: 'offline_access',
      }),
    );

    if (response.statusCode === 200) {
      if (data.token_type.toLowerCase() !== 'bearer') {
        throw new Error(`Invalid token type received ${data.token_type}, expected Bearer`);
      }

      this.bearerToken = data.access_token;
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
      this.account = username;
      return data.expires_in;
    }

    if (response.statusCode === 400) {
      throw new InvalidCredentialsError();
    } else {
      throw new Error(`Unexpected authentication response of ${response.statusCode}`);
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
        throw new Error(`Unexpected response statusCode ${response.statusCode}`);
      }

      const pageData = data.Data ?? [];
      if (!Array.isArray(pageData)) {
        throw new Error(`Expected Data to be an array, but got ${typeof pageData}`);
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

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getCharger(id: string) {
    const { data, response } = await this.get<ZapChargerViewModel>(`/api/chargers/${id}`, {});

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateCharger(id: string, properties: ChargerExternalUpdateModel): Promise<void> {
    const { response } = await this.post(`/api/chargers/${id}/update`, properties);

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async getChargerState(id: string) {
    const { data, response } = await this.get<ChargerStateModel[]>(`/api/chargers/${id}/state`, {});

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async sendCommand(chargerId: string, command: Command): Promise<void> {
    const { response } = await this.post(`/api/chargers/${chargerId}/sendCommand/${command}`);

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async lockCharger(chargerId: string, lock: boolean): Promise<void> {
    const { response } = await this.post<TokenResponse>(`/api/chargers/${chargerId}/localSettings`, {
      Cable: {
        PermanentLock: lock,
      },
    });

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
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

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallation(id: string) {
    const { data, response } = await this.get<InstallationModel>(`/api/installation/${id}`, {});

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallationMessagingConnectionDetails(id: string) {
    const { data, response } = await this.get<ConnectionDescriptor>(
      `/api/installation/${id}/messagingConnectionDetails`,
      {},
    );

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateInstallation(id: string, properties: InstallationExternalUpdateModel): Promise<void> {
    const { response } = await this.post(`/api/installation/${id}/update`, properties);

    if (response.statusCode === 403) {
      throw new Error(this.homey.__('errors.missing_auth_permissions'));
    }

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  /**
   * Update installation properties
   *
   * @param id Installation ID
   * @param properties Properties to update
   * @returns Promise resolving when successful
   */
  public async updateInstallationProperties(
    id: string,
    properties: { EnabledFeatures?: Feature; IsRequiredAuthentication?: boolean },
  ): Promise<void> {
    const { response } = await this.put(`/api/installation/${id}`, properties);

    if (response.statusCode === 403) {
      throw new Error(this.homey.__('errors.missing_auth_permissions'));
    }

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  /**
   * Update authentication requirements for an installation
   *
   * @param id Installation ID
   * @param requireAuthentication Whether authentication is required
   * @returns Promise resolving when successful
   */
  public async updateInstallationAuthenticationRequirement(id: string, requireAuthentication: boolean): Promise<void> {
    // This endpoint requires a direct PUT to the installation with both Id and IsRequiredAuthentication
    const { response } = await this.put(`/api/installation/${id}`, {
      Id: id,
      IsRequiredAuthentication: requireAuthentication,
    });

    if (response.statusCode === 403) {
      throw new Error(this.homey.__('errors.missing_auth_permissions'));
    }

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  public async getInstallationHierarchy(id: string) {
    const { data, response } = await this.get<InstallationTreeModel>(`/api/installation/${id}/hierarchy`, {});

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  Session
  // -------------------------- //

  public async getSession(id: string) {
    const { data, response } = await this.get<SessionEndData>(`/api/session/${id}`, {});

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateSessionPriority(id: string, properties: ChargePriority): Promise<void> {
    const { response } = await this.post(`/api/session/${id}/priority`, properties);

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);
  }

  // -------------------------- //
  //  UserGroup
  // -------------------------- //

  public async getUserGroupsMessagingConnectionDetails(id: string) {
    const { data, response } = await this.get<ConnectionDescriptor>(
      `/api/userGroups/${id}/messagingConnectionDetails`,
      {},
    );

    if (response.statusCode !== 200) throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  User Agent
  // -------------------------- //

  private getUserAgent(): string {
    return `AthomHomey/com.zaptec/${this.version} (https://github.com/PatrickE94/com.zaptec)`;
  }
}

/**
 * Keep the chargers of a model, recognised by their deviceId prefix
 * @param chargers Chargers to filter
 * @param modelName Model name to filter by (e.g., 'Pro', 'Go')
 */
export function chargersOfModel(chargers: ChargerListModel[], modelName: string) {
  const prefixes = MODEL_PREFIX_MAP[modelName];
  if (!prefixes) {
    throw new Error(`Unknown model name: ${modelName}`);
  }

  return chargers.filter((charger) => {
    if (!charger.DeviceId || charger.DeviceId.length < 3) return false;
    return prefixes.includes(charger.DeviceId.substring(0, 3));
  });
}

/**
 * Find the Zaptec Sense devices among the chargers.
 *
 * Nobody has confirmed which prefixes a Sense has, so its device type counts
 * too.
 */
export function senseDevices(chargers: ChargerListModel[]) {
  const prefixes = MODEL_PREFIX_MAP.Sense;
  return chargers.filter(
    (charger) =>
      (charger.DeviceType !== undefined && SENSE_DEVICE_TYPES.includes(charger.DeviceType))
      || prefixes.includes(charger.DeviceId?.substring(0, 3) ?? ''),
  );
}

/**
 * Describe a charger list for the log, to see why pairing finds no devices.
 * Only the deviceId prefix is included, it is what models are matched on.
 */
export function describeChargers(chargers: PagedData<ChargerListModel>) {
  const list = chargers.Data ?? [];
  const lines = list.map(
    (c) =>
      `- prefix=${c.DeviceId?.substring(0, 3) ?? 'none'} DeviceType=${c.DeviceType} `
      + `Active=${c.Active} Roles=${c.CurrentUserRoles}`,
  );
  return [`Got ${list.length} chargers over ${chargers.Pages} pages`, ...lines].join('\n');
}
