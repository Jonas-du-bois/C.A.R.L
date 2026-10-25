const DEFAULT_TIMEZONE = 'Europe/Paris';
const WEEKDAYS = new Map([
  ['dimanche', 0],
  ['lundi', 1],
  ['mardi', 2],
  ['mercredi', 3],
  ['jeudi', 4],
  ['vendredi', 5],
  ['samedi', 6]
]);

export function validateTimezone(timezone = DEFAULT_TIMEZONE) {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function assertTimezone(timezone) {
  if (!validateTimezone(timezone)) {
    throw new RangeError(`Invalid timezone: ${timezone}`);
  }
}

function getParts(date, timezone) {
  assertTimezone(timezone);
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
}

function getOffsetMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const offset = parts.find(({ type }) => type === 'timeZoneName')?.value || 'GMT';
  const match = offset.match(/GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?/);
  if (!match?.groups?.sign) return 0;
  const minutes = Number(match.groups.hours) * 60 + Number(match.groups.minutes || 0);
  return match.groups.sign === '+' ? minutes : -minutes;
}

function sameParts(actual, expected) {
  return ['year', 'month', 'day', 'hour', 'minute', 'second']
    .every(key => actual[key] === expected[key]);
}

function localDateTimeCandidates(parts, timezone) {
  assertTimezone(timezone);
  const normalizedParts = { ...parts, second: parts.second || 0 };
  const naive = Date.UTC(
    normalizedParts.year,
    normalizedParts.month - 1,
    normalizedParts.day,
    normalizedParts.hour,
    normalizedParts.minute,
    normalizedParts.second,
    normalizedParts.millisecond || 0
  );
  const offsets = new Set();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(getOffsetMinutes(new Date(naive + hours * 60 * 60 * 1000), timezone));
  }

  return [...offsets]
    .map(offset => new Date(naive - offset * 60 * 1000))
    .filter(candidate => sameParts(getParts(candidate, timezone), normalizedParts))
    .sort((a, b) => a - b);
}

function localDateInput(date, timezone) {
  const parts = getParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function resolveLocalDateTime(parts, timezone) {
  const candidates = localDateTimeCandidates(parts, timezone);
  if (candidates.length === 0) {
    return { status: 'invalid', reason: 'The local time does not exist in this timezone.' };
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      date: candidates[0],
      candidates: candidates.map(candidate => candidate.toISOString()),
      reason: 'The local time occurs more than once in this timezone.'
    };
  }
  return { status: 'ok', date: candidates[0] };
}

function parseTime(input) {
  const match = input.match(/(?:^|\s)(\d{1,2})(?:h|:)(\d{2})?(?=\s|$)/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour > 23 || minute > 59) return { invalid: true };
  return { hour, minute };
}

function localDateParts(date, timezone) {
  const parts = getParts(date, timezone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function addDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function parseUserDate(input, { now = new Date(), timezone = DEFAULT_TIMEZONE } = {}) {
  assertTimezone(timezone);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return { status: 'invalid', reason: 'Invalid reference time.' };
  }
  if (typeof input !== 'string' || !input.trim()) {
    return { status: 'invalid', reason: 'Date input is empty.' };
  }

  const value = input.trim();
  const lower = value.toLocaleLowerCase('fr-FR');
  const current = localDateParts(now, timezone);
  let dateParts = null;
  let defaultHour = null;

  if (/^\d{4}-\d{2}-\d{2}t/i.test(value) && /(?:z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? { status: 'invalid', reason: 'Invalid ISO date.' }
      : { status: 'ok', date };
  }

  if (lower.includes('demain')) {
    dateParts = addDays(current, 1);
  } else if (lower.includes('aujourd')) {
    dateParts = current;
  } else {
    for (const [name, weekday] of WEEKDAYS) {
      if (lower.includes(name)) {
        const currentWeekday = new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay();
        const days = (weekday - currentWeekday + 7) % 7 || 7;
        dateParts = addDays(current, days);
        break;
      }
    }
  }

  const dateMatch = value.match(/(?:^|\s)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s|$)/);
  if (!dateParts && dateMatch) {
    const year = dateMatch[3]
      ? Number(dateMatch[3]) + (Number(dateMatch[3]) < 100 ? 2000 : 0)
      : current.year;
    dateParts = { year, month: Number(dateMatch[2]), day: Number(dateMatch[1]) };
  }

  const isoDateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const isoLocalDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s|$)/);
  if (!dateParts && isoDateOnly) {
    dateParts = {
      year: Number(isoDateOnly[1]),
      month: Number(isoDateOnly[2]),
      day: Number(isoDateOnly[3])
    };
  }
  if (!dateParts && isoLocalDate) {
    dateParts = {
      year: Number(isoLocalDate[1]),
      month: Number(isoLocalDate[2]),
      day: Number(isoLocalDate[3])
    };
  }

  const time = parseTime(value);
  if (time?.invalid) return { status: 'invalid', reason: 'Invalid time.' };
  if (lower.includes('ce soir') || lower.includes('soir')) {
    dateParts ||= current;
    defaultHour = 20;
  } else if (lower.includes('matin')) {
    dateParts ||= current;
    defaultHour = 10;
  }

  if (!dateParts && !time) {
    return { status: 'invalid', reason: 'No supported date or time found.' };
  }
  if (!dateParts) {
    return { status: 'ambiguous', reason: 'A time without a date requires clarification.' };
  }

  const resolved = resolveLocalDateTime({
    ...dateParts,
    hour: time?.hour ?? defaultHour ?? 14,
    minute: time?.minute ?? 0
  }, timezone);
  return resolved;
}

export function formatDateForUser(date, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    dateStyle: 'long'
  }).format(date);
}

export function formatTimeForUser(date, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function getStartOfDay(date, timezone = DEFAULT_TIMEZONE) {
  const parts = localDateParts(date, timezone);
  const result = resolveLocalDateTime({ ...parts, hour: 0, minute: 0 }, timezone);
  return result.date;
}

export function getEndOfDay(date, timezone = DEFAULT_TIMEZONE) {
  const parts = localDateParts(date, timezone);
  const nextDay = addDays(parts, 1);
  const result = resolveLocalDateTime({ ...nextDay, hour: 0, minute: 0 }, timezone);
  return new Date(result.date.getTime() - 1);
}

export function getDateParts(date, timezone = DEFAULT_TIMEZONE) {
  return localDateParts(date, timezone);
}

export function formatDateInput(date, timezone = DEFAULT_TIMEZONE) {
  return localDateInput(date, timezone);
}
