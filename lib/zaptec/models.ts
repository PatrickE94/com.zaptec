import {
  ChargerOperationMode,
  ConnectionType,
  DeliveryArea,
  DeviceType,
  InstallationAuthenticationType,
  InstallationAvailableCurrentMode,
  InstallationNotification,
  InstallationType,
  InstallationUpdateStatusCode,
  MaxPhase,
  NetworkType,
  OcppCloudUrlVersion,
  Phase,
  SensorType,
  UserRole,
} from './enums';

/**
 * Structure of paged responses from the API
 */
export interface PagedData<T> {
  Pages?: number;
  Data?: T[] | null;
  Message?: string | null;
}

export interface ChargerListModel {
  /**
   * Format: uuid
   * @description Get the unique identifier of the charge point.
   */
  Id?: string;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {DeviceId} instead.
   */
  Mid?: string | null;
  /** @description Get the deviceId (serialNo) of the charging stations used with the charge point. */
  DeviceId?: string | null;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {Name} instead.
   */
  SerialNo?: string | null;
  /** @description Get the name of the charge point. */
  Name?: string | null;
  /**
   * Format: date-time
   * @description Get the date and time the installation was created.
   */
  CreatedOnDate?: string | null;
  /**
   * Format: uuid
   * @description Get the unique identifier the charge point is installed in.
   */
  CircuitId?: string | null;
  /** @description Get a value indicating whether the charge point is active. */
  Active?: boolean | null;
  CurrentUserRoles?: UserRole;
  /**
   * @description Get the charger PIN code. This will only be provided if your user is system owner
   * for the charge point.
   */
  Pin?: string | null;
  /**
   * Format: uuid
   * @description Get the unique identifier of the chargers firmware template.
   */
  TemplateId?: string | null;
  PropertyOcppUrl?: string | null;
  PropertyOcppPassword?: string | null;
  PropertyPinOfflinePhase?: boolean | null;
  PropertyAuthenticationDisabled?: boolean | null;
  HasSessions?: boolean | null;
  PropertyOfflinePhaseOverride?: Phase;
  /** Format: double */
  PropertyOfflineCurrentOverride?: number | null;
  /** Format: date-time */
  PropertyOcppVerboseLogUntil?: string | null;
  PropertyOcppDefaultIdTag?: string | null;
  /** Format: int32 */
  PropertyOcppWebSocketPingInterval?: number | null;
  /** Format: double */
  PropertyPrioritizedCurrent?: number | null;
  PropertyPrioritizedPhases?: MaxPhase;
  /** Format: double */
  PropertyMaxSinglePhaseChargeCurrent?: number | null;
  /** Format: int32 */
  PropertyOcppAvailability?: number | null;
  /** Format: int32 */
  PropertyOcppOfflineListVersion?: number | null;
  /** Format: double */
  SignedMeterValueKwh?: number | null;
  SignedMeterValue?: string | null;
  DeviceType?: DeviceType;
  InstallationName?: string | null;
  /** Format: uuid */
  InstallationId?: string | null;
  AuthenticationType?: InstallationAuthenticationType;
  IsAuthorizationRequired?: boolean | null;
  OperatingMode?: ChargerOperationMode;
  IsOnline?: boolean;
  Warnings?: string | null;
}

