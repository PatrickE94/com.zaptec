import { SenseObservation } from './enums';
import { ChargerStateModel } from './models';

/**
 * Observations worth logging once, so testers can tell us what a Sense
 * reports. Units are guesses until someone with a Sense confirms them.
 */
export const LOGGED_SENSE_OBSERVATIONS = [
  SenseObservation.MeterType,
  SenseObservation.ScalingFactor,
  SenseObservation.ActivePowerKw,
  SenseObservation.AMSCumulativeEnergyImport,
  SenseObservation.AMSCumulativeEnergyExport,
  SenseObservation.CurrentPhase1,
  SenseObservation.VoltagePhase1,
  SenseObservation.SenseStatusMessage,
];

const PHASE_CAPABILITIES: Partial<Record<SenseObservation, string>> = {
  [SenseObservation.CurrentPhase1]: 'measure_current.phase1',
  [SenseObservation.CurrentPhase2]: 'measure_current.phase2',
  [SenseObservation.CurrentPhase3]: 'measure_current.phase3',
  [SenseObservation.VoltagePhase1]: 'measure_voltage.phase1',
  [SenseObservation.VoltagePhase2]: 'measure_voltage.phase2',
  [SenseObservation.VoltagePhase3]: 'measure_voltage.phase3',
};

/**
 * The capability and value a Sense observation sets.
 *
 * @returns undefined for observations without a capability, or without a
 * number
 */
export function senseCapabilityValue(state: ChargerStateModel): { capability: string; value: number } | undefined {
  if (state.ValueAsString === undefined || state.ValueAsString === null || state.ValueAsString === '') {
    return undefined;
  }
  const value = Number(state.ValueAsString);
  if (!Number.isFinite(value)) return undefined;

  switch (state.StateId) {
    // Assumed to be the grid connection, positive when importing
    case SenseObservation.ActivePowerKw:
      return { capability: 'measure_power', value: Math.round(value * 1000) };

    // Assumed to be kWh, like the energy Zaptec reports for chargers
    case SenseObservation.AMSCumulativeEnergyImport:
      return { capability: 'meter_power.imported', value };

    case SenseObservation.AMSCumulativeEnergyExport:
      return { capability: 'meter_power.exported', value };

    case SenseObservation.CommunicationSignalStrength:
      return { capability: 'measure_signal_strength', value };

    default: {
      const capability = PHASE_CAPABILITIES[state.StateId as SenseObservation];
      return capability === undefined ? undefined : { capability, value };
    }
  }
}
