import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDateForUser,
  formatTimeForUser,
  getEndOfDay,
  getStartOfDay,
  parseUserDate
} from '../../src/utils/DateTime.js';

const timezone = 'Europe/Paris';

describe('DateTime', () => {
  it('resolves winter local time to an UTC instant', () => {
    const result = parseUserDate('2026-01-15 20:30', {
      now: new Date('2026-01-01T12:00:00Z'),
      timezone
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.date.toISOString(), '2026-01-15T19:30:00.000Z');
  });

  it('resolves summer local time to an UTC instant', () => {
    const result = parseUserDate('2026-07-15 20:30', {
      now: new Date('2026-07-01T12:00:00Z'),
      timezone
    });

    assert.equal(result.status, 'ok');
    assert.equal(result.date.toISOString(), '2026-07-15T18:30:00.000Z');
  });

  it('handles relative dates independently of the process timezone', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const now = new Date('2026-01-15T12:00:00Z');
      const tomorrow = parseUserDate('demain 09h15', { now, timezone });
      const friday = parseUserDate('vendredi 09h15', { now, timezone });
      const evening = parseUserDate('ce soir', { now, timezone });

      assert.equal(tomorrow.status, 'ok');
      assert.equal(tomorrow.date.toISOString(), '2026-01-16T08:15:00.000Z');
      assert.equal(friday.status, 'ok');
      assert.equal(friday.date.toISOString(), '2026-01-16T08:15:00.000Z');
      assert.equal(evening.status, 'ok');
      assert.equal(evening.date.toISOString(), '2026-01-15T19:00:00.000Z');
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });

  it('accepts an ISO instant without reinterpretation', () => {
    const result = parseUserDate('2026-07-15T18:30:00.000Z', { timezone });
    assert.equal(result.status, 'ok');
    assert.equal(result.date.toISOString(), '2026-07-15T18:30:00.000Z');
  });

  it('requires clarification for a time without a date', () => {
    const result = parseUserDate('14h30', {
      now: new Date('2026-01-15T12:00:00Z'),
      timezone
    });
    assert.equal(result.status, 'ambiguous');
    assert.match(result.reason, /date/i);
  });

  it('rejects an invalid timezone and invalid input', () => {
    assert.throws(() => parseUserDate('demain', { timezone: 'Mars/Olympus' }), /Invalid timezone/);
    assert.equal(parseUserDate('32h90', { timezone }).status, 'invalid');
  });

  it('detects the spring DST gap and autumn repeated hour', () => {
    const missing = parseUserDate('2026-03-29 02:30', { timezone });
    const repeated = parseUserDate('2026-10-25 02:30', { timezone });

    assert.equal(missing.status, 'invalid');
    assert.equal(repeated.status, 'ambiguous');
    assert.equal(repeated.candidates.length, 2);
  });

  it('returns local day boundaries as UTC instants', () => {
    const date = new Date('2026-07-15T12:00:00Z');
    assert.equal(getStartOfDay(date, timezone).toISOString(), '2026-07-14T22:00:00.000Z');
    assert.equal(getEndOfDay(date, timezone).toISOString(), '2026-07-15T21:59:59.999Z');
  });

  it('formats dates and times in the configured timezone', () => {
    const date = new Date('2026-07-15T18:30:00Z');
    assert.equal(formatDateForUser(date, timezone), '15 juillet 2026');
    assert.equal(formatTimeForUser(date, timezone), '20:30');
  });
});
