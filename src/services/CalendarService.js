import { google } from 'googleapis';

export class CalendarService {
  #calendar;
  #config;
  #isConfigured = false;

  constructor(config, calendarClient = null) {
    this.#config = config;
    if (calendarClient) {
      this.#calendar = calendarClient;
      this.#isConfigured = true;
    } else if (this.#config.features.enableCalendar && this.#config.google.serviceAccountJson) {
      try {
        const credentials = JSON.parse(this.#config.google.serviceAccountJson);
        
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar']
        });
        this.#calendar = google.calendar({ version: 'v3', auth });
        this.#isConfigured = true;
        
        console.log('Google Calendar initialized successfully');
      } catch (e) {
        console.error('Failed to initialize Google Calendar:', e);
      }
    }
  }

  get isConfigured() {
    return this.#isConfigured;
  }

  /**
   * Récupère la liste de tous les calendriers accessibles
   * @returns {Array} Liste des calendriers avec id et summary
   */
  async getCalendarList() {
    if (!this.#calendar) return [];

    try {
      const res = await this.#calendar.calendarList.list();
      return (res.data.items || []).map(cal => ({
        id: cal.id,
        name: cal.summary,
        primary: cal.primary || false,
        accessRole: cal.accessRole
      }));
    } catch (error) {
      console.error('Failed to fetch calendar list:', error.message);
      return [];
    }
  }

  /**
   * Récupère les événements des prochains jours de TOUS les calendriers
   * @param {number} daysAhead - Nombre de jours à regarder (défaut: 7)
   * @returns {Array} Liste des événements de tous les calendriers
   */
  async getUpcomingEvents(daysAhead = 7) {
    if (!this.#calendar) return [];

    try {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + daysAhead);

      // Récupérer la liste de tous les calendriers
      const calendars = await this.getCalendarList();
      
      if (calendars.length === 0) {
        // Fallback: utiliser le calendrier configuré
        const res = await this.#calendar.events.list({
          calendarId: this.#config.google.calendarId,
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });
        return res.data.items || [];
      }

      // Récupérer les événements de chaque calendrier en parallèle
      const allEventsPromises = calendars.map(async (cal) => {
        try {
          const res = await this.#calendar.events.list({
            calendarId: cal.id,
            timeMin: now.toISOString(),
            timeMax: future.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          });
          // Ajouter le nom du calendrier à chaque événement
          return (res.data.items || []).map(event => ({
            ...event,
            calendarName: cal.name,
            calendarId: cal.id
          }));
        } catch (error) {
          console.error(`Failed to fetch events from calendar ${cal.name}:`, error.message);
          return [];
        }
      });

      const allEventsArrays = await Promise.all(allEventsPromises);
      const allEvents = allEventsArrays.flat();

      // Trier par date de début
      allEvents.sort((a, b) => {
        const aStart = new Date(a.start?.dateTime || a.start?.date);
        const bStart = new Date(b.start?.dateTime || b.start?.date);
        return aStart - bStart;
      });

      return allEvents;
    } catch (error) {
      console.error('Failed to fetch calendar events:', error.message);
      return [];
    }
  }

  /**
   * Vérifie s'il y a des conflits avec des événements existants
   * Vérifie TOUS les calendriers accessibles + le calendrier par défaut
   * @param {Date} startTime - Heure de début de l'événement proposé
   * @param {number} durationMinutes - Durée en minutes (défaut: 60)
   * @returns {{ hasConflict: boolean, conflicts: Array, suggestion: Date|null }}
   */
  async checkConflicts(startTime, durationMinutes = 60) {
    if (!this.#calendar) {
      return { hasConflict: false, conflicts: [], suggestion: null };
    }

    try {
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
      
      // Récupérer les événements du jour concerné
      const dayStart = new Date(startTime);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(startTime);
      dayEnd.setHours(23, 59, 59, 999);

      // Récupérer tous les calendriers
      let calendars = await this.getCalendarList();
      
      // Si aucun calendrier trouvé via l'API, utiliser le calendrier par défaut
      if (calendars.length === 0 && this.#config.google?.calendarId) {
        calendars = [{
          id: this.#config.google.calendarId,
          name: 'Calendrier principal'
        }];
      }
      
      // S'assurer que le calendrier par défaut est inclus (évite les doublons)
      const defaultCalId = this.#config.google?.calendarId;
      if (defaultCalId && !calendars.some(c => c.id === defaultCalId)) {
        calendars.push({
          id: defaultCalId,
          name: 'Calendrier principal'
        });
      }

      if (calendars.length === 0) {
        console.warn('[CalendarService] No calendars available for conflict check');
        return { hasConflict: false, conflicts: [], suggestion: null };
      }
      
      console.log(`[CalendarService] Checking conflicts across ${calendars.length} calendar(s)`);

      // Récupérer les événements de chaque calendrier pour ce jour
      const allEventsPromises = calendars.map(async (cal) => {
        try {
          const res = await this.#calendar.events.list({
            calendarId: cal.id,
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          });
          return (res.data.items || []).map(event => ({
            ...event,
            calendarName: cal.name
          }));
        } catch (error) {
          return [];
        }
      });

      const allEventsArrays = await Promise.all(allEventsPromises);
      const dayEvents = allEventsArrays.flat().sort((a, b) => {
        const aStart = new Date(a.start?.dateTime || a.start?.date);
        const bStart = new Date(b.start?.dateTime || b.start?.date);
        return aStart - bStart;
      });

      // Chercher les conflits
      const conflicts = [];
      for (const event of dayEvents) {
        const eventStart = new Date(event.start?.dateTime || event.start?.date);
        const eventEnd = new Date(event.end?.dateTime || event.end?.date);

        // Vérifier si l'événement proposé chevauche cet événement
        if (startTime < eventEnd && endTime > eventStart) {
          conflicts.push({
            summary: event.summary,
            start: eventStart,
            end: eventEnd,
            calendarName: event.calendarName
          });
        }
      }

      // Si conflit, suggérer un créneau alternatif
      let suggestion = null;
      if (conflicts.length > 0) {
        // Trouver le prochain créneau libre après les conflits
        const lastConflictEnd = new Date(Math.max(...conflicts.map(c => c.end.getTime())));
        
        // Vérifier si ce créneau est libre
        let proposedStart = new Date(lastConflictEnd);
        proposedStart.setMinutes(0, 0, 0); // Arrondir à l'heure
        if (proposedStart < lastConflictEnd) {
          proposedStart.setHours(proposedStart.getHours() + 1);
        }

        // Vérifier que le créneau suggéré ne conflicte pas avec un autre événement
        const proposedEnd = new Date(proposedStart.getTime() + durationMinutes * 60 * 1000);
        let isFree = true;
        for (const event of dayEvents) {
          const eventStart = new Date(event.start?.dateTime || event.start?.date);
          const eventEnd = new Date(event.end?.dateTime || event.end?.date);
          if (proposedStart < eventEnd && proposedEnd > eventStart) {
            isFree = false;
            break;
          }
        }

        if (isFree && proposedStart.getHours() < 22) {
          suggestion = proposedStart;
        }
      }

      return { hasConflict: conflicts.length > 0, conflicts, suggestion };
    } catch (error) {
      console.error('Failed to check conflicts:', error.message);
      return { hasConflict: false, conflicts: [], suggestion: null };
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
   * Inclut les événements de TOUS les calendriers
   * @returns {Object} Résumé de l'agenda
   */
  async getAgendaSummary() {
    if (!this.#calendar) {
      return { configured: false, events: [], slots: [], calendars: [] };
    }

    try {
      const calendars = await this.getCalendarList();
      const events = await this.getUpcomingEvents(3);
      const slots = await this.findAvailableSlots(3, 90);

      return {
        configured: true,
        calendarsCount: calendars.length,
        calendars: calendars.map(c => c.name),
        events: events.slice(0, 10).map(e => ({
          title: e.summary,
          calendar: e.calendarName || 'Principal',
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

  /**
   * Crée une tâche comme événement "toute la journée" dans Google Calendar
   * Note: L'API Google Tasks ne permet pas aux comptes de service d'accéder
   * aux tâches d'un utilisateur. On utilise donc Calendar avec un événement
   * transparent (ne bloque pas l'agenda) qui sert de rappel.
   * @param {Object} input - { summary, description, dueDate }
   */
  async createTask(input) {
    if (!this.#calendar) {
      return 'Google Calendar non configuré';
    }

    try {
      this.#validateEventInput(input);

      const title = `📋 ${input.summary || 'Tâche'}`;
      const description = input.description || '';
      
      // Préparer la date d'échéance
      let dueDate;
      if (input.dueDate) {
        dueDate = new Date(input.dueDate);
      } else {
        // Par défaut: demain
        dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
      }
      
      // Format YYYY-MM-DD pour événement toute la journée
      const dateStr = dueDate.toISOString().split('T')[0];
      
      // Calculer la date de fin (jour suivant pour que l'événement dure 1 jour)
      const endDate = new Date(dueDate);
      endDate.setDate(endDate.getDate() + 1);
      const endDateStr = endDate.toISOString().split('T')[0];

      const event = {
        summary: title,
        description: description,
        start: { date: dateStr },      // Événement toute la journée
        end: { date: endDateStr },     // Fin = jour suivant
        transparency: 'transparent',    // Ne bloque pas l'agenda (libre)
        colorId: '9',                   // Bleu (pour différencier des événements)
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 540 }  // Rappel à 9h (540 min avant minuit)
          ]
        }
      };

      const res = await this.#calendar.events.insert({
        calendarId: this.#config.google.calendarId,
        resource: event,
      });

      // Formater la date pour l'affichage
      const displayDate = dueDate.toLocaleDateString('fr-CH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });

      return `📋 Tâche ajoutée pour ${displayDate}\n${res.data.htmlLink}`;
    } catch (error) {
      console.error('Failed to create task:', error);
      return `Échec: ${error.message}`;
    }
  }

  #validateEventInput(input) {
    if (typeof input === 'string') {
      if (input.length > 4096) {
        throw new Error('Description de l\'événement trop longue (max 4096 caractères)');
      }
      return;
    }

    if (typeof input === 'object' && input !== null) {
      if (input.summary && input.summary.length > 255) {
        throw new Error('Titre de l\'événement trop long (max 255 caractères)');
      }

      if (input.description && input.description.length > 4096) {
        throw new Error('Description de l\'événement trop longue (max 4096 caractères)');
      }

      if (input.calendarId) {
        // Allow alphanumeric, @, ., _, -
        // This covers standard Google Calendar IDs (email addresses and "primary")
        if (!/^[a-zA-Z0-9@._-]+$/.test(input.calendarId)) {
          throw new Error('ID de calendrier invalide');
        }
      }
    }
  }

  async createEvent(input) {
    if (!this.#calendar) {
      return 'Calendar integration disabled or not configured';
    }

    try {
      this.#validateEventInput(input);

      let summary, start, end, description;

      if (typeof input === 'string') {
        // Fallback for string input (legacy behavior)
        const now = new Date();
        start = new Date(now.setDate(now.getDate() + 1));
        start.setHours(10, 0, 0, 0);
        end = new Date(start);
        end.setHours(11, 0, 0, 0);
        summary = `Meeting: ${input.slice(0, 50)}...`;
        description = input;
      } else if (typeof input === 'object' && input !== null) {
        // Structured input
        summary = input.summary || 'Nouvel événement';
        description = input.description || '';

        if (input.start) {
          start = new Date(input.start);
        } else {
          // Default start tomorrow 10am if not provided
          const now = new Date();
          start = new Date(now.setDate(now.getDate() + 1));
          start.setHours(10, 0, 0, 0);
        }

        if (input.end) {
          end = new Date(input.end);
        } else if (input.duration) {
          end = new Date(start.getTime() + input.duration * 60000);
        } else {
          // Default duration 1 hour
          end = new Date(start.getTime() + 60 * 60000);
        }
      } else {
        throw new Error('Invalid input for createEvent');
      }

      // Check for valid dates
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format');
      }

      const event = {
        summary,
        description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      };

      // Utiliser le calendarId fourni ou celui par défaut
      const targetCalendarId = input.calendarId || this.#config.google.calendarId;

      const res = await this.#calendar.events.insert({
        calendarId: targetCalendarId,
        resource: event,
      });

      return `Événement créé: ${res.data.htmlLink}`;
    } catch (error) {
      return `Échec de création: ${error.message}`;
    }
  }
}
