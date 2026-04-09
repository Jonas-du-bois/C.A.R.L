import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService Security', () => {
  let service;
  const SECRET_TOKEN = '12345:ABCDEF_secret_token_123';
  const HIDDEN_TOKEN = '[HIDDEN_TOKEN]';
  let originalConsoleError;
  let loggedErrors;

  beforeEach(() => {
    service = new TelegramService({
      telegram: {
        botToken: SECRET_TOKEN,
        adminId: '123456789'
      }
    });

    loggedErrors = [];
    originalConsoleError = console.error;
    console.error = (...args) => {
      loggedErrors.push(args);
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('should sanitize bot token from string error in sendMessage', async () => {
    // Intercept fetch to return a failed response with the token
    const originalFetch = global.fetch;
    global.fetch = async () => {
      return {
        ok: false,
        text: async () => `Failed due to token ${SECRET_TOKEN}`
      };
    };

    try {
      await service.sendMessage('test');

      assert.strictEqual(loggedErrors.length, 1);
      const logArgs = loggedErrors[0];
      assert.ok(logArgs[1].includes(HIDDEN_TOKEN));
      assert.ok(!logArgs[1].includes(SECRET_TOKEN));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should sanitize bot token from Error object message in sendMessage', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error(`Network failed for ${SECRET_TOKEN}`);
    };

    try {
      await service.sendMessage('test');

      assert.strictEqual(loggedErrors.length, 1);
      const errorObj = loggedErrors[0][1];
      assert.strictEqual(errorObj.message, `Network failed for ${HIDDEN_TOKEN}`);
      assert.ok(!errorObj.message.includes(SECRET_TOKEN));
      assert.ok(!errorObj.stack.includes(SECRET_TOKEN));
      assert.ok(errorObj.stack.includes(HIDDEN_TOKEN));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should sanitize bot token from nested error cause in answerCallback', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      const innerError = new Error(`Inner fail ${SECRET_TOKEN}`);
      const outerError = new Error(`Outer fail ${SECRET_TOKEN}`);
      outerError.cause = innerError;
      throw outerError;
    };

    try {
      await service.answerCallback('123');

      assert.strictEqual(loggedErrors.length, 1);
      const errorObj = loggedErrors[0][1];
      assert.strictEqual(errorObj.message, `Outer fail ${HIDDEN_TOKEN}`);
      assert.strictEqual(errorObj.cause.message, `Inner fail ${HIDDEN_TOKEN}`);
      assert.ok(!errorObj.message.includes(SECRET_TOKEN));
      assert.ok(!errorObj.cause.message.includes(SECRET_TOKEN));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should sanitize bot token from custom properties in sendQRCode', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      const error = new Error(`Fail ${SECRET_TOKEN}`);
      error.customUrl = `https://api.telegram.org/bot${SECRET_TOKEN}/sendPhoto`;
      throw error;
    };

    try {
      await service.sendQRCode('data');

      assert.strictEqual(loggedErrors.length, 1);
      const errorObj = loggedErrors[0][1];
      assert.strictEqual(errorObj.customUrl, `https://api.telegram.org/bot${HIDDEN_TOKEN}/sendPhoto`);
      assert.ok(!errorObj.customUrl.includes(SECRET_TOKEN));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should preserve primitive error types when sanitizing', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      // Throw a string instead of an Error object
      throw `Error string with token ${SECRET_TOKEN}`;
    };

    try {
      await service.sendQRCode('data');

      assert.strictEqual(loggedErrors.length, 1);
      const errorStr = loggedErrors[0][1];
      assert.strictEqual(typeof errorStr, 'string');
      assert.strictEqual(errorStr, `Error string with token ${HIDDEN_TOKEN}`);
      assert.ok(!errorStr.includes(SECRET_TOKEN));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
