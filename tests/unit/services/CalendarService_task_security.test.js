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

  await t.test('rejects extremely long summary', async () => {
    const result = await service.createTask({
      summary: 'a'.repeat(256), // Max is 255
      description: 'Valid'
    });
    // Should fail if validation is present
    assert.match(result, /Échec/);
    assert.match(result, /trop long/);
  });

  await t.test('rejects extremely long description', async () => {
    const result = await service.createTask({
      summary: 'Valid',
      description: 'a'.repeat(4097) // Max is 4096
    });
    // Should fail if validation is present
    assert.match(result, /Échec/);
    assert.match(result, /trop long/);
  });
});
