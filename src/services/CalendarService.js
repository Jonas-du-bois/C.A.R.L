import { google } from 'googleapis';

export class CalendarService {
  #calendar;
  #config;

  constructor(config) {
    this.#config = config;
    if (this.#config.features.enableCalendar && this.#config.google.serviceAccountJson) {
      try {
        const credentials = JSON.parse(this.#config.google.serviceAccountJson);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });

        this.#calendar = google.calendar({ version: 'v3', auth });
      } catch (e) {
        console.error('Failed to initialize Google Calendar:', e);
      }
    }
  }

  async createEvent(details) {
    if (!this.#calendar) {
      return 'Calendar integration disabled or not configured';
    }

    // In a real implementation, we would use an LLM again to parse 'details' into start/end/summary
    // For this MVP/implementation as per design docs, we'll create a default 1h event
    // or assume 'details' contains enough info if structured.
    // Given the OpenAI output is just "calendar_event" action and the body,
    // we would typically need a second pass or structured parsing.
    // Here we'll just create an event for "Tomorrow 10am" as a placeholder
    // or use a very basic heuristic.

    // NOTE: The technical design doesn't specify the exact parsing logic for calendar details,
    // but suggests "Meeting request detection".
    // We will create a simple event for now to prove connectivity.

    try {
      const now = new Date();
      const start = new Date(now.setDate(now.getDate() + 1));
      start.setHours(10, 0, 0, 0);
      const end = new Date(start);
      end.setHours(11, 0, 0, 0);

      const event = {
        summary: `Meeting: ${details.slice(0, 50)}...`,
        description: details,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      };

      const res = await this.#calendar.events.insert({
        calendarId: this.#config.google.calendarId,
        resource: event,
      });

      return `Event created: ${res.data.htmlLink}`;
    } catch (error) {
      return `Failed to create event: ${error.message}`;
    }
  }
}
