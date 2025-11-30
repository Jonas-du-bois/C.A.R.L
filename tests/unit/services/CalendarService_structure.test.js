import { test } from 'node:test';
import assert from 'node:assert';
import { CalendarService } from '../../../src/services/CalendarService.js';

// Mock Config
const mockConfig = {
  features: { enableCalendar: true },
  google: {
    serviceAccountJson: '{}', // Not used when we inject client
    calendarId: 'test-calendar-id',
  },
};

test('CalendarService.createEvent', async (t) => {
  await t.test('handles structured input correctly', async () => {
    let capturedResource = null;

    // Mock Calendar Client
    const mockCalendarClient = {
      events: {
        insert: async ({ calendarId, resource }) => {
          capturedResource = resource;
          return { data: { htmlLink: 'http://calendar.google.com/event/123' } };
        }
      }
    };

    const service = new CalendarService(mockConfig, mockCalendarClient);

    const eventData = {
      summary: 'Test Meeting',
      start: '2023-10-27T14:30:00.000Z',
      duration: 45
    };

    const result = await service.createEvent(eventData);

    assert.strictEqual(result, 'Event created: http://calendar.google.com/event/123');
    assert.strictEqual(capturedResource.summary, 'Test Meeting');
    assert.strictEqual(capturedResource.start.dateTime, '2023-10-27T14:30:00.000Z');

    // Check end time calculation
    const expectedEnd = new Date(new Date(eventData.start).getTime() + 45 * 60000).toISOString();
    assert.strictEqual(capturedResource.end.dateTime, expectedEnd);
  });

  await t.test('handles string input (legacy fallback)', async () => {
     let capturedResource = null;

    // Mock Calendar Client
    const mockCalendarClient = {
      events: {
        insert: async ({ calendarId, resource }) => {
          capturedResource = resource;
          return { data: { htmlLink: 'http://calendar.google.com/event/456' } };
        }
      }
    };

    const service = new CalendarService(mockConfig, mockCalendarClient);
    const input = "Simple meeting request";

    const result = await service.createEvent(input);

    assert.strictEqual(result, 'Event created: http://calendar.google.com/event/456');
    assert.match(capturedResource.summary, /Meeting: Simple meeting request/);
    assert.strictEqual(capturedResource.description, input);
  });
});
