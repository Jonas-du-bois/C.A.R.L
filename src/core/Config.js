import dotenv from 'dotenv';
import { ConfigurationError } from '../utils/Errors.js';
import { validateTimezone } from '../utils/DateTime.js';

dotenv.config();

const DEFAULTS = {
  timezone: 'Europe/Paris',
  maxTokens: 500,
  temperature: 0.3,
  dailyBriefingTime: '0 8 * * *',
  calendarId: 'primary'
};

function readPositiveInteger(name, fallback, alias) {
  const raw = process.env[name] ?? (alias ? process.env[alias] : undefined);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  if (raw !== undefined && alias && process.env[name] === undefined) {
    console.warn(`${alias} is deprecated; use ${name}`);
  }
  return value;
}

function readNumberInRange(name, fallback, min, max, alias) {
  const raw = process.env[name] ?? (alias ? process.env[alias] : undefined);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConfigurationError(`${name} must be a number between ${min} and ${max}`);
  }
  if (raw !== undefined && alias && process.env[name] === undefined) {
    console.warn(`${alias} is deprecated; use ${name}`);
  }
  return value;
}

function readBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw !== 'true' && raw !== 'false') {
    throw new ConfigurationError(`${name} must be either true or false`);
  }
  return raw === 'true';
}

function validateCronExpression(value) {
  return /^([\d*/?,\-]+\s+){4,5}[\d*/?,\-]+$/.test(value.trim());
}

export class Config {
  constructor() {
    this.validate();
  }

  validate() {
    const features = this.features;
    const aiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GROQ_API_KEY,
      process.env.OPENAI_API_KEY
    ].filter(Boolean);

    if (!process.env.DATABASE_PATH?.trim()) {
      throw new ConfigurationError('Missing required environment variable: DATABASE_PATH');
    }
    if (!features.enableAutoResponse && !features.enableDailyBriefing) {
      // Economic mode deliberately permits operation without AI or Telegram.
    } else if (!aiKeys.length && features.enableAutoResponse) {
      throw new ConfigurationError(
        'An AI API key is required when ENABLE_AUTO_RESPONSE=true'
      );
    }
    if ((features.enableDailyBriefing || features.enableAutoResponse) &&
        (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ADMIN_ID)) {
      throw new ConfigurationError(
        'TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_ID are required when reports or alerts are enabled'
      );
    }

    const timezone = this.timezone;
    if (!validateTimezone(timezone)) {
      throw new ConfigurationError(`APP_TIMEZONE is invalid: ${timezone}`);
    }

    const googleJson = this.google.serviceAccountJson;
    if (googleJson) {
      try {
        const credentials = JSON.parse(googleJson);
        if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
          throw new Error('not an object');
        }
      } catch {
        throw new ConfigurationError('GOOGLE_SERVICE_ACCOUNT_JSON must contain valid JSON');
      }
    }

    if (!validateCronExpression(features.dailyBriefingTime)) {
      throw new ConfigurationError(
        'DAILY_BRIEFING_TIME must be a valid 5- or 6-field cron expression'
      );
    }

    readPositiveInteger('AI_MAX_TOKENS', DEFAULTS.maxTokens, 'OPENAI_MAX_TOKENS');
    readNumberInRange('AI_TEMPERATURE', DEFAULTS.temperature, 0, 2, 'OPENAI_TEMPERATURE');
  }

  get ai() {
    const providerConfig = [
      ['gemini', process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-2.0-flash'],
      ['groq', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'llama-3.1-70b-versatile'],
      ['openai', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o']
    ].find(([, apiKey]) => apiKey);

    if (!providerConfig) {
      return {
        configured: false,
        provider: null,
        apiKey: null,
        model: null,
        maxTokens: readPositiveInteger('AI_MAX_TOKENS', DEFAULTS.maxTokens, 'OPENAI_MAX_TOKENS'),
        temperature: readNumberInRange('AI_TEMPERATURE', DEFAULTS.temperature, 0, 2, 'OPENAI_TEMPERATURE')
      };
    }

    const [provider, apiKey, model] = providerConfig;
    return {
      configured: true,
      provider,
      apiKey,
      model,
      maxTokens: readPositiveInteger('AI_MAX_TOKENS', DEFAULTS.maxTokens, 'OPENAI_MAX_TOKENS'),
      temperature: readNumberInRange('AI_TEMPERATURE', DEFAULTS.temperature, 0, 2, 'OPENAI_TEMPERATURE')
    };
  }

  get openai() {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      maxTokens: readPositiveInteger('AI_MAX_TOKENS', DEFAULTS.maxTokens, 'OPENAI_MAX_TOKENS'),
      temperature: readNumberInRange('AI_TEMPERATURE', DEFAULTS.temperature, 0, 2, 'OPENAI_TEMPERATURE')
    };
  }

  get database() {
    return { path: process.env.DATABASE_PATH };
  }

  get timezone() {
    return process.env.APP_TIMEZONE || DEFAULTS.timezone;
  }

  get google() {
    let serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.warn('GOOGLE_SERVICE_ACCOUNT_KEY is deprecated; use GOOGLE_SERVICE_ACCOUNT_JSON');
      serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    }
    return {
      serviceAccountJson,
      calendarId: process.env.GOOGLE_CALENDAR_ID || DEFAULTS.calendarId
    };
  }

  get telegram() {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      adminId: process.env.TELEGRAM_ADMIN_ID,
      allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID || process.env.TELEGRAM_ADMIN_ID
    };
  }

  get features() {
    return {
      enableDailyBriefing: readBoolean('ENABLE_DAILY_BRIEFING', false),
      dailyBriefingTime: process.env.DAILY_BRIEFING_TIME || DEFAULTS.dailyBriefingTime,
      enableAutoResponse: readBoolean('ENABLE_AUTO_RESPONSE', false),
      enableCalendar: readBoolean('ENABLE_CALENDAR_INTEGRATION', false)
    };
  }

  get whatsapp() {
    return {
      sessionPath: process.env.WHATSAPP_SESSION_PATH || './data/.wwebjs_auth',
      puppeteer: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      }
    };
  }
}
