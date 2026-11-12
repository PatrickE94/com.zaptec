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
  if (ongoing) sessions.energy.set(ongoing, Number(stateValue(states, Observation.TotalChargePowerSession) ?? 0));

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
