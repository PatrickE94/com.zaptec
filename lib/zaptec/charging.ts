import { ChargerOperationMode, ErrorCode, Observation } from './enums';
import { ApiError } from './error';
import { ChargerStateModel } from './models';

/**
 * Why Zaptec rejected a resume, as far as the charger state tells.
 *
 * `charging` isn't a failure, the charger was already doing what we asked.
 */
export type ResumeRejection =
  | 'charging'
  | 'disconnected'
  | 'awaiting_authorization'
  | 'schedule_active'
  | 'car_stopped'
  | 'not_paused';

/**
 * Whether Zaptec refused a command because of the charger's state.
 */
export function isCommandRejected(e: unknown): boolean {
  return (
    e instanceof ApiError
    && (e.code === ErrorCode.DeviceCommandRejected || e.code === ErrorCode.OperationFailedDueToChargerState)
  );
}

function stateValue(states: ChargerStateModel[], id: Observation) {
  const value = states.find((s) => s.StateId === id)?.ValueAsString;
  return value === null || value === undefined || value === '' ? undefined : value;
}

function operationMode(states: ChargerStateModel[]) {
  return Number(
    stateValue(states, Observation.ChargerOperationMode) ?? ChargerOperationMode.Unknown,
  ) as ChargerOperationMode;
}

export function isCharging(states: ChargerStateModel[]) {
  return operationMode(states) === ChargerOperationMode.Connected_Charging;
}

/**
 * Explain a rejected ResumeCharging (507) from the charger state.
 *
 * Zaptec only resumes a session paused with StopChargingFinal (506), and not
 * while a schedule is active. There is no command to start a new session.
 * See https://docs.zaptec.com/docs/approaches-to-start-and-stop-charging-during-a-session
 */
export function whyResumeWasRejected(states: ChargerStateModel[]): ResumeRejection {
  const mode = operationMode(states);
  if (mode === ChargerOperationMode.Connected_Charging) return 'charging';
  if (mode === ChargerOperationMode.Disconnected) return 'disconnected';

  if (
    mode === ChargerOperationMode.Connected_Requesting
    && stateValue(states, Observation.SessionIdentifier) === undefined
    && stateValue(states, Observation.ChargerCurrentUserUuid) === undefined
  ) {
    return 'awaiting_authorization';
  }

  if (stateValue(states, Observation.NextScheduleEvent) !== undefined) return 'schedule_active';

  // Not every charger reports FinalStopActive, so only trust an explicit 0
  if (mode === ChargerOperationMode.Connected_Finishing && stateValue(states, Observation.FinalStopActive) === '0') {
    return 'car_stopped';
  }

  return 'not_paused';
}
