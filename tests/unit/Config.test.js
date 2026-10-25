import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../../src/core/Config.js';

const managedKeys = [
  'DATABASE_PATH',
  'APP_TIMEZONE',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'AI_MAX_TOKENS',
  'OPENAI_MAX_TOKENS',
  'AI_TEMPERATURE',
  'OPENAI_TEMPERATURE',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ADMIN_ID',
  'TELEGRAM_ALLOWED_USER_ID',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'ENABLE_DAILY_BRIEFING',
  'DAILY_BRIEFING_TIME',
  'ENABLE_AUTO_RESPONSE',
  'ENABLE_CALENDAR_INTEGRATION'
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(managedKeys.map(key => [key, process.env[key]]));
  for (const key of managedKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    return callback();
  } finally {
    for (const key of managedKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

const minimal = {
  DATABASE_PATH: ':memory:',
  ENABLE_AUTO_RESPONSE: 'false',
  ENABLE_DAILY_BRIEFING: 'false',
  ENABLE_CALENDAR_INTEGRATION: 'false'
};

describe('Config', () => {
  it('accepts economic mode without AI, Telegram, or Calendar', () => {
    withEnvironment(minimal, () => {
      const config = new Config();
      assert.equal(config.ai.configured, false);
      assert.equal(config.features.enableAutoResponse, false);
      assert.equal(config.timezone, 'Europe/Paris');
      assert.equal(config.google.calendarId, 'primary');
    });
  });

  it('rejects auto-response without an AI key', () => {
    assert.throws(() => withEnvironment({
      ...minimal,
      ENABLE_AUTO_RESPONSE: 'true'
    }, () => new Config()), /AI API key is required/);
  });

  it('validates timezone, temperature, token count, and briefing schedule', () => {
    assert.throws(() => withEnvironment({
      ...minimal,
      APP_TIMEZONE: 'Mars/Olympus'
    }, () => new Config()), /APP_TIMEZONE is invalid/);
    assert.throws(() => withEnvironment({
      ...minimal,
      AI_TEMPERATURE: '2.1'
    }, () => new Config()), /AI_TEMPERATURE/);
    assert.throws(() => withEnvironment({
      ...minimal,
      AI_MAX_TOKENS: '0'
    }, () => new Config()), /AI_MAX_TOKENS/);
    assert.throws(() => withEnvironment({
      ...minimal,
      DAILY_BRIEFING_TIME: '08:00'
    }, () => new Config()), /DAILY_BRIEFING_TIME/);
  });

  it('requires Telegram when reports or auto-response alerts are enabled', () => {
    assert.throws(() => withEnvironment({
      ...minimal,
      ENABLE_DAILY_BRIEFING: 'true'
    }, () => new Config()), /TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_ID/);
  });

  it('keeps Calendar optional when no credentials are configured', () => {
    withEnvironment({
      ...minimal,
      GEMINI_API_KEY: 'test-key'
    }, () => {
      const config = new Config();
      assert.equal(config.ai.provider, 'gemini');
      assert.equal(config.google.serviceAccountJson, undefined);
    });
  });

  it('accepts legacy aliases with a deprecation warning', () => {
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = message => warnings.push(message);
    try {
      withEnvironment({
        ...minimal,
        OPENAI_API_KEY: 'test-key',
        OPENAI_MAX_TOKENS: '123',
        OPENAI_TEMPERATURE: '0.7',
        GOOGLE_SERVICE_ACCOUNT_KEY: '{"type":"service_account"}'
      }, () => {
        const config = new Config();
        assert.equal(config.ai.maxTokens, 123);
        assert.equal(config.ai.temperature, 0.7);
        assert.equal(config.google.serviceAccountJson, '{"type":"service_account"}');
      });
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(warnings.some(message => message.includes('OPENAI_MAX_TOKENS')));
    assert.ok(warnings.some(message => message.includes('OPENAI_TEMPERATURE')));
    assert.ok(warnings.some(message => message.includes('GOOGLE_SERVICE_ACCOUNT_KEY')));
  });
});