export interface ZapChargerViewModel {
  /**
   * Format: uuid
   * @description Get the unique identifier of the charge point.
   */
  Id?: string;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {DeviceId} instead.
   */
  Mid?: string | null;
  /** @description Get the deviceId (serialNo) of the charging stations used with the charge point. */
  DeviceId?: string | null;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {Name} instead.
   */
  SerialNo?: string | null;
  /** @description Get the name of the charge point. */
  Name?: string | null;
  /**
   * Format: date-time
   * @description Get the date and time the installation was created.
   */
  CreatedOnDate?: string | null;
  /**
   * Format: uuid
   * @description Get the unique identifier the charge point is installed in.
   */
  CircuitId?: string | null;
  /** @description Get a value indicating whether the charge point is active. */
  Active?: boolean | null;
  CurrentUserRoles?: UserRole;
  /**
   * @description Get the charger PIN code. This will only be provided if your user is system owner
   * for the charge point.
   */
  Pin?: string | null;
  /**
   * Format: uuid
   * @description Get the unique identifier of the chargers firmware template.
   */
  TemplateId?: string | null;
  PropertyOcppUrl?: string | null;
  PropertyOcppPassword?: string | null;
  PropertyPinOfflinePhase?: boolean | null;
  PropertyAuthenticationDisabled?: boolean | null;
  HasSessions?: boolean | null;
  PropertyOfflinePhaseOverride?: Phase;
  /** Format: double */
  PropertyOfflineCurrentOverride?: number | null;
  /** Format: date-time */
  PropertyOcppVerboseLogUntil?: string | null;
  PropertyOcppDefaultIdTag?: string | null;
  /** Format: int32 */
  PropertyOcppWebSocketPingInterval?: number | null;
  /** Format: double */
  PropertyPrioritizedCurrent?: number | null;
  PropertyPrioritizedPhases?: MaxPhase;
  /** Format: double */
  PropertyMaxSinglePhaseChargeCurrent?: number | null;
  /** Format: int32 */
  PropertyOcppAvailability?: number | null;
  /** Format: int32 */
  PropertyOcppOfflineListVersion?: number | null;
  /** Format: double */
  SignedMeterValueKwh?: number | null;
  SignedMeterValue?: string | null;
  DeviceType?: DeviceType;
  InstallationName?: string | null;
  /** Format: uuid */
  InstallationId?: string | null;
  AuthenticationType?: InstallationAuthenticationType;
  IsAuthorizationRequired?: boolean | null;
}

export interface ChargerStateModel {
  /** Format: uuid */
  ChargerId?: string;
  /** Format: int32 */
  StateId?: number;
  StateName?: string | null;
  /** Format: date-time */
  Timestamp?: string;
  ValueAsString?: string | null;
}

export interface InstallationUserModel {
  /**
   * Format: uuid
   * @description The unique identifier for the authorized user, or null if unauthorized or
   * authorized by 3rd party.
   */
  UserId?: string | null;
  /**
   * @description The full name of the authorized user, or null if unauthorized or authorized by
   * 3rd party.
   */
  UserFullName?: string | null;
  /**
   * @description The email of the authorized user, or null if unauthorized or authorized by
   * 3rd party.
   */
  UserEmail?: string | null;
  /** @description The RFID tokens used to authorize sessions. */
  UserTokens?: string[] | null;
}

export interface SensorModel {
  UniqueId?: string | null;
  Type?: SensorType;
  Provider?: string | null;
  Vendor?: string | null;
  Model?: string | null;
  SerialNo?: string | null;
  /** Format: uuid */
  Id?: string | null;
}

export interface UserGroupModel {
  /** Format: uuid */
  Id?: string | null;
  Name?: string | null;
  /** Format: date-time */
  CreatedOn?: string | null;
  /** Format: date-time */
  UpdatedOn?: string | null;
  LookupKey?: string | null;
  CurrentUserRoles?: UserRole;
  Protected?: boolean;
  ServiceLevelSupport?: boolean | null;
  /** Format: uuid */
  LogoId?: string | null;
  LogoContentType?: string | null;
  LogoBase64?: string | null;
  SupportUrl?: string | null;
  SupportEmail?: string | null;
  SupportPhone?: string | null;
  SupportDetails?: string | null;
  PropertyMessagingAllowed?: boolean | null;
  PropertyMessagingEnabled?: boolean | null;
  TransferrableExperimentalFeatures?: number;
}

