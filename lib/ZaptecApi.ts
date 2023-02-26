import http from 'node:http';
import https from 'node:https';
import querystring from 'node:querystring';
import { paths, components } from './apiSchema';

/**
 * The OAuth token endpoint is untyped in the Swagger document.
 * Let's type it here to avoid silly mistakes.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * A wrapped HTTP response with some convenience
 */
export interface Response<T> {
  data: T;
  response: http.IncomingMessage;
}

/**
 * Commands
 *
 * Reported via /api/constants endpoint
 */
export enum Command {
  RestartCharger = 102,
  StartCharging = 501,
  StopCharging = 502,
  ReportChargingState = 503,
  ResumeCharging = 507,
}

/**
 * Charger operation modes
 *
 * Reported via /api/constants endpoint
 */
export enum ChargerOperationModes {
  Unknown = 0,
  Disconnected = 1,
  Connected_Requesting = 2,
  Connected_Charging = 3,
  Connected_Finishing = 5,
}

/**
 * Observation ID's for a Smart device
 *
 * Reported via /api/constants endpoint
 */
export enum SmartDeviceObservations {
  Unknown = 0,
  OfflineMode = 1,
  AuthenticationRequired = 120,
  PaymentActive = 130,
  PaymentCurrency = 131,
  PaymentSessionUnitPrice = 132,
  PaymentEnergyUnitPrice = 133,
  PaymentTimeUnitPrice = 134,
  CommunicationMode = 150,
  PermanentCableLock = 151,
  ProductCode = 152,
  HmiBrightness = 153,
  LockCableWhenConnected = 154,
  SoftStartDisabled = 155,
  FirmwareApiHost = 156,
  MIDBlinkEnabled = 170,
  ProductionTesterEnabled = 180,
  ProductionTestStationOverride = 181,
  TemperatureInternal5 = 201,
  TemperatureInternal6 = 202,
  TemperatureInternalLimit = 203,
  TemperatureInternalMaxLimit = 241,
  Humidity = 270,
  TamperCover = 280,
  VoltagePhase1 = 501,
  VoltagePhase2 = 502,
  VoltagePhase3 = 503,
  CurrentPhase1 = 507,
  CurrentPhase2 = 508,
  CurrentPhase3 = 509,
  ChargerMaxCurrent = 510,
  ChargerMinCurrent = 511,
  ActivePhases = 512,
  TotalChargePower = 513,
  RcdCurrent = 515,
  Internal12vCurrent = 517,
  PowerFactor = 518,
  SetPhases = 519,
  MaxPhases = 520,
  ChargerOfflinePhase = 522,
  ChargerOfflineCurrent = 523,
  RcdCalibration = 540,
  RcdCalibrationNoise = 541,
  TotalChargePowerSession = 553,
  SignedMeterValue = 554,
  SignedMeterValueInterval = 555,
  SessionEnergyCountExportActive = 560,
  SessionEnergyCountExportReactive = 561,
  SessionEnergyCountImportActive = 562,
  SessionEnergyCountImportReactive = 563,
  SoftStartTime = 570,
  ChargeDuration = 701,
  ChargeMode = 702,
  ChargePilotLevelInstant = 703,
  ChargePilotLevelAverage = 704,
  PilotVsProximityTime = 706,
  ChargeCurrentInstallationMaxLimit = 707,
  ChargeCurrentSet = 708,
  ChargerOperationMode = 710,
  IsEnabled = 711,
  IsStandAlone = 712,
  ChargerCurrentUserUuidDeprecated = 713,
  CableType = 714,
  NetworkType = 715,
  DetectedCar = 716,
  GridTestResult = 717,
  FinalStopActive = 718,
  SessionIdentifier = 721,
  ChargerCurrentUserUuid = 722,
  CompletedSession = 723,
  PlugAndChargeAuthorizeRequest = 724,
  NewChargeCard = 750,
  AuthenticationListVersion = 751,
  EnabledNfcTechnologies = 752,
  LteRoamingDisabled = 753,
  Location = 760,
  TimeZone = 761,
  TimeSchedule = 762,
  NextScheduleEvent = 763,
  MaxStartDelay = 764,
  InstallationId = 800,
  RoutingId = 801,
  Notifications = 803,
  Warnings = 804,
  DiagnosticsMode = 805,
  InternalDiagnosticsLog = 807,
  DiagnosticsString = 808,
  CommunicationSignalStrength = 809,
  CloudConnectionStatus = 810,
  McuResetSource = 811,
  McuRxErrors = 812,
  McuToVariscitePacketErrors = 813,
  VarisciteToMcuPacketErrors = 814,
  UptimeVariscite = 820,
  UptimeMCU = 821,
  SecurityLog = 830,
  CarSessionLog = 850,
  CommunicationModeConfigurationInconsistency = 851,
  RawPilotMonitor = 852,
  IT3PhaseDiagnosticsLog = 853,
  PilotTestResults = 854,
  UnconditionalNfcDetectionIndication = 855,
  EmcTestCounter = 899,
  ProductionTestResults = 900,
  PostProductionTestResults = 901,
  SmartMainboardSoftwareApplicationVersion = 908,
  SmartMainboardSoftwareBootloaderVersion = 909,
  SmartComputerSoftwareApplicationVersion = 911,
  SmartComputerSoftwareBootloaderVersion = 912,
  SmartComputerHardwareVersion = 913,
  MacMain = 950,
  MacPlcModuleGrid = 951,
  MacWiFi = 952,
  MacPlcModuleEv = 953,
  LteImsi = 960,
  LteMsisdn = 961,
  LteIccid = 962,
  LteImei = 963,
  ProductionTestStationNumber = 970,
  MIDCalibration = 980,
  IsOcppConnected = -3,
  IsOnline = -2,
  Pulse = -1,
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
 * Simple HTTP wrapper around the Zaptec API
 */
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

