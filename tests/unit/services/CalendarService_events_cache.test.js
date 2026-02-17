import { test } from 'node:test';
import assert from 'node:assert';
import { CalendarService } from '../../../src/services/CalendarService.js';

const mockConfig = {
  features: { enableCalendar: true },
  google: { calendarId: 'primary' }
};

test('CalendarService Events Caching', async (t) => {
  let eventsListCallCount = 0;

  const mockCalendarClient = {
    calendarList: {
      list: async () => ({
        data: { items: [{ id: 'primary', summary: 'Primary', primary: true }] }
      })
    },
    events: {
      list: async () => {
        eventsListCallCount++;
        return {
          data: {
            items: [
              { summary: 'Event 1', start: { dateTime: new Date().toISOString() } }
            ]
          }
        };
      },
      insert: async () => ({ data: { htmlLink: 'link' } })
    }
  };

  const service = new CalendarService(mockConfig, mockCalendarClient);

  await t.test('caches getUpcomingEvents calls', async () => {
    eventsListCallCount = 0;

    // First call
    await service.getUpcomingEvents(7);
    assert.strictEqual(eventsListCallCount, 1, 'First call should hit API');

    // Second call (same parameters)
    await service.getUpcomingEvents(7);
    assert.strictEqual(eventsListCallCount, 1, 'Second call should use cache');

    // Third call (subset range)
    await service.getUpcomingEvents(3);
    assert.strictEqual(eventsListCallCount, 1, 'Subset range should use cache');
  });

  await t.test('invalidates cache on createEvent', async () => {
    // Previous tests left cache populated

    // Create event
    await service.createEvent({ summary: 'New Event' });

    // Call getUpcomingEvents again
    await service.getUpcomingEvents(7);

    // Should increment call count because cache was invalidated
    // Previous count was 1 (from previous test, as it was same service instance)
    // Wait, subtests run sequentially but share `eventsListCallCount` and `service`.
    // Let's reset `eventsListCallCount` at start of each subtest if needed, but here we depend on sequence.
    // Actually, `t.test` runs concurrently? No, awaited.
    // Previous test ended with count 1.
    // createEvent calls insert, not list.
    // getUpcomingEvents calls list.
    // So expected count is 2.

    assert.strictEqual(eventsListCallCount, 2, 'Should hit API after creating event');
  });

  await t.test('invalidates cache on createTask', async () => {
     // Current count is 2. Cache is populated.
     await service.getUpcomingEvents(7);
     assert.strictEqual(eventsListCallCount, 2, 'Should use cache');

     await service.createTask({ summary: 'New Task' });

     await service.getUpcomingEvents(7);
     assert.strictEqual(eventsListCallCount, 3, 'Should hit API after creating task');
  });
});
