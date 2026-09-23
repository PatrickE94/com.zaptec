import { ChargerOperationMode, Observation } from './enums';
import { ChargerStateModel } from './models';

/**
 * The parts of the charger state which decide if pause/resume is accepted.
 *
 * See the documentation of commands 506 and 507 on
 * https://api.zaptec.com/help/index.html#/Charger/Charger_SendCommand_POST
 */
export interface ChargeControlState {
  operationMode: ChargerOperationMode;
  finalStopActive: boolean;
}

function stateValue(states: ChargerStateModel[], id: Observation) {
  return states.find((s) => s.StateId === id)?.ValueAsString ?? undefined;
}

export function chargeControlStateFromStates(
  states: ChargerStateModel[],
): ChargeControlState {
  return {
    operationMode: Number(
      stateValue(states, Observation.ChargerOperationMode) ??
        ChargerOperationMode.Unknown,
    ) as ChargerOperationMode,
    finalStopActive: stateValue(states, Observation.FinalStopActive) === '1',
  };
}

export function isChargingPaused(state: ChargeControlState) {
  return (
    state.operationMode === ChargerOperationMode.Connected_Finishing &&
    state.finalStopActive
  );
}

/**
 * Only resume a paused charger, matching the Home Assistant integration.
 */
export function canResumeCharging(state: ChargeControlState) {
  return isChargingPaused(state);
}

/**
 * Zaptec rejects pause/stop if the charger is already paused or disconnected.
 */
export function canStopCharging(state: ChargeControlState) {
  return (
    !isChargingPaused(state) &&
    state.operationMode !== ChargerOperationMode.Disconnected
  );
}
