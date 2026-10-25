function isConnected(value) {
  return value === true || value === 'connected' || value?.connected === true;
}

function isConfigured(value) {
  return value === true || value === 'configured' || value?.configured === true;
}

export function buildHealthReport(deps, now = new Date()) {
  const database = isConnected(deps.database);
  const whatsapp = isConnected(deps.whatsapp);
  const ai = isConfigured(deps.ai);
  const telegram = isConfigured(deps.telegram);
  const calendar = isConfigured(deps.calendar);
  const status = !database
    ? 'unhealthy'
    : [whatsapp, ai, telegram, calendar].every(Boolean)
      ? 'healthy'
      : 'degraded';

  return {
    status,
    timestamp: now.toISOString(),
    whatsapp: whatsapp ? 'connected' : 'disconnected',
    database: database ? 'connected' : 'error',
    ai: ai ? 'configured' : 'unconfigured',
    telegram: telegram ? 'configured' : 'unconfigured',
    calendar: calendar ? 'configured' : 'unconfigured'
  };
}

export function getHealthHttpStatus(report) {
  return report.status === 'unhealthy' ? 503 : 200;
}
