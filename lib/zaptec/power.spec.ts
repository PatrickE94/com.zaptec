import assert from 'assert';
import { NetworkType } from './enums';
import { currentForPower, powerLimits, targetPowerOptions } from './power';

const tn3 = { NetworkType: NetworkType.TN_3_Phase, MaxCurrent: 32 };

describe('Target power on a three-phase TN installation', () => {
  const go = powerLimits(tn3, 3, false);

  it('charges on three phases', () => {
    assert.strictEqual(currentForPower(11000, go), 15);
    assert.strictEqual(currentForPower(22080, go), 32);
  });

  it('rounds down so it never charges above the setpoint', () => {
    assert.strictEqual(currentForPower(11039, go), 15);
  });

  it("doesn't charge below the minimum three-phase power", () => {
    assert.strictEqual(currentForPower(4139, go), 0);
    assert.strictEqual(currentForPower(4140, go), 6);
    assert.strictEqual(targetPowerOptions(go).excludeMax, 4140);
  });

  it('stops at zero or negative setpoints', () => {
    assert.strictEqual(currentForPower(0, go), 0);
    assert.strictEqual(currentForPower(-1000, go), 0);
  });

  it('never asks for more than the installation allows', () => {
    const small = powerLimits({ ...tn3, MaxCurrent: 16 }, 3, false);
    assert.strictEqual(currentForPower(22080, small), 16);
    assert.strictEqual(targetPowerOptions(small).max, 11040);
  });

  it('offers the full range of the charger', () => {
    assert.deepStrictEqual(targetPowerOptions(go), {
      min: 0,
      max: 22080,
      step: 230,
      excludeMin: 0,
      excludeMax: 4140,
    });
  });
});

describe('Target power with phase switching', () => {
  const pro = powerLimits({ ...tn3, ThreeToOnePhaseSwitchCurrent: 15 }, 3, true);

  it('charges on one phase below the switch current', () => {
    assert.strictEqual(currentForPower(2300, pro), 10);
    assert.strictEqual(targetPowerOptions(pro).excludeMax, 1380);
  });

  it('stays on one phase in the gap below three-phase power', () => {
    // 15 A on three phases is 10350 W, one phase tops out at 14 A
    assert.strictEqual(currentForPower(6000, pro), 14);
  });

  it('charges on three phases from the switch current up', () => {
    assert.strictEqual(currentForPower(10350, pro), 15);
  });

  it('charges on three phases when no switch current is set', () => {
    const unset = powerLimits(tn3, 3, true);
    assert.strictEqual(currentForPower(2300, unset), 0);
    assert.strictEqual(targetPowerOptions(unset).excludeMax, 4140);
  });

  it('charges on one phase when the charger is limited to one', () => {
    const limited = powerLimits({ ...tn3, ThreeToOnePhaseSwitchCurrent: 15 }, 1, true);
    assert.strictEqual(currentForPower(7360, limited), 32);
    assert.strictEqual(targetPowerOptions(limited).max, 7360);
  });
});

describe('Target power on other grids', () => {
  it('uses √3 for three phases on IT', () => {
    const it3 = powerLimits({ NetworkType: NetworkType.IT_3_Phase, MaxCurrent: 32 }, 3, false);
    // 16 A at 230 V between phases is about 6374 W
    assert.strictEqual(currentForPower(6400, it3), 16);
    assert.strictEqual(targetPowerOptions(it3).max, 12747);
    assert.strictEqual(targetPowerOptions(it3).excludeMax, 2391);
  });

  it('charges on one phase on a single-phase grid', () => {
    const tn1 = powerLimits({ NetworkType: NetworkType.TN_1_Phase, MaxCurrent: 32 }, 3, true);
    assert.strictEqual(currentForPower(3680, tn1), 16);
    assert.strictEqual(targetPowerOptions(tn1).excludeMax, 1380);
  });

  it('assumes three phases when the grid type is unknown', () => {
    const unknown = powerLimits({}, undefined, false);
    assert.strictEqual(currentForPower(11040, unknown), 16);
  });
});
