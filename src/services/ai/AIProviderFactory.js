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
   * Helper to execute fetch calls securely and sanitize errors to avoid leaking API keys.
   */
  async safeFetch(url, options) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        let errorData = '';
        try {
          const json = await response.json();
          errorData = JSON.stringify(json);
        } catch {
          errorData = await response.text();
        }

        let errorMsg = `API Error: ${response.statusText} - ${errorData}`;

        // Sanitize error message to prevent API key leakage
        if (this.apiKey) {
          // Escape API key for regex
          let escapedKey = '';
          for (const char of this.apiKey) {
            escapedKey += '\\^$*+?.()|{}[]'.includes(char) ? '\\' + char : char;
          }
          errorMsg = errorMsg.replace(new RegExp(escapedKey, 'g'), '[HIDDEN_API_KEY]');
        }
        throw new Error(errorMsg);
      }
      return response;
    } catch (error) {
      // Re-throw if it's already an error we created
      if (error.message && error.message.startsWith('API Error')) {
        throw error;
      }

      let errorMsg = error.message;
      if (this.apiKey && errorMsg) {
         let escapedKey = '';
         for (const char of this.apiKey) {
           escapedKey += '\\^$*+?.()|{}[]'.includes(char) ? '\\' + char : char;
         }
         errorMsg = errorMsg.replace(new RegExp(escapedKey, 'g'), '[HIDDEN_API_KEY]');
      }

      // Node.js DOMException message is read-only, so we create a new generic Error
      const newError = new Error(errorMsg);
      newError.stack = error.stack;
      if (this.apiKey && newError.stack) {
        let escapedKey = '';
        for (const char of this.apiKey) {
          escapedKey += '\\^$*+?.()|{}[]'.includes(char) ? '\\' + char : char;
        }
        newError.stack = newError.stack.replace(new RegExp(escapedKey, 'g'), '[HIDDEN_API_KEY]');
      }

      // Sanitize cause recursively if needed, for fetch failures
      if (error.cause) {
         const causeErr = error.cause;
         let causeMsg = causeErr.message;
         if (this.apiKey && causeMsg) {
           let escapedKey = '';
           for (const char of this.apiKey) {
             escapedKey += '\\^$*+?.()|{}[]'.includes(char) ? '\\' + char : char;
           }
           causeMsg = causeMsg.replace(new RegExp(escapedKey, 'g'), '[HIDDEN_API_KEY]');
         }
         const newCause = new Error(causeMsg);
         newCause.stack = causeErr.stack;
         if (this.apiKey && newCause.stack) {
            let escapedKey = '';
            for (const char of this.apiKey) {
              escapedKey += '\\^$*+?.()|{}[]'.includes(char) ? '\\' + char : char;
            }
            newCause.stack = newCause.stack.replace(new RegExp(escapedKey, 'g'), '[HIDDEN_API_KEY]');
         }
         newError.cause = newCause;
      }

      throw newError;
    }
  }
}

// ============================================
// GEMINI PROVIDER
// ============================================

class GeminiProvider extends AIProvider {
  async call(prompt, options = {}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    
    const response = await this.safeFetch(url, {
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
  }
}

// ============================================
// OPENAI PROVIDER
// ============================================

class OpenAIProvider extends AIProvider {
  async call(prompt, options = {}) {
    const response = await this.safeFetch('https://api.openai.com/v1/chat/completions', {
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
  }
}

// ============================================
// GROQ PROVIDER
// ============================================

class GroqProvider extends AIProvider {
  async call(prompt, options = {}) {
    const response = await this.safeFetch('https://api.groq.com/openai/v1/chat/completions', {
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
