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

test('CalendarService Performance - Cache Calendar List', async (t) => {
  let listCallCount = 0;

  // Mock Calendar Client
  const mockCalendarClient = {
    calendarList: {
      list: async () => {
        listCallCount++;
        return {
          data: {
            items: [
              { id: 'cal1', summary: 'Primary', primary: true, accessRole: 'owner' },
              { id: 'cal2', summary: 'Holidays', primary: false, accessRole: 'reader' }
            ]
          }
        };
      }
    }
  };

  const service = new CalendarService(mockConfig, mockCalendarClient);

  // First call - should hit the API
  const list1 = await service.getCalendarList();
  assert.strictEqual(listCallCount, 1, 'First call should hit the API');
  assert.strictEqual(list1.length, 2);

  // Second call - should use cache
  const list2 = await service.getCalendarList();
  assert.strictEqual(listCallCount, 1, 'Second call should use cache (API call count should remain 1)');
  assert.deepStrictEqual(list1, list2);

  // Third call - simulate cache expiration (we can't easily advance time here without sinon/jest fake timers,
  // but we can verify the cache logic if we expose a way to clear it or wait,
  // for this simple test we assume immediate subsequent calls should be cached)
  const list3 = await service.getCalendarList();
  assert.strictEqual(listCallCount, 1, 'Third call should use cache');
});
