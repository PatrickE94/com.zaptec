import assert from 'assert';
import { chargingStateFor, isCharging, isCommandRejected, operationModeFor, whyResumeWasRejected } from './charging';
import { ChargerOperationMode, ErrorCode, Observation } from './enums';
import { ApiError } from './error';

function states(values: Partial<Record<Observation, string | null>>) {
  return Object.entries(values).map(([id, value]) => ({
    StateId: Number(id),
    ValueAsString: value,
  }));
}

describe('Rejected resume', () => {
  it('is not a failure when the charger is already charging', () => {
    const s = states({ [Observation.ChargerOperationMode]: '3' });
    assert.strictEqual(whyResumeWasRejected(s), 'charging');
    assert.ok(isCharging(s));
  });

  it('explains that no car is connected', () => {
    const s = states({ [Observation.ChargerOperationMode]: '1' });
    assert.strictEqual(whyResumeWasRejected(s), 'disconnected');
  });

  it('explains a new session waiting for authorization', () => {
    const s = states({
      [Observation.ChargerOperationMode]: '2',
      [Observation.SessionIdentifier]: '',
      [Observation.ChargerCurrentUserUuid]: null,
    });
    assert.strictEqual(whyResumeWasRejected(s), 'awaiting_authorization');
  });

  it('explains an active schedule', () => {
    const s = states({
      [Observation.ChargerOperationMode]: '5',
      [Observation.FinalStopActive]: '1',
      [Observation.NextScheduleEvent]: '2026-10-26T22:00:00Z',
    });
    assert.strictEqual(whyResumeWasRejected(s), 'schedule_active');
  });

  it('explains a car that stopped charging by itself', () => {
    const s = states({
      [Observation.ChargerOperationMode]: '5',
      [Observation.FinalStopActive]: '0',
    });
    assert.strictEqual(whyResumeWasRejected(s), 'car_stopped');
  });

  it('does not guess when the charger lacks FinalStopActive', () => {
    const s = states({ [Observation.ChargerOperationMode]: '5' });
    assert.strictEqual(whyResumeWasRejected(s), 'not_paused');
  });

  it('only looks into errors where Zaptec refused the command', () => {
    assert.ok(isCommandRejected(new ApiError(ErrorCode.DeviceCommandRejected, 'Charging is not paused')));
    assert.ok(!isCommandRejected(new ApiError(ErrorCode.Forbidden)));
    assert.ok(!isCommandRejected(new Error('Network error')));
  });
});

describe('Charging state', () => {
  it('maps every known operation mode and back', () => {
    for (const mode of [
      ChargerOperationMode.Disconnected,
      ChargerOperationMode.Connected_Requesting,
      ChargerOperationMode.Connected_Charging,
      ChargerOperationMode.Connected_Finishing,
    ]) {
      assert.strictEqual(operationModeFor(chargingStateFor(mode)), mode);
    }
  });

  it('reports a paused session as paused', () => {
    assert.strictEqual(chargingStateFor(ChargerOperationMode.Connected_Finishing), 'plugged_in_paused');
  });

  it('leaves the state empty when the mode is unknown', () => {
    assert.strictEqual(chargingStateFor(ChargerOperationMode.Unknown), null);
    assert.strictEqual(operationModeFor(null), ChargerOperationMode.Unknown);
  });
});
