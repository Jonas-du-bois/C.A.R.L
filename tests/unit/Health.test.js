import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthReport, getHealthHttpStatus } from '../../src/utils/Health.js';

const now = new Date('2026-10-25T14:00:00.000Z');

describe('Health', () => {
  it('reports a fully healthy application with HTTP 200', () => {
    const report = buildHealthReport({
      database: true,
      whatsapp: true,
      ai: true,
      telegram: true,
      calendar: true
    }, now);

    assert.deepStrictEqual(report, {
      status: 'healthy',
      timestamp: now.toISOString(),
      whatsapp: 'connected',
      database: 'connected',
      ai: 'configured',
      telegram: 'configured',
      calendar: 'configured'
    });
    assert.equal(getHealthHttpStatus(report), 200);
  });

  it('reports disconnected dependencies as degraded with HTTP 200', () => {
    const report = buildHealthReport({
      database: true,
      whatsapp: false,
      ai: false,
      telegram: false,
      calendar: false
    }, now);

    assert.equal(report.status, 'degraded');
    assert.equal(report.whatsapp, 'disconnected');
    assert.equal(report.ai, 'unconfigured');
    assert.equal(getHealthHttpStatus(report), 200);
  });

  it('reports a database failure as unhealthy with HTTP 503', () => {
    const report = buildHealthReport({
      database: false,
      whatsapp: true,
      ai: true,
      telegram: true,
      calendar: true
    }, now);

    assert.equal(report.status, 'unhealthy');
    assert.equal(report.database, 'error');
    assert.equal(getHealthHttpStatus(report), 503);
  });

  it('accepts explicit dependency status objects', () => {
    const report = buildHealthReport({
      database: { connected: true },
      whatsapp: { connected: true },
      ai: { configured: true },
      telegram: { configured: true },
      calendar: { configured: true }
    }, now);

    assert.equal(report.status, 'healthy');
  });
});