export interface SensorReadingTableEntity {
  PartitionKey?: string | null;
  RowKey?: string | null;
  /** Format: date-time */
  Timestamp?: string;
  ETag?: string | null;
  UniqueId?: string | null;
  /** Format: date-time */
  ObservedAt?: string;
  /** Format: double */
  CurrentPhase1?: number;
  /** Format: double */
  CurrentPhase2?: number;
  /** Format: double */
  CurrentPhase3?: number;
  /** Format: double */
  ChargeCurrentPhase1?: number;
  /** Format: double */
  ChargeCurrentPhase2?: number;
  /** Format: double */
  ChargeCurrentPhase3?: number;
  /** Format: double */
  AvailableCurrentPhase1?: number | null;
  /** Format: double */
  AvailableCurrentPhase2?: number | null;
  /** Format: double */
  AvailableCurrentPhase3?: number | null;
  /** Format: double */
  CurrentNeutral?: number | null;
  /** Format: double */
  VoltagePhase1?: number | null;
  /** Format: double */
  VoltagePhase2?: number | null;
  /** Format: double */
  VoltagePhase3?: number | null;
  StatusCode?: string | null;
  StatusMessage?: string | null;
  /** Format: int32 */
  Ripple?: number | null;
}

export interface InstallationModel {
  /** Format: uuid */
  Id?: string;
  Name?: string | null;
  Address?: string | null;
  ZipCode?: string | null;
  City?: string | null;
  /** Format: uuid */
  CountryId?: string | null;
  VatNumber?: string | null;
  ContactEmail?: string | null;
  InstallationType?: InstallationType;
  /** Format: double */
  MaxCurrent?: number | null;
  /** Format: double */
  AvailableCurrent?: number | null;
  /** Format: double */
  AvailableCurrentPhase1?: number | null;
  /** Format: double */
  AvailableCurrentPhase2?: number | null;
  /** Format: double */
  AvailableCurrentPhase3?: number | null;
  AvailableCurrentMode?: InstallationAvailableCurrentMode;
  AvailableCurrentScheduleWeekendActive?: boolean | null;
  /** Format: double */
  ThreeToOnePhaseSwitchCurrent?: number | null;
  /** Format: uuid */
  InstallationCategoryId?: string | null;
  InstallationCategory?: string | null;
  UseLoadBalancing?: boolean | null;
  IsRequiredAuthentication?: boolean | null;
  /** Format: double */
  Latitude?: number | null;
  /** Format: double */
  Longitude?: number | null;
  Notes?: string | null;
  Active?: boolean | null;
  NetworkType?: NetworkType;
  AvailableInternetAccessPLC?: boolean | null;
  AvailableInternetAccessWiFi?: boolean | null;
  /** Format: date-time */
  CreatedOnDate?: string | null;
  /** Format: date-time */
  UpdatedOn?: string | null;
  CurrentUserRoles?: UserRole;
  AuthenticationType?: InstallationAuthenticationType;
  WebhooksAuthPayload?: string | null;
  WebhooksAuthUrl?: string | null;
  WebhooksSessionStartUrl?: string | null;
  WebhooksSessionEndUrl?: string | null;
  MessagingEnabled?: boolean | null;
  RoutingId?: string | null;
  OcppCloudUrl?: string | null;
  OcppCloudUrlVersion?: OcppCloudUrlVersion;
  OcppInitialChargePointPassword?: string | null;
  /** @description Time zone display name */
  TimeZoneName?: string | null;
  /** @description IANA time zone identifier */
  TimeZoneIanaName?: string | null;
  UpdateStatusCode?: InstallationUpdateStatusCode;
  Notifications?: InstallationNotification;
  IsSubscriptionsAvailableForCurrentUser?: boolean | null;
  InstallationUsers?: InstallationUserModel[] | null;
  AvailableFeatures?: number;
  EnabledFeatures?: number;
  /** Format: int32 */
  ActiveChargerCount?: number | null;
  /** Format: int32 */
  Feature_PowerManagement_EcoMode_DepartureTime?: number | null;
  /** Format: double */
  Feature_PowerManagement_EcoMode_MinEnergy?: number | null;
  Feature_PowerManagement_EcoMode_DeliveryArea?: DeliveryArea;
  Feature_PowerManagement_Apm_SinglePhaseMappedToPhase?: Phase;
  /** Format: double */
  Feature_PowerManagement_Apm_PowerBudgetKw?: number | null;
  /** Format: double */
  Feature_PowerManagement_Apm_PowerRolloverPercentage?: number | null;
  /** Format: double */
  Feature_PowerManagement_Apm_EvaluationMinutes?: number | null;
  /** Format: int32 */
  PropertyTariffKwhLimit?: number | null;
  PropertyIsMinimumPowerOfflineMode?: boolean | null;
  PropertyOfflineModeAllowAnonymous?: boolean | null;
  PropertyEnergySensorUniqueId?: string | null;
  EnergySensor?: SensorModel;
  /** Format: double */
  PropertyMainFuseCurrent?: number | null;
  /** Format: int32 */
  PropertyEnergySensorTransmitInterval?: number | null;
  /** Format: double */
  PropertyEnergySensorTransmitThreshold?: number | null;
  /** Format: int32 */
  PropertyEnergySensorAverage?: number | null;
  /** Format: double */
  PropertyMinimumAvailableCurrentPhase1?: number | null;
  /** Format: double */
  PropertyMinimumAvailableCurrentPhase2?: number | null;
  /** Format: double */
  PropertyMinimumAvailableCurrentPhase3?: number | null;
  PropertyLockToMinimumAvailableCurrent?: boolean | null;
  PropertyOcppDefaultIdTag?: string | null;
  PropertyExperimentalFeaturesEnabled?: number;
  PropertyEnergySensorRippleEnabled?: boolean | null;
  /** Format: int32 */
  PropertyEnergySensorRippleNumBits?: number | null;
  /** Format: int32 */
  PropertyEnergySensorRipplePercentBits01?: number | null;
  /** Format: int32 */
  PropertyEnergySensorRipplePercentBits10?: number | null;
  PropertyHomeApmOrdered?: boolean | null;
  /** Format: double */
  PropertyEnergySensorScalingFactor?: number | null;
  PropertyFirmwareAutomaticUpdates?: boolean | null;
  /** Format: double */
  PropertyMaxSinglePhaseChargeCurrent?: number | null;
  /**
   * Format: int32
   * @description The maximum number of times a session can be stopped before the charging station will stick to single
   * phase charging. Note that start commands that require phase shifting will require a stop and will add to
   * the counter.
   */
  PropertySessionMaxStopCount?: number | null;
  StorageEnergySensorLastReading?: SensorReadingTableEntity;
  SupportGroup?: UserGroupModel;
}

