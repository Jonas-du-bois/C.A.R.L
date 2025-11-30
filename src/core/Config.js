import dotenv from 'dotenv';
import { ConfigurationError } from '../utils/Errors.js';

dotenv.config();

export class Config {
  constructor() {
    this.validate();
  }

  validate() {
    const required = [
      'OPENAI_API_KEY',
      'OPENAI_MODEL',
      'DATABASE_PATH'
    ];

    for (const key of required) {
      if (!process.env[key]) {
        throw new ConfigurationError(`Missing required environment variable: ${key}`);
      }
    }
  }

  get openai() {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '500'),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3')
    };
  }

  get database() {
    return {
      path: process.env.DATABASE_PATH
    };
  }

  get google() {
    return {
      serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON, // Stringified JSON
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary'
    };
  }

  get telegram() {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      adminId: process.env.TELEGRAM_ADMIN_ID
    };
  }

  get features() {
    return {
      enableDailyBriefing: process.env.ENABLE_DAILY_BRIEFING === 'true',
      dailyBriefingTime: process.env.DAILY_BRIEFING_TIME || '0 8 * * *', // Default 8 AM
      enableAutoResponse: process.env.ENABLE_AUTO_RESPONSE !== 'false',
      enableCalendar: process.env.ENABLE_CALENDAR_INTEGRATION === 'true'
    };
  }

  get whatsapp() {
    return {
      puppeteer: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      }
    };
  }
}
