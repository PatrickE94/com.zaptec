import { Observation } from './enums';
import { ArchivedSession, ChargerStateModel } from './models';

/**
 * This year's archived sessions, as summed by the daily fetch.
 */
export interface ArchivedYear {
  year: number;
  /** Energy of the sessions that weren't voided, in kWh */
  energy: number;
  /** Every archived session, voided ones too, so none is counted twice */
  ids: Set<string>;
}

/**
 * Sessions the charger knows about that may not be archived yet.
 */
export interface ChargerSessions {
  /** Energy by session id, in kWh */
  energy: Map<string, number>;
  /** The session the charger is in now */
  ongoing?: string;
  /** The last completed session, if it ended this year */
  completed?: string;
}

export function archivedYear(year: number, sessions: ArchivedSession[]): ArchivedYear {
  return {
    year,
    energy: sessions.filter((s) => !s.voided).reduce((sum, s) => sum + (s.energy ?? 0), 0),
    ids: new Set(sessions.map((s) => s.id)),
  };
}

function stateValue(states: ChargerStateModel[], id: Observation) {
  const value = states.find((s) => s.StateId === id)?.ValueAsString;
  return value === null || value === undefined || value === '' ? undefined : value;
}

/**
 * The ongoing session, and the last completed session if it ended in `year`.
 *
 * The charger clears the session id and energy when a session ends, and
 * reports the ended session as the completed one, with the same id it gets in
 * the archive.
 */
export function chargerSessions(states: ChargerStateModel[], year: number): ChargerSessions {
  const sessions: ChargerSessions = { energy: new Map() };

  const ongoing = stateValue(states, Observation.SessionIdentifier);
  if (ongoing) {
    sessions.energy.set(ongoing, Number(stateValue(states, Observation.TotalChargePowerSession) ?? 0));
    sessions.ongoing = ongoing;
  }

  const completed = stateValue(states, Observation.CompletedSession);
  if (completed) {
    try {
      const session: { SessionId?: string; Energy?: string | number; EndDateTime?: string } = JSON.parse(completed);
      // A completed session's energy is final, so it wins over the ongoing reading
      const endedThisYear = session.EndDateTime && new Date(session.EndDateTime).getFullYear() === year;
      if (session.SessionId && endedThisYear) {
        sessions.energy.set(session.SessionId, Number(session.Energy ?? 0));
        sessions.completed = session.SessionId;
      }
    } catch {
      // A malformed completed session only means we can't count it early
    }
  }

  return sessions;
}

/**
 * The sessions not in the archive yet.
 */
function unarchived(archived: ArchivedYear, sessions: ChargerSessions): string[] {
  return [...sessions.energy.keys()].filter((id) => !archived.ids.has(id));
}

/**
 * This year's energy: the archived sessions, plus the sessions not archived yet.
 *
 * Once a session is archived it's part of the archived energy and is no
 * longer added on top.
 */
export function yearlyEnergy(archived: ArchivedYear, sessions: ChargerSessions): number {
  return unarchived(archived, sessions).reduce((sum, id) => sum + (sessions.energy.get(id) ?? 0), archived.energy);
}

/**
 * The session the live meter counts on top of, saved so a restart doesn't
 * count it twice.
 */
export interface MeterSession {
  id: string;
  /** The meter at the start of the session, in kWh */
  base: number;
}

/**
 * A lifetime meter for Homey Energy that moves while charging.
 *
 * Zaptec updates the signed meter about once an hour. Between sessions the
 * meter follows it. During a session it counts the session's energy on top of
 * where the session started and ignores the signed meter, which may already
 * hold part of the session. After a session it holds until the signed meter
 * passes it. It never decreases, as Homey Energy requires.
 *
 * @param previous - the meter so far, in kWh
 * @param signed - the latest signed meter reading, in kWh
 * @param session - the session counted at the previous poll
 */
export function liveMeter(
  previous: number,
  signed: number | undefined,
  session: MeterSession | undefined,
  sessions: ChargerSessions,
): { value: number; session?: MeterSession } {
  let value = previous;
  let counting = session;

  // The session ended: count its final energy, reported once it completes
  if (counting && counting.id !== sessions.ongoing) {
    const final = sessions.energy.get(counting.id);
    if (final !== undefined) value = Math.max(value, counting.base + final);
    counting = undefined;
  }

  if (sessions.ongoing) {
    const energy = sessions.energy.get(sessions.ongoing) ?? 0;
    // Picking up a session midway, the signed meter may already hold part of
    // it, so start below rather than count it twice. The meter holds until the
    // signed meter catches up after the session.
    counting ??= { id: sessions.ongoing, base: Math.max(value, signed ?? 0) - energy };
    value = Math.max(value, counting.base + energy);
  } else if (signed !== undefined) {
    value = Math.max(value, signed);
  }

  return { value, session: counting };
}