export interface ChargerExternalUpdateModel {
  /**
   * Format: double
   * @description Adjustable between 0 and 32A. If charge current is below the charger minimum charge
   * current (usually 6A), no charge current will be allocated.
   */
  MaxChargeCurrent?: number | null;
  MaxChargePhases?: MaxPhase;
  /**
   * Format: double
   * @description The minimum allocated charge current. If there is not enough current available to
   * provide the chargers minimum current it will not be able to charge. Usually set to
   * match the vehicle minimum current for charging (defaults to 6A).
   */
  MinChargeCurrent?: number | null;
  /**
   * Format: double
   * @description Adjustable between 0 and 32A. If offline charge current is below the charger minimum charge
   * current (usually 6A), no charge current will be allocated when offline.
   * Offline current override should only be done in special cases where charging
   * stations should not automatically optimize offline current. In most cases
   * this setting should be set to -1 to allow ZapCloud to optimise offline current.
   * If -1, offline current will be automatically allocated.
   */
  OfflineChargeCurrent?: number | null;
  OfflineChargePhase?: Phase;
  /**
   * Format: int32
   * @description The interval in seconds for a charger to report meter values.
   * Defaults to 900 seconds for Pro and 3600 seconds for Go
   */
  MeterValueInterval?: number | null;
}

