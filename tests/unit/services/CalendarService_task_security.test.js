import { test } from 'node:test';
import assert from 'node:assert';
import { CalendarService } from '../../../src/services/CalendarService.js';

// Mock Config
const mockConfig = {
  features: { enableCalendar: true },
  google: {
    serviceAccountJson: '{}',
    calendarId: 'test-calendar-id',
  },
};

test('CalendarService.createTask - Security Tests', async (t) => {
  // Mock Calendar Client that does nothing (to avoid network calls)
  const mockCalendarClient = {
    events: {
      insert: async () => ({ data: { htmlLink: 'http://test.com' } })
    }
  };

  const service = new CalendarService(mockConfig, mockCalendarClient);

  await t.test('accepts valid task input', async () => {
    const result = await service.createTask({
      summary: 'Valid Task',
      description: 'Valid Description'
    });
    assert.match(result, /Tâche ajoutée/);
  });

  await t.test('should reject extremely long summary', async () => {
    const result = await service.createTask({
      summary: 'a'.repeat(300), // Max is 255
      description: 'Valid Description'
    });
    // Currently this will fail (it will succeed instead of rejecting)
    assert.match(result, /Échec/, 'Should reject long summary');
    assert.match(result, /trop long/, 'Should mention length error');
  });

  await t.test('should reject extremely long description', async () => {
    const result = await service.createTask({
      summary: 'Valid Task',
      description: 'a'.repeat(5000) // Max is 4096
    });
    // Currently this will fail (it will succeed instead of rejecting)
    assert.match(result, /Échec/, 'Should reject long description');
    assert.match(result, /trop long/, 'Should mention length error');
  });
});
