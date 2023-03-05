import { ErrorCode } from './enums';

function errToStr(code: number) {
  switch (code) {
    case ErrorCode.Unknown:
      return 'Unknown error';
    case ErrorCode.MissingRequiredData:
      return 'Missing required data';
    case ErrorCode.UnknownSetting:
      return 'Unkonwn setting';
    case ErrorCode.OperationFailedForUnknownReasons:
      return 'Operation failed for unknown reasons';
    case ErrorCode.NotApplicableForUser:
      return 'Not applicable for user';
    case ErrorCode.UnknownUser:
      return 'Unknown user';
    case ErrorCode.RfidTokenInUse:
      return 'RFID token in use';
    case ErrorCode.SignUpTooManyRequests:
      return 'Signup too many requests';
    case ErrorCode.EmailInUse:
      return 'Email is in use';
    case ErrorCode.CellPhoneInUse:
      return 'Cell phone is in use';
    case ErrorCode.UnknownObject:
      return 'Unknown object';
    case ErrorCode.InvalidPassword:
      return 'Invalid password';
    case ErrorCode.IncorrectPassword:
      return 'Incorrect password';
    case ErrorCode.UserActivationLinkExpired:
      return 'User activation link expired';
    case ErrorCode.LinkRequestExpired:
      return 'Link request expired';
    case ErrorCode.ChargerDeviceIdExists:
      return 'Charger device id already exists';
    case ErrorCode.UnknownDeviceId:
      return 'Unknown device id';
    case ErrorCode.UnknownCommand:
      return 'Unknown command';
    case ErrorCode.ErrorCommunicatingWithDevice:
      return 'Error communicating with device';
    case ErrorCode.StringIsNotAWellFormedVersion:
      return 'Invalid version string';
    case ErrorCode.FirmwareVersionExists:
      return 'Firmware version exists';
    case ErrorCode.FirmwareFileExists:
      return 'Firmware file exists';
    case ErrorCode.CreateConflict:
      return 'Create conflict';
    case ErrorCode.DeviceFirmwareNotConfigured:
      return 'Device firmware not configured';
    case ErrorCode.FeatureNotEnabled:
      return 'Feature not enabled';
    case ErrorCode.NotSupported:
      return 'Not supported';
    case ErrorCode.DeviceCommandRejected:
      return 'Device command rejected';
    case ErrorCode.InvalidFormat:
      return 'Invalid format';
    case ErrorCode.MailSendFailed:
      return 'Mail send failed';
    case ErrorCode.ConcurrencyError:
      return 'Concurrency error';
    case ErrorCode.ConfigurationError:
      return 'Configuration error';
    case ErrorCode.Forbidden:
      return 'Forbidden';
    case ErrorCode.InstallationTypeViolation:
      return 'Installation type violation';
    case ErrorCode.PaymentFailed:
      return 'Payment failed';
    case ErrorCode.PaymentAuthorizationRequired:
      return 'Payment authorization required';
    case ErrorCode.OperationFailedActiveSubscriptions:
      return 'Operation failed active subscriptions';
    case ErrorCode.OperationFailedDueToChargerState:
      return 'Operation failed due to charger state';
    case ErrorCode.InstallationConstraintViolation:
      return 'Installation constraint violation';
    case ErrorCode.UnknownInstallationId:
      return 'Unknown installation id';
    case ErrorCode.UnknownEnergySensorId:
      return 'Unknown energy sensor id';
    default:
      return `Unknown error code ${code}`;
  }
}

export class ApiError extends Error {
  constructor(code: number, details?: string | null) {
    super(`${errToStr(code)} ${details ? ': ' : ''} ${details}`);
  }
}
