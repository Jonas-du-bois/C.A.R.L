/**
 * AIProviderFactory - Factory pour les différents providers IA
 * 
 * Gère les appels API vers Gemini, OpenAI et Groq de manière uniforme.
 * 
 * @module services/ai/AIProviderFactory
 */

// ============================================
// CLASSE ABSTRAITE PROVIDER
// ============================================

/**
 * Interface de base pour tous les providers IA
 */
class AIProvider {
  constructor(apiKey, model, maxTokens, temperature) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
    this.temperature = temperature;
  }

  /**
   * Envoie un prompt et retourne la réponse
   * @param {string} prompt - Le prompt à envoyer
   * @param {Object} options - Options supplémentaires
   * @returns {Promise<string>} Réponse brute
   */
  async call(prompt, options = {}) {
    throw new Error('Method call() must be implemented');
  }

  /**
   * Sanitizes error objects to prevent API key leakage
   * @param {any} error - The error to sanitize
   * @returns {any} Sanitized error object
   * @protected
   */
  _sanitizeError(error) {
    if (!error || typeof error !== 'object' || !this.apiKey) return error;

    const apiKeyEscaped = this.apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const apiKeyRegex = new RegExp(apiKeyEscaped, 'g');
    const placeholder = '[HIDDEN_API_KEY]';

    // We don't want to mutate the original object in case it's used elsewhere.
    // Create a new Error instance and preserve its type (name).
    const sanitized = new Error(error.message);
    sanitized.name = error.name;

    if (error.stack && typeof error.stack === 'string') {
        sanitized.stack = error.stack.replace(apiKeyRegex, placeholder);
    }

    if (sanitized.message && typeof sanitized.message === 'string') {
        sanitized.message = sanitized.message.replace(apiKeyRegex, placeholder);
    }

    // Deep sanitize the cause recursively
    if (error.cause) {
      sanitized.cause = this._sanitizeError(error.cause);
    }

    // Copy any other properties that might exist on custom errors
    for (const key of Object.getOwnPropertyNames(error)) {
        if (!['message', 'name', 'stack', 'cause'].includes(key)) {
            const val = error[key];
            if (typeof val === 'string') {
                sanitized[key] = val.replace(apiKeyRegex, placeholder);
            } else {
                sanitized[key] = val;
            }
        }
    }

    return sanitized;
  }
}

// ============================================
// GEMINI PROVIDER
// ============================================

class GeminiProvider extends AIProvider {
  async call(prompt, options = {}) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: options.temperature ?? this.temperature,
            maxOutputTokens: options.maxTokens ?? this.maxTokens,
            responseMimeType: "application/json"
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No response from Gemini');
      }

      return text;
    } catch (error) {
      throw this._sanitizeError(error);
    }
  }
}

// ============================================
// OPENAI PROVIDER
// ============================================

class OpenAIProvider extends AIProvider {
  async call(prompt, options = {}) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: options.systemPrompt
            ? [
                { role: 'system', content: options.systemPrompt },
                { role: 'user', content: prompt }
              ]
            : [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: options.maxTokens ?? this.maxTokens,
          temperature: options.temperature ?? this.temperature
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      throw this._sanitizeError(error);
    }
  }
}

// ============================================
// GROQ PROVIDER
// ============================================

class GroqProvider extends AIProvider {
  async call(prompt, options = {}) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: options.systemPrompt
            ? [
                { role: 'system', content: options.systemPrompt },
                { role: 'user', content: prompt }
              ]
            : [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: options.maxTokens ?? this.maxTokens,
          temperature: options.temperature ?? this.temperature
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      throw this._sanitizeError(error);
    }
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Modèles par défaut pour chaque provider
 */
const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o',
  groq: 'llama-3.1-70b-versatile'
};

/**
 * Crée une instance du provider approprié
 * @param {string} provider - Nom du provider (gemini, openai, groq)
 * @param {Object} config - Configuration
 * @returns {AIProvider}
 */
export function createProvider(provider, config) {
  const { apiKey, model, maxTokens = 500, temperature = 0.3 } = config;
  const actualModel = model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;

  switch (provider) {
    case 'gemini':
      return new GeminiProvider(apiKey, actualModel, maxTokens, temperature);
    case 'openai':
      return new OpenAIProvider(apiKey, actualModel, maxTokens, temperature);
    case 'groq':
      return new GroqProvider(apiKey, actualModel, maxTokens, temperature);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Retourne le modèle par défaut pour un provider
 * @param {string} provider - Nom du provider
 * @returns {string}
 */
export function getDefaultModel(provider) {
  return DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini;
}
