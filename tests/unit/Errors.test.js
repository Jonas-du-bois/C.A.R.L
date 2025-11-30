import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  AppError, 
  ValidationError, 
  ConfigurationError, 
  DatabaseError, 
  ServiceError 
} from '../../src/utils/Errors.js';

describe('Errors', () => {
  describe('AppError', () => {
    it('should create an error with message', () => {
      const error = new AppError('Something went wrong');
      assert.strictEqual(error.message, 'Something went wrong');
      assert.strictEqual(error.name, 'AppError');
      assert.strictEqual(error.isOperational, true);
    });

    it('should preserve the cause option', () => {
      const cause = new Error('Original error');
      const error = new AppError('Wrapped error', { cause });
      assert.strictEqual(error.cause, cause);
    });
  });

  describe('ValidationError', () => {
    it('should be an instance of AppError', () => {
      const error = new ValidationError('Invalid input');
      assert.ok(error instanceof AppError);
      assert.strictEqual(error.name, 'ValidationError');
    });
  });

  describe('ConfigurationError', () => {
    it('should be an instance of AppError', () => {
      const error = new ConfigurationError('Missing config');
      assert.ok(error instanceof AppError);
      assert.strictEqual(error.name, 'ConfigurationError');
    });
  });

  describe('DatabaseError', () => {
    it('should be an instance of AppError', () => {
      const error = new DatabaseError('DB connection failed');
      assert.ok(error instanceof AppError);
      assert.strictEqual(error.name, 'DatabaseError');
    });
  });

  describe('ServiceError', () => {
    it('should be an instance of AppError', () => {
      const error = new ServiceError('Service unavailable');
      assert.ok(error instanceof AppError);
      assert.strictEqual(error.name, 'ServiceError');
    });
  });
});
