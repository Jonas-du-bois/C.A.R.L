import { test } from 'node:test';
import assert from 'node:assert';
import { CalendarService } from '../../../src/services/CalendarService.js';

test('CalendarService Conflict Cache Optimization', async (t) => {
  const mockConfig = {
    features: { enableCalendar: true },
    google: { calendarId: 'primary' }
  };

  let listCallCount = 0;

  const mockCalendarClient = {
    calendarList: {
      list: async () => ({
        data: { items: [{ id: 'primary', summary: 'Primary' }] }
      })
    },
    events: {
      list: async () => {
        listCallCount++;
        return {
          data: {
            items: [] // No events
          }
        };
      }
    }
  };

  // Helper to get fresh service
  const getService = () => new CalendarService(mockConfig, mockCalendarClient);

  await t.test('checkConflicts populates cache for near future requests', async () => {
    const service = getService();
    listCallCount = 0;

    // 1. Check conflicts for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    await service.checkConflicts(tomorrow);

    const countAfterConflict = listCallCount;
    assert.ok(countAfterConflict >= 1, 'Should have called API for conflict check');

    // 2. Call getUpcomingEvents(7)
    // Should use cache
    await service.getUpcomingEvents(7);

    const countAfterGet = listCallCount;
    assert.strictEqual(countAfterGet, countAfterConflict, 'getUpcomingEvents should use cache populated by checkConflicts');
  });

  await t.test('checkConflicts does NOT populate cache for distant future requests (> 14 days)', async () => {
    const service = getService();
    listCallCount = 0;

    // 1. Check conflicts for distant future (60 days)
    const distant = new Date();
    distant.setDate(distant.getDate() + 60);
    distant.setHours(10, 0, 0, 0);

    await service.checkConflicts(distant);

    const countAfterConflict = listCallCount;
    assert.ok(countAfterConflict >= 1, 'Should have called API for distant conflict check');

    // 2. Call getUpcomingEvents(7)
    // Should NOT use cache (was not populated)
    await service.getUpcomingEvents(7);

    const countAfterGet = listCallCount;
    assert.strictEqual(countAfterGet, countAfterConflict + 1, 'getUpcomingEvents should hit API because distant check didn\'t warm cache');
  });

  await t.test('handles pagination correctly', async () => {
    // Mock a paginated response
    const mockPaginatedClient = {
      calendarList: {
        list: async () => ({
          data: { items: [{ id: 'primary', summary: 'Primary' }] }
        })
      },
      events: {
        list: async ({ pageToken }) => {
           if (!pageToken) {
               return {
                   data: {
                       items: [{
                           summary: 'Page 1 Event',
                           start: { dateTime: new Date().toISOString() }
                       }],
                       nextPageToken: 'page2'
                   }
               };
           } else if (pageToken === 'page2') {
               return {
                   data: {
                       items: [{
                           summary: 'Page 2 Event',
                           start: { dateTime: new Date().toISOString() }
                       }]
                       // No nextPageToken
                   }
               };
           }
           return { data: { items: [] } };
        }
      }
    };

    const service = new CalendarService(mockConfig, mockPaginatedClient);
    const events = await service.getUpcomingEvents(7);

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].summary, 'Page 1 Event');
    assert.strictEqual(events[1].summary, 'Page 2 Event');
  });
});