export interface ConnectionDescriptor {
  Type?: ConnectionType;
  Host?: string | null;
  Port?: number;
  UseSSL?: boolean;
  Username?: string | null;
  Password?: string | null;
  Topic?: string | null;
  Subscription?: string | null;
}

export interface ChargePriority {
  PrioritizedPhases?: MaxPhase;
  /** Format: double */
  PrioritizedCurrent?: number | null;
}

export interface SessionEndData {
  /** Format: double */
  Energy?: number;
  /** Format: date-time */
  SessionEnd?: string | null;
  /** Format: uuid */
  SessionId?: string;
  /** Format: date-time */
  SessionStart?: string;
  SignedSession?: string | null;
}

export interface InstallationTreeChargerModel {
  /**
   * Format: uuid
   * @description Get the unique identifier of the charge point.
   */
  Id?: string;
  /** @description Get the deviceId (serialNo) of the charging stations used with the charge point. */
  DeviceId?: string | null;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {DeviceId} instead.
   */
  Mid?: string | null;
  /** @description Get the name of the charge point. */
  Name?: string | null;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {Name} instead.
   */
  SerialNo?: string | null;
  /** @description Get a value indicating whether the charge point is active. */
  Active?: boolean | null;
  DeviceType?: DeviceType;
}

export interface InstallationTreeCircuitModel {
  /**
   * Format: uuid
   * @description Get the unique identifier of the circuit.
   */
  Id?: string;
  /** @description Get the circuit name. */
  Name?: string | null;
  /**
   * Format: double
   * @description Get the circuit max current (fuse rating).
   */
  MaxCurrent?: number;
  /** @description Get a value indicating whether the circuit is active. */
  IsActive?: boolean;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {IsActive} instead.
   */
  Active?: boolean;
  /**
   * Format: uuid
   * @description Get the unique identifier of the circuits parent installation.
   */
  InstallationId?: string;
  /** @description Get the name of the circuits parent installation. */
  InstallationName?: string | null;
  /** @description Get a list of charger installed in the circuit. */
  Chargers?: InstallationTreeChargerModel[] | null;
}

export interface InstallationTreeModel {
  /**
   * Format: uuid
   * @description Get the unique identifier of the installation.
   */
  Id?: string;
  /** @description Get the installation name. */
  Name?: string | null;
  /**
   * @deprecated
   * @description <strong>This property is obsolete and is scheduled for removal,</strong>
   *             please use {InstallationName} instead.
   */
  InstallationName?: string | null;
  /**
   * Format: int32
   * @description Get the installation electrical grid type Id. Please refer to the Zaptec integration
   * document for information for explanation of grid type Id.
   */
  NetworkType?: number | null;
  /** @description Get a list of circuits managed by the installation. */
  Circuits?: InstallationTreeCircuitModel[] | null;
}

export interface InstallationExternalUpdateModel {
  /**
   * Format: double
   * @description Available current to set on all phases.
   */
  AvailableCurrent?: number | null;
  /**
   * Format: double
   * @description Available current to set on phase 1. When setting current on individual phases, any
   * phase without specified current will be set to default.
   */
  AvailableCurrentPhase1?: number | null;
  /**
   * Format: double
   * @description Available current to set on phase 2. When setting current on individual phases, any
   * phase without specified current will be set to default.
   */
  AvailableCurrentPhase2?: number | null;
  /**
   * Format: double
   * @description Available current to set on phase 3. When setting current on individual phases, any
   * phase without specified current will be set to default.
   */
  AvailableCurrentPhase3?: number | null;
  /**
   * Format: double
   * @description The maximum allowed current for the installation. This setting requires caller to
   * have service permission (electrician) for the installation.
   */
  MaxCurrent?: number | null;
  /**
   * @description When set to true, offline power will be limited to the chargers miniumum
   * charge current.
   */
  MinPowerOfflineMode?: boolean | null;
}

/**
 * The OAuth token endpoint is untyped in the Swagger document.
 * Let's type it here to avoid silly mistakes.
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}
