import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TelegramService } from '../../src/services/TelegramService.js';

describe('TelegramService - Security', () => {
  let service;
  const FAKE_TOKEN = '1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ-123456';
  const HIDDEN = '[HIDDEN_TOKEN]';
  let consoleErrorOutput = [];
  let originalConsoleError;
  let originalFetch;

  beforeEach(() => {
    service = new TelegramService({
      telegram: {
        botToken: FAKE_TOKEN,
        adminId: '123456789'
      }
    });

    consoleErrorOutput = [];
    originalConsoleError = console.error;
    console.error = (...args) => {
      // Use standard formatting logic for Error objects
      const formattedArgs = args.map(arg => {
        if (arg instanceof Error) {
            return arg.stack || arg.message;
        }
        return arg;
      });
      consoleErrorOutput.push(formattedArgs.join(' '));
    };

    originalFetch = global.fetch;
    // mock fetch to fail so we hit the catch blocks
    global.fetch = async () => {
      throw new Error(`fetch failed: https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`);
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
    global.fetch = originalFetch;
  });

  describe('#sanitizeError via actual method calls', () => {
    it('should sanitize token from answerCallback errors', async () => {
      await service.answerCallback('123');

      assert.strictEqual(consoleErrorOutput.length, 1);
      const output = consoleErrorOutput[0];
      assert.ok(output.includes('Failed to answer callback'));
      assert.ok(output.includes(HIDDEN));
      assert.ok(!output.includes(FAKE_TOKEN));
    });

    it('should sanitize token from sendMessage errors', async () => {
      await service.sendMessage('hello');

      assert.strictEqual(consoleErrorOutput.length, 1);
      const output = consoleErrorOutput[0];
      assert.ok(output.includes('Failed to send Telegram message'));
      assert.ok(output.includes(HIDDEN));
      assert.ok(!output.includes(FAKE_TOKEN));
    });

    it('should sanitize token from sendQRCode errors', async () => {
      await service.sendQRCode('some_data');

      assert.strictEqual(consoleErrorOutput.length, 1);
      const output = consoleErrorOutput[0];
      assert.ok(output.includes('Failed to send QR code to Telegram'));
      assert.ok(output.includes(HIDDEN));
      assert.ok(!output.includes(FAKE_TOKEN));
    });
  });
});
