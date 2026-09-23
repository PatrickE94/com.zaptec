import assert from 'assert';
import {
  canResumeCharging,
  canStopCharging,
  chargeControlStateFromStates,
} from './charging';
import { ChargerOperationMode } from './enums';

const states = (mode: number, finalStop?: string) => [
  { StateId: 710, ValueAsString: `${mode}` },
  ...(finalStop !== undefined
    ? [{ StateId: 718, ValueAsString: finalStop }]
    : []),
];

describe('Charge control state', () => {
  it('should parse charger states', () => {
    assert.deepStrictEqual(chargeControlStateFromStates(states(5, '1')), {
      operationMode: ChargerOperationMode.Connected_Finishing,
      finalStopActive: true,
    });
  });

  it('should allow resume only when paused', () => {
    const can = (...args: Parameters<typeof states>) =>
      canResumeCharging(chargeControlStateFromStates(states(...args)));

    assert.strictEqual(can(5, '1'), true);
    assert.strictEqual(can(2, '0'), false);
    assert.strictEqual(can(5, '0'), false);
    assert.strictEqual(can(3), false);
  });

  it('should reject stop when paused or disconnected', () => {
    const can = (...args: Parameters<typeof states>) =>
      canStopCharging(chargeControlStateFromStates(states(...args)));

    assert.strictEqual(can(3, '0'), true);
    assert.strictEqual(can(2, '0'), true);
    assert.strictEqual(can(5, '1'), false);
    assert.strictEqual(can(1, '0'), false);
  });
});
