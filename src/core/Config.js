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
      model: process.env.OPENAI_MODEL
    };
  }

  get database() {
    return {
      path: process.env.DATABASE_PATH
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
