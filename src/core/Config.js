import dotenv from 'dotenv';
import { ConfigurationError } from '../utils/Errors.js';

dotenv.config();

export class Config {
  constructor() {
    this.validate();
  }

  validate() {
    // AI provider is required (either Gemini, OpenAI, or Groq)
    const hasAI = process.env.GEMINI_API_KEY || 
                  process.env.OPENAI_API_KEY || 
                  process.env.GROQ_API_KEY;
    
    if (!hasAI) {
      throw new ConfigurationError('At least one AI API key is required (GEMINI_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY)');
    }

    if (!process.env.DATABASE_PATH) {
      throw new ConfigurationError('Missing required environment variable: DATABASE_PATH');
    }
  }

  get ai() {
    // Priority: Gemini (free) > Groq (free) > OpenAI (paid)
    if (process.env.GEMINI_API_KEY) {
      return {
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '500'),
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3')
      };
    }
    
    if (process.env.GROQ_API_KEY) {
      return {
        provider: 'groq',
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.1-70b-versatile',
        maxTokens: parseInt(process.env.AI_MAX_TOKENS || '500'),
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3')
      };
    }
    
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || process.env.OPENAI_MAX_TOKENS || '500'),
      temperature: parseFloat(process.env.AI_TEMPERATURE || process.env.OPENAI_TEMPERATURE || '0.3')
    };
  }

  // Keep for backward compatibility
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
      serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary'
    };
  }

  get telegram() {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      adminId: process.env.TELEGRAM_ADMIN_ID,
      allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID || process.env.TELEGRAM_ADMIN_ID
    };
  }

  get features() {
    return {
      enableDailyBriefing: process.env.ENABLE_DAILY_BRIEFING === 'true',
      dailyBriefingTime: process.env.DAILY_BRIEFING_TIME || '0 8 * * *',
      enableAutoResponse: process.env.ENABLE_AUTO_RESPONSE === 'true',
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
