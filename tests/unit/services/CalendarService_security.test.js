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

test('CalendarService.createEvent - Security Tests', async (t) => {
  // Mock Calendar Client that does nothing (to avoid network calls)
  const mockCalendarClient = {
    events: {
      insert: async () => ({ data: { htmlLink: 'http://test.com' } })
    }
  };

  const service = new CalendarService(mockConfig, mockCalendarClient);

  await t.test('accepts valid simple input', async () => {
    const result = await service.createEvent('Simple meeting');
    assert.match(result, /Événement créé/);
  });

  await t.test('accepts valid object input', async () => {
    const result = await service.createEvent({
      summary: 'Valid Meeting',
      description: 'Valid Description',
      duration: 60
    });
    assert.match(result, /Événement créé/);
  });

  await t.test('rejects extremely long string input', async () => {
    const longString = 'a'.repeat(4097);
    const result = await service.createEvent(longString);
    assert.match(result, /Échec de création/);
    assert.match(result, /trop long/);
  });

  await t.test('rejects object with extremely long summary', async () => {
    const result = await service.createEvent({
      summary: 'a'.repeat(256),
      duration: 60
    });
    assert.match(result, /Échec de création/);
    assert.match(result, /trop long/);
  });

  await t.test('rejects object with extremely long description', async () => {
    const result = await service.createEvent({
      summary: 'Valid',
      description: 'a'.repeat(4097),
      duration: 60
    });
    assert.match(result, /Échec de création/);
    assert.match(result, /trop long/);
  });

  await t.test('rejects object with invalid calendarId (injection attempt)', async () => {
    const result = await service.createEvent({
      summary: 'Valid',
      calendarId: '../../etc/passwd',
      duration: 60
    });
    assert.match(result, /Échec de création/);
    assert.match(result, /ID de calendrier invalide/);
  });

  await t.test('rejects object with invalid calendarId (XSS attempt)', async () => {
    const result = await service.createEvent({
      summary: 'Valid',
      calendarId: '<script>alert(1)</script>',
      duration: 60
    });
    assert.match(result, /Échec de création/);
    assert.match(result, /ID de calendrier invalide/);
  });
});