  // -------------------------- //
  //  Chargers
  // -------------------------- //

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

  public async updateCharger(
    id: string,
    properties: paths['/api/chargers/{id}/update']['post']['requestBody'],
  ) {
    const { data, response } = await this.post<
      paths['/api/chargers/{id}/update']['post']['responses'][200]['content']['application/json']
    >(`/api/chargers/${id}/update`, properties);

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getChargerState(id: string) {
    const { data, response } = await this.get<
      paths['/api/chargers/{id}/state']['get']['responses'][200]['content']['application/json']
    >(`/api/chargers/${id}/state`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async sendCommand(chargerId: string, command: Command) {
    const { data, response } = await this.post<
      paths['/api/chargers/{id}/sendCommand/{commandId}']['post']['responses'][200]['content']['application/json']
    >(`/api/chargers/${chargerId}/sendCommand/${command}`);

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  Installation
  // -------------------------- //

  public async getInstallations(
    params: paths['/api/installation']['get']['parameters']['query'],
  ) {
    const { data, response } = await this.get<
      paths['/api/installation']['get']['responses'][200]['content']['application/json']
    >(`/api/installation?${querystring.stringify(params)}`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallation(id: string) {
    const { data, response } = await this.get<
      paths['/api/installation/{id}']['get']['responses'][200]['content']['application/json']
    >(`/api/installation/${id}`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallationMessagingConnectionDetails(id: string) {
    const { data, response } = await this.get<
      paths['/api/installation/{id}/messagingConnectionDetails']['get']['responses'][200]['content']['application/json']
    >(`/api/installation/${id}/messagingConnectionDetails`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateInstallation(
    id: string,
    properties: components['schemas']['InstallationExternalUpdateModel'],
  ) {
    const { data, response } = await this.post<
      paths['/api/installation/{id}/update']['post']['responses'][200]['content']['application/json']
    >(`/api/installation/${id}/update`, properties);

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async getInstallationHierarchy(id: string) {
    const { data, response } = await this.get<
      paths['/api/installation/{id}/hierarchy']['get']['responses'][200]['content']['application/json']
    >(`/api/installation/${id}/hierarchy`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  Session
  // -------------------------- //

  public async getSession(id: string) {
    const { data, response } = await this.get<
      paths['/api/session/{id}']['get']['responses'][200]['content']['application/json']
    >(`/api/session/${id}`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  public async updateSessionPriority(
    id: string,
    properties: paths['/api/session/{id}/priority']['post']['requestBody'],
  ) {
    const { data, response } = await this.post<
      paths['/api/session/{id}/priority']['post']['responses'][200]['content']['application/json']
    >(`/api/session/${id}/priority`, properties);

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }

  // -------------------------- //
  //  UserGroup
  // -------------------------- //

  public async getUserGroupsMessagingConnectionDetails(id: string) {
    const { data, response } = await this.get<
      paths['/api/userGroups/{id}/messagingConnectionDetails']['get']['responses'][200]['content']['application/json']
    >(`/api/userGroups/${id}/messagingConnectionDetails`, {});

    if (response.statusCode !== 200)
      throw new Error(`Unexpected response statusCode ${response.statusCode}`);

    return data;
  }
}
