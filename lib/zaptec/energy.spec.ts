import assert from 'assert';
import { archivedYear, chargerSessions, liveMeter, MeterSession, yearlyEnergy } from './energy';
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

describe('Live meter', () => {
  const at = (states: { StateId: number; ValueAsString: string }[]) => chargerSessions(states, 2026);

  /** Run polls in order, carrying the meter and session from one to the next */
  function run(start: number, polls: { signed?: number; states: { StateId: number; ValueAsString: string }[] }[]) {
    let value = start;
    let session: MeterSession | undefined;
    const values: number[] = [];
    for (const poll of polls) {
      ({ value, session } = liveMeter(value, poll.signed, session, at(poll.states)));
      values.push(Math.round(value * 1000) / 1000);
    }
    return { values, session };
  }

  it('follows the signed meter between sessions', () => {
    const { values } = run(100, [
      { signed: 100, states: idle },
      { signed: 101, states: idle },
    ]);
    assert.deepStrictEqual(values, [100, 101]);
  });

  it('counts the session on top of where it started, ignoring signed readings during it', () => {
    const { values } = run(100, [
      { signed: 100, states: ongoing('c', 0) },
      { signed: 100, states: ongoing('c', 2) },
      // The signed meter already holds part of the session
      { signed: 101.5, states: ongoing('c', 4) },
    ]);
    assert.deepStrictEqual(values, [100, 102, 104]);
  });

  it('holds after the session until the signed meter passes it', () => {
    const { values, session } = run(100, [
      { signed: 100, states: ongoing('c', 0) },
      { signed: 100, states: ongoing('c', 4.9) },
      // Ended between polls, with more energy than last read
      { signed: 101.5, states: [...idle, completed('c', 5)] },
      { signed: 104.99, states: [...idle, completed('c', 5)] },
      { signed: 105.2, states: [...idle, completed('c', 5)] },
    ]);
    assert.deepStrictEqual(values, [100, 104.9, 105, 105, 105.2]);
    assert.strictEqual(session, undefined);
  });

  it('counts a session starting before the signed meter has the previous one', () => {
    const { values } = run(100, [
      { signed: 100, states: ongoing('c', 0) },
      { signed: 100, states: [...idle, completed('c', 5)] },
      { signed: 100, states: [...ongoing('d', 0), completed('c', 5)] },
      { signed: 100, states: [...ongoing('d', 3), completed('c', 5)] },
    ]);
    assert.deepStrictEqual(values, [100, 105, 105, 108]);
  });

  it('does not count energy the signed meter has when picking up a session midway', () => {
    // E.g. the first poll after an update, with 3 kWh charged and the signed meter at 102
    const { values } = run(102, [
      { signed: 102, states: ongoing('c', 3) },
      { signed: 102, states: ongoing('c', 4) },
    ]);
    assert.deepStrictEqual(values, [102, 103]);
  });

  it('carries on after a restart from the saved session', () => {
    const session = { id: 'c', base: 100 };
    const { value } = liveMeter(103, 102, session, at(ongoing('c', 4)));
    assert.strictEqual(value, 104);
  });

  it('never decreases', () => {
    const { values } = run(110, [{ signed: 100, states: idle }]);
    assert.deepStrictEqual(values, [110]);
  });
});
