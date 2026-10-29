import assert from 'assert';
import { senseCapabilityValue } from './sense';
import { senseDevices } from './api';
import { DeviceType, SenseObservation } from './enums';

describe('senseCapabilityValue', () => {
  it('should report active power in watts', () => {
    const state = { StateId: SenseObservation.ActivePowerKw, ValueAsString: '3.456' };

    assert.deepStrictEqual(senseCapabilityValue(state), { capability: 'measure_power', value: 3456 });
  });

  it('should keep exported power negative', () => {
    const state = { StateId: SenseObservation.ActivePowerKw, ValueAsString: '-1.2' };

    assert.deepStrictEqual(senseCapabilityValue(state), { capability: 'measure_power', value: -1200 });
  });

  it('should map the meter totals to imported and exported energy', () => {
    const imported = { StateId: SenseObservation.AMSCumulativeEnergyImport, ValueAsString: '12345.6' };
    const exported = { StateId: SenseObservation.AMSCumulativeEnergyExport, ValueAsString: '78.9' };

    assert.deepStrictEqual(senseCapabilityValue(imported), { capability: 'meter_power.imported', value: 12345.6 });
    assert.deepStrictEqual(senseCapabilityValue(exported), { capability: 'meter_power.exported', value: 78.9 });
  });

  it('should map phase current and voltage', () => {
    const state = { StateId: SenseObservation.CurrentPhase2, ValueAsString: '7.5' };

    assert.deepStrictEqual(senseCapabilityValue(state), { capability: 'measure_current.phase2', value: 7.5 });
  });

  it('should skip missing and non-numeric values', () => {
    assert.strictEqual(
      senseCapabilityValue({ StateId: SenseObservation.ActivePowerKw, ValueAsString: null }),
      undefined,
    );
    assert.strictEqual(senseCapabilityValue({ StateId: SenseObservation.ActivePowerKw, ValueAsString: '' }), undefined);
    assert.strictEqual(
      senseCapabilityValue({ StateId: SenseObservation.MeterType, ValueAsString: 'Kaifa' }),
      undefined,
    );
  });
});

describe('senseDevices', () => {
  it('should find a Sense by prefix or by device type', () => {
    const chargers = [
      { DeviceId: 'APH123456' },
      { DeviceId: 'XYZ123456', DeviceType: DeviceType.HanApm },
      { DeviceId: 'GPN123456', DeviceType: DeviceType.Apollo },
    ];

    assert.deepStrictEqual(senseDevices(chargers), chargers.slice(0, 2));
  });
});
