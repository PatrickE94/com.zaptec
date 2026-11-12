import assert from 'assert';
import { archivedYear, chargerSessions, yearlyEnergy } from './energy';
import { Observation } from './enums';
import { ArchivedSession } from './models';

const archived = (id: string, energy: number, voided = false) => ({ id, energy, voided }) as ArchivedSession;

const completed = (id: string, energy: number, end = '2026-11-12T06:24:59Z') => ({
  StateId: Observation.CompletedSession,
  ValueAsString: JSON.stringify({ SessionId: id, Energy: energy, EndDateTime: end }),
});

const ongoing = (id: string, energy: number) => [
  { StateId: Observation.SessionIdentifier, ValueAsString: id },
  { StateId: Observation.TotalChargePowerSession, ValueAsString: String(energy) },
];

// What the charger reports between sessions
const idle = [
  { StateId: Observation.SessionIdentifier, ValueAsString: '' },
  { StateId: Observation.TotalChargePowerSession, ValueAsString: '0.000' },
];

describe('Yearly energy', () => {
  const year = archivedYear(2026, [archived('a', 10), archived('b', 5)]);

  it('is the archived energy while no session is ongoing', () => {
    assert.strictEqual(yearlyEnergy(year, chargerSessions([...idle, completed('b', 5)], 2026)), 15);
  });

  it('adds the ongoing session', () => {
    assert.strictEqual(yearlyEnergy(year, chargerSessions([...ongoing('c', 2.5), completed('b', 5)], 2026)), 17.5);
  });

  it('keeps the completed session until it is archived', () => {
    assert.strictEqual(yearlyEnergy(year, chargerSessions([...idle, completed('c', 3)], 2026)), 18);
  });

  it('counts a completed session once while the charger still reports it as ongoing', () => {
    assert.strictEqual(yearlyEnergy(year, chargerSessions([...ongoing('c', 2.9), completed('c', 3)], 2026)), 18);
  });

  it('stops adding a session once it is archived', () => {
    const later = archivedYear(2026, [archived('a', 10), archived('b', 5), archived('c', 3)]);
    assert.strictEqual(yearlyEnergy(later, chargerSessions([...idle, completed('c', 3)], 2026)), 18);
  });

  it('leaves out voided sessions and their replacement once', () => {
    const corrected = archivedYear(2026, [archived('a', 10), archived('b', 0, true), archived('b2', 4)]);
    assert.strictEqual(yearlyEnergy(corrected, chargerSessions([...idle, completed('b', 5)], 2026)), 14);
  });

  it('does not add a session completed last year', () => {
    const newYear = archivedYear(2027, []);
    const sessions = chargerSessions([...idle, completed('z', 8, '2026-12-31T22:00:00Z')], 2027);
    assert.strictEqual(yearlyEnergy(newYear, sessions), 0);
    assert.strictEqual(sessions.completed, undefined);
  });
});
