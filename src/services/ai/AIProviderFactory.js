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
}

// ============================================
// GEMINI PROVIDER
// ============================================

class GeminiProvider extends AIProvider {
  async call(prompt, options = {}) {
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
  }
}

// ============================================
// OPENAI PROVIDER
// ============================================

class OpenAIProvider extends AIProvider {
  async call(prompt, options = {}) {
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
  }
}

// ============================================
// GROQ PROVIDER
// ============================================

class GroqProvider extends AIProvider {
  async call(prompt, options = {}) {
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
