import { google } from 'googleapis';

export class CalendarService {
  #calendar;
  #config;
  #isConfigured = false;

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
        this.#isConfigured = true;
      } catch (e) {
        console.error('Failed to initialize Google Calendar:', e);
      }
    }
  }

  get isConfigured() {
    return this.#isConfigured;
  }

  /**
   * Récupère les événements des prochains jours
   * @param {number} daysAhead - Nombre de jours à regarder (défaut: 7)
   * @returns {Array} Liste des événements
   */
  async getUpcomingEvents(daysAhead = 7) {
    if (!this.#calendar) return [];

    try {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + daysAhead);

      const res = await this.#calendar.events.list({
        calendarId: this.#config.google.calendarId,
        timeMin: now.toISOString(),
        timeMax: future.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      return res.data.items || [];
    } catch (error) {
      console.error('Failed to fetch calendar events:', error.message);
      return [];
    }
  }

  /**
   * Trouve les créneaux disponibles dans les prochains jours
   * @param {number} daysAhead - Nombre de jours à regarder
   * @param {number} minDurationMinutes - Durée minimum du créneau en minutes
   * @param {string} activityType - Type d'activité (optionnel) pour ajuster la durée
   * @returns {Array} Liste des créneaux disponibles
   */
  async findAvailableSlots(daysAhead = 7, minDurationMinutes = 90, activityType = null) {
    if (!this.#calendar) return [];

    // Ajuster la durée selon le type d'activité
    const duration = this.#getDurationForActivity(activityType, minDurationMinutes);

    try {
      const events = await this.getUpcomingEvents(daysAhead);
      const slots = [];

      // Définir les heures de travail (8h - 21h)
      const workDayStart = 8;
      const workDayEnd = 21;

      // Pour chaque jour des prochains jours
      for (let d = 0; d < daysAhead; d++) {
        const day = new Date();
        day.setDate(day.getDate() + d);
        day.setHours(workDayStart, 0, 0, 0);

        // Si c'est aujourd'hui et qu'il est déjà tard, commencer à l'heure actuelle + 1h
        if (d === 0) {
          const now = new Date();
          if (now.getHours() >= workDayStart) {
            day.setHours(now.getHours() + 1, 0, 0, 0);
          }
        }

        const dayEnd = new Date(day);
        dayEnd.setHours(workDayEnd, 0, 0, 0);

        // Récupérer les événements de ce jour
        const dayEvents = events.filter(e => {
          const eventStart = new Date(e.start.dateTime || e.start.date);
          return eventStart.toDateString() === day.toDateString();
        }).sort((a, b) => {
          const aStart = new Date(a.start.dateTime || a.start.date);
          const bStart = new Date(b.start.dateTime || b.start.date);
          return aStart - bStart;
        });

        // Trouver les créneaux libres
        let currentTime = new Date(day);

        for (const event of dayEvents) {
          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);

          // Vérifier s'il y a un créneau avant cet événement
          const gapMinutes = (eventStart - currentTime) / (1000 * 60);
          if (gapMinutes >= duration) {
            slots.push({
              start: new Date(currentTime),
              end: new Date(eventStart),
              durationMinutes: gapMinutes,
              day: this.#formatDay(currentTime)
            });
          }

          // Avancer après l'événement
          if (eventEnd > currentTime) {
            currentTime = new Date(eventEnd);
          }
        }

        // Vérifier s'il reste du temps jusqu'à la fin de journée
        const remainingMinutes = (dayEnd - currentTime) / (1000 * 60);
        if (remainingMinutes >= duration && currentTime < dayEnd) {
          slots.push({
            start: new Date(currentTime),
            end: new Date(dayEnd),
            durationMinutes: remainingMinutes,
            day: this.#formatDay(currentTime)
          });
        }
      }

      // Limiter à 5 créneaux maximum
      return slots.slice(0, 5);
    } catch (error) {
      console.error('Failed to find available slots:', error.message);
      return [];
    }
  }

  /**
   * Vérifie la disponibilité pour des dates proposées
   * @param {Array} proposedDates - Dates proposées (format flexible)
   * @returns {Object} Résultat avec dates disponibles/occupées
   */
  async checkProposedDates(proposedDates) {
    if (!this.#calendar || !proposedDates?.length) {
      return { available: [], busy: [], unknown: proposedDates || [] };
    }

    try {
      const events = await this.getUpcomingEvents(14);
      const result = { available: [], busy: [], unknown: [] };

      for (const proposed of proposedDates) {
        // Essayer de parser la date proposée
        const parsed = this.#parseFlexibleDate(proposed);
        if (!parsed) {
          result.unknown.push(proposed);
          continue;
        }

        // Vérifier si un événement existe à ce moment
        const conflict = events.find(e => {
          const eventStart = new Date(e.start.dateTime || e.start.date);
          const eventEnd = new Date(e.end.dateTime || e.end.date);
          return parsed >= eventStart && parsed < eventEnd;
        });

        if (conflict) {
          result.busy.push({
            proposed,
            conflict: conflict.summary,
            conflictTime: this.#formatDateTime(new Date(conflict.start.dateTime || conflict.start.date))
          });
        } else {
          result.available.push(proposed);
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to check proposed dates:', error.message);
      return { available: [], busy: [], unknown: proposedDates };
    }
  }

  /**
   * Génère un résumé de l'agenda pour le rapport
   * @returns {Object} Résumé de l'agenda
   */
  async getAgendaSummary() {
    if (!this.#calendar) {
      return { configured: false, events: [], slots: [] };
    }

    try {
      const events = await this.getUpcomingEvents(3);
      const slots = await this.findAvailableSlots(3, 90);

      return {
        configured: true,
        events: events.slice(0, 5).map(e => ({
          title: e.summary,
          start: this.#formatDateTime(new Date(e.start.dateTime || e.start.date)),
          day: this.#formatDay(new Date(e.start.dateTime || e.start.date))
        })),
        slots: slots.map(s => ({
          start: this.#formatTime(s.start),
          end: this.#formatTime(s.end),
          day: s.day,
          duration: `${Math.round(s.durationMinutes / 60)}h${s.durationMinutes % 60 > 0 ? (s.durationMinutes % 60) + 'm' : ''}`
        }))
      };
    } catch (error) {
      console.error('Failed to get agenda summary:', error.message);
      return { configured: true, events: [], slots: [], error: error.message };
    }
  }

  #getDurationForActivity(activityType, defaultMinutes) {
    if (!activityType) return defaultMinutes;
    
    const durations = {
      'café': 60,
      'coffee': 60,
      'drink': 60,
      'apéro': 90,
      'déjeuner': 90,
      'lunch': 90,
      'dîner': 120,
      'dinner': 120,
      'réunion': 60,
      'meeting': 60,
      'sport': 120,
      'cinema': 180,
      'film': 180,
      'soirée': 240,
      'party': 240,
      'weekend': 1440, // 24h
      'voyage': 1440
    };

    const lower = activityType.toLowerCase();
    for (const [key, value] of Object.entries(durations)) {
      if (lower.includes(key)) return value;
    }
    return defaultMinutes;
  }

  #parseFlexibleDate(text) {
    if (!text) return null;
    
    // Essayer différents formats
    const now = new Date();
    const lower = text.toLowerCase();

    // "demain", "tomorrow"
    if (lower.includes('demain') || lower.includes('tomorrow')) {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      // Chercher une heure
      const hourMatch = text.match(/(\d{1,2})[h:.](\d{2})?/);
      if (hourMatch) {
        date.setHours(parseInt(hourMatch[1]), parseInt(hourMatch[2] || 0), 0, 0);
      } else {
        date.setHours(14, 0, 0, 0); // Par défaut 14h
      }
      return date;
    }

    // Jours de la semaine
    const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const daysEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    for (let i = 0; i < days.length; i++) {
      if (lower.includes(days[i]) || lower.includes(daysEn[i])) {
        const date = new Date(now);
        const currentDay = date.getDay();
        let daysToAdd = i - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        date.setDate(date.getDate() + daysToAdd);
        
        const hourMatch = text.match(/(\d{1,2})[h:.](\d{2})?/);
        if (hourMatch) {
          date.setHours(parseInt(hourMatch[1]), parseInt(hourMatch[2] || 0), 0, 0);
        } else {
          date.setHours(14, 0, 0, 0);
        }
        return date;
      }
    }

    // Format date directe (ex: "2/12", "02/12/2025")
    const dateMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
      const date = new Date(year < 100 ? 2000 + year : year, month, day);
      
      const hourMatch = text.match(/(\d{1,2})[h:.](\d{2})?/);
      if (hourMatch) {
        date.setHours(parseInt(hourMatch[1]), parseInt(hourMatch[2] || 0), 0, 0);
      } else {
        date.setHours(14, 0, 0, 0);
      }
      return date;
    }

    return null;
  }

  #formatDay(date) {
    return date.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  #formatTime(date) {
    return date.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  }

  #formatDateTime(date) {
    return date.toLocaleString('fr-CH', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  async createEvent(details) {
    if (!this.#calendar) {
      return 'Calendar integration disabled or not configured';
    }

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
