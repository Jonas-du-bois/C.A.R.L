import { test } from 'node:test';
import assert from 'node:assert';
import { CalendarService } from '../../src/services/CalendarService.js';

test('CalendarService Security Tests', async (t) => {
  // Mock config
  const mockConfig = {
    features: { enableCalendar: true },
    google: { serviceAccountJson: '{}', calendarId: 'primary' }
  };

  // Mock Calendar client
  const mockClient = {
    events: {
      insert: async () => ({ data: { htmlLink: 'http://example.com' } })
    }
  };

  const calendarService = new CalendarService(mockConfig, mockClient);

  await t.test('createTask should validate summary length', async () => {
    const longSummary = 'a'.repeat(256);
    const result = await calendarService.createTask({ summary: longSummary });
    assert.match(result, /Échec: Titre de l'événement trop long/);
  });

  await t.test('createTask should validate description length', async () => {
    const longDescription = 'a'.repeat(4097);
    const result = await calendarService.createTask({ description: longDescription });
    assert.match(result, /Échec: Description de l'événement trop longue/);
  });

  await t.test('createTask should allow valid input', async () => {
    const result = await calendarService.createTask({ summary: 'Valid task', description: 'Valid description' });
    assert.match(result, /📋 Tâche ajoutée/);
  });
});
