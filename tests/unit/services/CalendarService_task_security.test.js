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
      insert: async ({ resource }) => {
        return { data: { htmlLink: 'http://test.com' } };
      }
    }
  };

  const service = new CalendarService(mockConfig, mockCalendarClient);

  await t.test('rejects extremely long summary', async () => {
    const longSummary = 'a'.repeat(300); // Limit is 255
    const result = await service.createTask({
      summary: longSummary,
      description: 'Valid Description'
    });

    assert.match(result, /Échec/);
    assert.match(result, /trop long/);
  });

  await t.test('rejects extremely long description', async () => {
    const longDesc = 'a'.repeat(5000); // Limit is 4096
    const result = await service.createTask({
      summary: 'Valid Task',
      description: longDesc
    });

    assert.match(result, /Échec/);
    assert.match(result, /trop long/);
  });
});
