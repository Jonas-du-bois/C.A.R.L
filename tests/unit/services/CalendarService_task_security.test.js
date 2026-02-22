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
  // Mock Calendar Client
  const mockCalendarClient = {
    events: {
      insert: async () => ({ data: { htmlLink: 'http://test.com/task' } })
    }
  };

  const service = new CalendarService(mockConfig, mockCalendarClient);

  await t.test('rejects task with extremely long summary', async () => {
    const longSummary = 'a'.repeat(256); // Max is 255
    const result = await service.createTask({
      summary: longSummary,
      description: 'Normal description'
    });

    // Should fail with validation error
    assert.match(result, /Échec/);
    assert.match(result, /trop long/);
  });

  await t.test('rejects task with extremely long description', async () => {
    const longDesc = 'a'.repeat(4097); // Max is 4096
    const result = await service.createTask({
      summary: 'Normal Summary',
      description: longDesc
    });

    // Should fail with validation error
    assert.match(result, /Échec/);
    assert.match(result, /trop long/);
  });
});
