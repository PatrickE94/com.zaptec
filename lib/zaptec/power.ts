import { NetworkType } from './enums';
import { InstallationModel } from './models';

/** Voltage of one phase, or between two phases on an IT grid. */
const VOLTAGE = 230;

/** Below this current Zaptec allocates no charge current. */
export const MIN_CURRENT = 6;

/** The most a Zaptec charger delivers per phase. */
const CHARGER_MAX_CURRENT = 32;

/**
 * What decides how much power a per-phase available current gives.
 */
export interface PowerLimits {
  /** Phases the charger charges on at most */
  phases: 1 | 3;
  /** IT grids have 230 V between phases, so three phases give √3 times the power of one, not 3 */
  it: boolean;
  /** Pro and Go 2 charge on one phase while the available current is below `switchCurrent` */
  switchesPhases: boolean;
  switchCurrent?: number;
  maxCurrent: number;
}

/**
 * Work out the power limits from the installation and the charger's own phase setting.
 *
 * @param chargerMaxPhases - MaxPhases from the charger state, if it reports it
 * @param switchesPhases - whether the charger model switches between three and one phase
 */
export function powerLimits(
  installation: InstallationModel,
  chargerMaxPhases: number | undefined,
  switchesPhases: boolean,
): PowerLimits {
  const network = installation.NetworkType;
  const onePhaseGrid = network === NetworkType.IT_1_Phase || network === NetworkType.TN_1_Phase;

  return {
    phases: onePhaseGrid || chargerMaxPhases === 1 ? 1 : 3,
    it: network === NetworkType.IT_1_Phase || network === NetworkType.IT_3_Phase,
    switchesPhases,
    switchCurrent: installation.ThreeToOnePhaseSwitchCurrent ?? undefined,
    maxCurrent: Math.min(CHARGER_MAX_CURRENT, installation.MaxCurrent ?? CHARGER_MAX_CURRENT),
  };
}

function wattsPerAmp(limits: PowerLimits, phases: 1 | 3) {
  if (phases === 1) return VOLTAGE;
  return limits.it ? VOLTAGE * Math.sqrt(3) : VOLTAGE * 3;
}

function switchesToOnePhase(limits: PowerLimits) {
  return limits.phases === 3 && limits.switchesPhases && limits.switchCurrent !== undefined;
}

/**
 * The per-phase available current that charges at no more than `watts`.
 *
 * Below the switch current a Pro or Go 2 charges on one phase, and above it
 * on three. With the default switch current of 15 A there is a gap between
 * the most one phase gives and the least three phases give, and setpoints in
 * it round down to one phase.
 *
 * @returns 0 when the charger can't charge that low
 */
export function currentForPower(watts: number, limits: PowerLimits): number {
  const usable = (current: number) => (current < MIN_CURRENT ? 0 : Math.min(current, limits.maxCurrent));
  if (watts <= 0) return 0;

  const onePhase = Math.floor(watts / VOLTAGE);
  if (limits.phases === 1) return usable(onePhase);

  const threePhase = Math.floor(watts / wattsPerAmp(limits, 3));
  if (!switchesToOnePhase(limits) || threePhase >= limits.switchCurrent!) return usable(threePhase);

  // Reaching the switch current would put it back on three phases
  return usable(Math.min(onePhase, Math.ceil(limits.switchCurrent!) - 1));
}

/**
 * The target_power range Homey can choose from.
 *
 * Setpoints between 0 and the least the charger can charge at are excluded,
 * Homey turns them into 0.
 */
export function targetPowerOptions(limits: PowerLimits) {
  const lowestPhases = switchesToOnePhase(limits) && limits.switchCurrent! > MIN_CURRENT ? 1 : limits.phases;

  return {
    min: 0,
    max: Math.floor(limits.maxCurrent * wattsPerAmp(limits, limits.phases)),
    step: VOLTAGE,
    excludeMin: 0,
    excludeMax: Math.ceil(MIN_CURRENT * wattsPerAmp(limits, lowestPhases)),
  };
}
