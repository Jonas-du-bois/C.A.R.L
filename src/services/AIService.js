/**
 * AIService - Multi-provider AI service supporting Gemini, OpenAI, and Groq
 * 
 * Supported providers:
 * - gemini (Google Gemini - FREE tier available)
 * - openai (OpenAI GPT - paid)
 * - groq (Groq - FREE tier available)
 */

const SYSTEM_PROMPT = `You are C.A.R.L. (Communication Assistant for Routing & Logistics), the personal executive assistant of Jonas.

**Personality Traits:**
- Efficient and concise (no unnecessary verbosity)
- Professional yet approachable
- Proactive problem-solver
- Calendar-aware and time-conscious

**Capabilities:**
- Access to Jonas's Google Calendar (read/write)
- Message classification (Professional/Personal/Spam/Urgent)
- Intent extraction (meeting requests, information queries, casual chat)
- Response drafting in Jonas's communication style

**Response Guidelines:**
- Always respond in French (Jonas's primary language)
- Use formal tone for professional contacts, casual for personal
- For meeting requests: Check calendar and propose 3 available slots
- For urgent matters: Notify admin via Telegram
- For spam: Politely decline or ignore

Your output MUST be a valid JSON object with these exact fields:
{
  "reply": "Your response message to the user",
  "action": "none" | "calendar_event" | "notify_admin",
  "urgency": "low" | "medium" | "high" | "critical",
  "category": "professional" | "personal" | "spam" | "other",
  "intent": "greeting" | "question" | "request" | "information" | "complaint" | "other",
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "confidence": 0.0 to 1.0,
  "event_details": {
    "summary": "Title of the event (optional, required if action is calendar_event)",
    "start": "ISO 8601 start time (optional, required if action is calendar_event)",
    "duration": "Duration in minutes (optional, required if action is calendar_event)"
  }
}

IMPORTANT: Return ONLY the JSON object, no additional text or markdown.`;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "The response message to send" },
    action: { type: "string", enum: ["none", "calendar_event", "notify_admin"] },
    urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
    category: { type: "string", enum: ["professional", "personal", "spam", "other"] },
    intent: { type: "string", enum: ["greeting", "question", "request", "information", "complaint", "other"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "mixed"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    event_details: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Title of the event" },
        start: { type: "string", description: "ISO 8601 start time" },
        duration: { type: "number", description: "Duration in minutes" }
      },
      required: ["summary", "start", "duration"]
    }
  },
  required: ["reply", "action", "urgency", "category", "confidence"]
};

export class AIService {
  #provider;
  #apiKey;
  #model;
  #maxTokens;
  #temperature;

  constructor(config) {
    // Support both old openai config and new ai config
    const aiConfig = config.ai || {
      provider: 'openai',
      apiKey: config.openai?.apiKey,
      model: config.openai?.model || 'gpt-4o',
      maxTokens: config.openai?.maxTokens || 500,
      temperature: config.openai?.temperature || 0.3
    };

    this.#provider = aiConfig.provider || 'gemini';
    this.#apiKey = aiConfig.apiKey;
    this.#model = aiConfig.model || this.#getDefaultModel();
    this.#maxTokens = aiConfig.maxTokens || 500;
    this.#temperature = aiConfig.temperature || 0.3;

    if (!this.#apiKey) {
      throw new Error(`API key required for provider: ${this.#provider}`);
    }
  }

  #getDefaultModel() {
    switch (this.#provider) {
      case 'gemini': return 'gemini-2.0-flash';
      case 'openai': return 'gpt-4o';
      case 'groq': return 'llama-3.1-70b-versatile';
      default: return 'gemini-2.0-flash';
    }
  }

  async analyzeMessage(message, context = []) {
    const contextText = context.slice(-3).map(m => 
      `[${m.from === message.from ? 'User' : 'Assistant'}]: ${m.body}`
    ).join('\n');

    const userPrompt = contextText 
      ? `Previous conversation:\n${contextText}\n\nNew message:\n${message.body}`
      : message.body;

    switch (this.#provider) {
      case 'gemini':
        return await this.#callGemini(userPrompt);
      case 'openai':
        return await this.#callOpenAI(userPrompt);
      case 'groq':
        return await this.#callGroq(userPrompt);
      default:
        throw new Error(`Unknown AI provider: ${this.#provider}`);
    }
  }

  async #callGemini(userPrompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:generateContent?key=${this.#apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${SYSTEM_PROMPT}\n\nUser message:\n${userPrompt}` }]
        }],
        generationConfig: {
          temperature: this.#temperature,
          maxOutputTokens: this.#maxTokens,
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

    return this.#parseResponse(text);
  }

  async #callOpenAI(userPrompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: this.#maxTokens,
        temperature: this.#temperature
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return this.#parseResponse(data.choices[0].message.content);
  }

  async #callGroq(userPrompt) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        max_tokens: this.#maxTokens,
        temperature: this.#temperature
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return this.#parseResponse(data.choices[0].message.content);
  }

  #parseResponse(text) {
    try {
      // Clean up the response - remove markdown code blocks if present
      let cleanText = text.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.slice(7);
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.slice(3);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.slice(0, -3);
      }
      cleanText = cleanText.trim();

      const parsed = JSON.parse(cleanText);
      
      // Ensure all required fields have valid values
      return {
        reply: parsed.reply || "Désolé, je n'ai pas pu traiter ce message.",
        action: ['none', 'calendar_event', 'notify_admin'].includes(parsed.action) 
          ? parsed.action : 'none',
        urgency: ['low', 'medium', 'high', 'critical'].includes(parsed.urgency) 
          ? parsed.urgency : 'low',
        category: ['professional', 'personal', 'spam', 'other'].includes(parsed.category) 
          ? parsed.category : 'other',
        intent: parsed.intent || 'other',
        sentiment: parsed.sentiment || 'neutral',
        confidence: typeof parsed.confidence === 'number' 
          ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
        event_details: parsed.event_details || null
      };
    } catch (error) {
      console.error('Failed to parse AI response:', text);
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }
  }

  /**
   * Generate a daily briefing summary
   */
  async generateBriefing(stats) {
    const prompt = `Generate a brief daily summary in French based on these statistics:
- Messages received: ${stats.total || 0}
- Urgent messages: ${stats.urgent || 0}
- Professional: ${stats.professional || 0}
- Personal: ${stats.personal || 0}
- Spam filtered: ${stats.spam || 0}

Return a JSON object with a single "summary" field containing a concise French summary (2-3 sentences).`;

    switch (this.#provider) {
      case 'gemini':
        return await this.#callGeminiBriefing(prompt);
      case 'openai':
      case 'groq':
        return await this.#callChatBriefing(prompt);
      default:
        return { summary: `📊 Résumé: ${stats.total || 0} messages reçus, ${stats.urgent || 0} urgents.` };
    }
  }

  async #callGeminiBriefing(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:generateContent?key=${this.#apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 200,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      return { summary: "Impossible de générer le résumé." };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    try {
      return JSON.parse(text);
    } catch {
      return { summary: text || "Résumé non disponible." };
    }
  }

  async #callChatBriefing(prompt) {
    const endpoint = this.#provider === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 200
      })
    });

    if (!response.ok) {
      return { summary: "Impossible de générer le résumé." };
    }

    const data = await response.json();
    try {
      return JSON.parse(data.choices[0].message.content);
    } catch {
      return { summary: "Résumé non disponible." };
    }
  }

  // ============================================
  // CONSTANTES DE CONFIGURATION
  // ============================================
  
  static LARGE_CONVERSATION_THRESHOLD = 10; // Messages par conversation avant pré-traitement
  static MAX_TOTAL_MESSAGES_DIRECT = 50;    // Total messages avant mode adaptatif
  static MAX_CONVERSATIONS_PER_REQUEST = 15; // Limite de conversations par requête

  /**
   * Formate les conversations de manière lisible pour l'IA
   * Chaque conversation est présentée comme un fil de discussion
   * @param {Array} conversations - Conversations groupées par contact
   * @returns {string} Texte formaté pour le prompt IA
   */
  #formatConversationsForAI(conversations) {
    // Limiter à 15 conversations max pour éviter de dépasser les tokens
    const limitedConversations = conversations.slice(0, AIService.MAX_CONVERSATIONS_PER_REQUEST);
    
    return limitedConversations.map((conv, index) => {
      const messagesFormatted = conv.messages.map(msg => {
        const time = new Date(msg.timestamp).toLocaleString('fr-CH', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const direction = msg.direction === 'incoming' ? '→' : '←';
        const sender = msg.direction === 'incoming' ? conv.contactName : 'Jonas (toi)';
        
        // Tronquer les messages trop longs
        const body = msg.body?.length > 300 
          ? msg.body.substring(0, 300) + '...' 
          : msg.body;
        
        return `  ${direction} [${time}] ${sender}: "${body}"`;
      }).join('\n');

      // Calculer la catégorie dominante
      const dominantCategory = Object.entries(conv.stats.categories)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'non classé';
      
      // Calculer l'urgence max
      const urgencyOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      const maxUrgency = Object.keys(conv.stats.urgencies)
        .sort((a, b) => (urgencyOrder[b] || 0) - (urgencyOrder[a] || 0))[0] || 'normal';

      return `
┌─────────────────────────────────────────────────────────────────────
│ CONVERSATION #${index + 1}: ${conv.contactName}
│ Messages: ${conv.stats.incoming} reçus, ${conv.stats.outgoing} réponses
│ Catégorie détectée: ${dominantCategory} | Urgence max: ${maxUrgency}
├─────────────────────────────────────────────────────────────────────
${messagesFormatted}
└─────────────────────────────────────────────────────────────────────`;
    }).join('\n\n');
  }

  /**
   * Pré-traite une grosse conversation pour en extraire l'essentiel
   * @param {Object} conv - Conversation à pré-traiter
   * @returns {Object} Résumé de la conversation
   */
  async #preprocessLargeConversation(conv) {
    const messagesText = conv.messages.map(msg => {
      const direction = msg.direction === 'incoming' ? '→' : '←';
      const sender = msg.direction === 'incoming' ? conv.contactName : 'Jonas';
      return `${direction} ${sender}: "${msg.body}"`;
    }).join('\n');

    const prompt = `Analyse cette conversation et génère un JSON résumé:

CONVERSATION AVEC: ${conv.contactName}
Messages: ${conv.stats.incoming} reçus, ${conv.stats.outgoing} envoyés

${messagesText}

Génère un JSON avec:
{
  "contact": "${conv.contactName}",
  "resume": "Résumé en 2-3 phrases du contenu de la conversation",
  "categorie": "professionnel/personnel/sport_loisirs/benevolat/spam",
  "urgence": "critique/haute/moyenne/basse",
  "actions_requises": ["Liste des actions à faire suite à cette conversation"],
  "evenements_mentionnes": [{"activite": "...", "quand": "...", "details": "..."}],
  "taches_extraites": [{"titre": "...", "description": "...", "priorite": "haute/moyenne/basse"}],
  "reponse_suggeree": "Réponse suggérée si nécessaire, sinon null"
}`;

    try {
      switch (this.#provider) {
        case 'gemini':
          return await this.#callGeminiCompact(prompt);
        case 'openai':
        case 'groq':
          return await this.#callChatCompact(prompt);
        default:
          return this.#fallbackConversationSummary(conv);
      }
    } catch (error) {
      console.error(`Failed to preprocess conversation with ${conv.contactName}:`, error);
      return this.#fallbackConversationSummary(conv);
    }
  }

  /**
   * Appel Gemini compact pour pré-traitement
   */
  async #callGeminiCompact(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:generateContent?key=${this.#apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1000,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) throw new Error('Gemini compact API error');
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  /**
   * Appel Chat API compact pour pré-traitement
   */
  async #callChatCompact(prompt) {
    const endpoint = this.#provider === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1000
      })
    });

    if (!response.ok) throw new Error('Chat compact API error');
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  /**
   * Fallback si l'IA échoue pour le pré-traitement
   */
  #fallbackConversationSummary(conv) {
    return {
      contact: conv.contactName,
      resume: `Conversation avec ${conv.messages.length} messages (${conv.stats.incoming} reçus, ${conv.stats.outgoing} envoyés)`,
      categorie: Object.keys(conv.stats.categories)[0] || 'autre',
      urgence: Object.keys(conv.stats.urgencies)[0] || 'basse',
      actions_requises: [],
      evenements_mentionnes: [],
      taches_extraites: [],
      reponse_suggeree: null
    };
  }

  /**
   * Génère un rapport complet et actionnable à partir des conversations
   * Style: Assistant personnel type Jarvis
   * 
   * STRATÉGIE ADAPTATIVE:
   * - Si total messages ≤ 50 → Traitement direct (1 requête)
   * - Si conversations ≥ 10 messages → Pré-traitement individuel puis agrégation
   * 
   * @param {Array} conversations - Conversations groupées par contact
   * @param {Object} stats - Statistiques
   * @param {Object} agendaSummary - Résumé de l'agenda Google (optionnel)
   * @param {Object} calendarService - Service calendrier pour vérifier les dispos (optionnel)
   */
  async generateFullReport(conversations, stats, agendaSummary = null, calendarService = null) {
    if (!conversations || conversations.length === 0) {
      return this.#formatEmptyReport(stats, agendaSummary);
    }

    // Calculer les stats globales
    const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
    const totalContacts = conversations.length;
    
    // Séparer grosses et petites conversations
    const largeConversations = conversations.filter(c => 
      c.messages.length >= AIService.LARGE_CONVERSATION_THRESHOLD
    );
    const smallConversations = conversations.filter(c => 
      c.messages.length < AIService.LARGE_CONVERSATION_THRESHOLD
    );
    
    console.log(`[AIService] Report strategy: ${totalMessages} total messages, ` +
      `${largeConversations.length} large convs, ${smallConversations.length} small convs`);

    let conversationsData;
    let preprocessedSummaries = [];

    // STRATÉGIE ADAPTATIVE
    if (totalMessages > AIService.MAX_TOTAL_MESSAGES_DIRECT && largeConversations.length > 0) {
      // MODE ADAPTATIF: Pré-traiter les grosses conversations
      console.log(`[AIService] Adaptive mode: preprocessing ${largeConversations.length} large conversations`);
      
      // Pré-traiter chaque grosse conversation en parallèle (max 3 simultanées)
      const preprocessPromises = largeConversations.map(conv => 
        this.#preprocessLargeConversation(conv)
      );
      
      try {
        preprocessedSummaries = await Promise.all(preprocessPromises);
        console.log(`[AIService] Preprocessed ${preprocessedSummaries.length} conversations`);
      } catch (error) {
        console.error('[AIService] Preprocessing failed, falling back to direct mode:', error);
        // Fallback: traiter comme des petites conversations
        preprocessedSummaries = largeConversations.map(c => this.#fallbackConversationSummary(c));
      }

      // Formater les petites conversations normalement
      conversationsData = this.#formatConversationsForAI(smallConversations);
    } else {
      // MODE DIRECT: Tout envoyer en une fois
      console.log(`[AIService] Direct mode: sending all ${totalMessages} messages`);
      conversationsData = this.#formatConversationsForAI(conversations);
    }
    
    // Stats par contact pour le contexte
    const contactSummary = conversations.slice(0, 10).map(c => 
      `• ${c.contactName}: ${c.stats.incoming} reçus, ${c.stats.outgoing} envoyés`
    ).join('\n');

    // Préparer les infos agenda
    let agendaInfo = "Agenda Google non configuré.";
    if (agendaSummary?.configured) {
      // Afficher les calendriers consultés
      const calendarsStr = agendaSummary.calendarsCount > 0
        ? `📅 ${agendaSummary.calendarsCount} calendrier(s) consultés: ${agendaSummary.calendars?.join(', ')}`
        : '';
      
      const eventsStr = agendaSummary.events?.length > 0
        ? agendaSummary.events.map(e => `- ${e.day}: ${e.title} à ${e.start}${e.calendar ? ` [${e.calendar}]` : ''}`).join('\n')
        : "Aucun événement à venir.";
      
      const slotsStr = agendaSummary.slots?.length > 0
        ? agendaSummary.slots.map(s => `- ${s.day}: ${s.start} - ${s.end} (${s.duration})`).join('\n')
        : "Pas de créneau disponible trouvé.";
      
      agendaInfo = `${calendarsStr}

ÉVÉNEMENTS À VENIR (3 prochains jours):
${eventsStr}

CRÉNEAUX DISPONIBLES (min 1h30):
${slotsStr}`;
    }

    // Préparer la section des résumés pré-traités (si mode adaptatif)
    let preprocessedSection = '';
    if (preprocessedSummaries.length > 0) {
      preprocessedSection = `
═══════════════════════════════════════════════════════════════════════
RÉSUMÉS DES CONVERSATIONS IMPORTANTES (pré-analysées)
═══════════════════════════════════════════════════════════════════════

${preprocessedSummaries.map((summary, i) => `
📌 CONVERSATION ${i + 1}: ${summary.contact}
   Résumé: ${summary.resume}
   Catégorie: ${summary.categorie} | Urgence: ${summary.urgence}
   ${summary.actions_requises?.length ? `Actions: ${summary.actions_requises.join(', ')}` : ''}
   ${summary.evenements_mentionnes?.length ? `Événements: ${JSON.stringify(summary.evenements_mentionnes)}` : ''}
   ${summary.taches_extraites?.length ? `Tâches: ${JSON.stringify(summary.taches_extraites)}` : ''}
   ${summary.reponse_suggeree ? `Réponse suggérée: "${summary.reponse_suggeree}"` : ''}
`).join('\n')}
═══════════════════════════════════════════════════════════════════════
`;
    }

    const prompt = `Tu es C.A.R.L., l'assistant personnel intelligent de Jonas - comme Jarvis pour Tony Stark.
Tu t'adresses DIRECTEMENT à Jonas avec un ton professionnel mais chaleureux, légèrement spirituel.
${preprocessedSummaries.length > 0 ? `
NOTE: Certaines conversations importantes ont été pré-analysées. Intègre ces résumés dans ton rapport final.
` : ''}
${preprocessedSection}
═══════════════════════════════════════════════════════════════════════
${preprocessedSummaries.length > 0 ? 'AUTRES CONVERSATIONS (plus courtes)' : 'CONVERSATIONS DE LA JOURNÉE (groupées par contact)'}
═══════════════════════════════════════════════════════════════════════

${conversationsData}

═══════════════════════════════════════════════════════════════════════

STATISTIQUES GLOBALES:
- Total messages: ${totalMessages}
- Contacts actifs: ${totalContacts}
- Détail par contact:
${contactSummary}

AGENDA DE JONAS:
${agendaInfo}

RÈGLES DE CATÉGORISATION (IMPORTANT - ignore les catégories pré-remplies):
- "sport_loisirs": TOUTE invitation sportive (volley, foot, tennis, piscine, randonnée, etc.), sorties loisirs, hobbies
- "personnel": Messages d'amis/famille sans rapport pro, discussions personnelles
- "professionnel": Travail, factures, administration, banque, rappels de paiement
- "benevolat": Associations, scouts, bénévolat
- "spam": Publicités non sollicitées

═══════════════════════════════════════════════════════════════════════
SECTION AGENDA - RÈGLES CRITIQUES (OBLIGATOIRE DE REMPLIR SI APPLICABLE)
═══════════════════════════════════════════════════════════════════════

DÉFINITION: Un "événement agenda" est TOUTE mention de:
- Une date (lundi, mardi, vendredi, 5 janvier, la semaine prochaine...)
- Une heure (20h, 14h30, ce soir, demain matin...)
- Un moment (ce weekend, après le travail, bientôt...)
- Une activité proposée (volley, café, dîner, réunion, match...)

EXEMPLES QUI DOIVENT APPARAÎTRE DANS agenda.evenements_proposes:
✅ "Vendredi 20h, volley" → Événement: Volley, Quand: Vendredi 20h
✅ "On se fait un café?" → Événement: Café, Quand: À planifier
✅ "Tu viens samedi?" → Événement: Activité non précisée, Quand: Samedi
✅ "Réunion lundi 9h" → Événement: Réunion, Quand: Lundi 9h
✅ "Dispo ce weekend?" → Événement: À définir, Quand: Ce weekend

SI UN MESSAGE CONTIENT UNE DATE/HEURE/MOMENT → IL DOIT ÊTRE DANS agenda.evenements_proposes
NE JAMAIS METTRE "Aucune demande de rendez-vous détectée" SI UN MESSAGE MENTIONNE UN MOMENT!

═══════════════════════════════════════════════════════════════════════

GÉNÈRE UN JSON AVEC CETTE STRUCTURE EXACTE:
{
  "salutation": "Une salutation personnalisée style Jarvis",
  "resume_situation": "Résumé de la situation en 2-3 phrases",
  
  "statistiques": {
    "par_categorie": {
      "professionnel": { "count": 0, "percent": 0 },
      "personnel": { "count": 0, "percent": 0 },
      "benevolat": { "count": 0, "percent": 0 },
      "sport_loisirs": { "count": 0, "percent": 0 },
      "spam": { "count": 0, "percent": 0 }
    },
    "par_urgence": {
      "critique": { "count": 0, "percent": 0 },
      "haute": { "count": 0, "percent": 0 },
      "moyenne": { "count": 0, "percent": 0 },
      "basse": { "count": 0, "percent": 0 }
    },
    "temps_reponse_estime": "Estimation du temps de réponse conseillé"
  },
  
  "messages_actionnables": [
    {
      "expediteur": "Nom",
      "message_original": "Le message complet",
      "categorie": "professionnel/personnel/sport_loisirs/benevolat/spam",
      "urgence": "critique/haute/moyenne/basse",
      "action_requise": "Action concrète à faire",
      "pourquoi": "Explication de l'importance",
      "brouillon_reponse": "Réponse suggérée prête à envoyer"
    }
  ],
  
  "messages_info": [
    {
      "expediteur": "Nom",
      "resume": "Résumé court du message"
    }
  ],
  
  "taches": [
    {
      "titre": "Titre court de la tâche",
      "description": "Description détaillée",
      "priorite": "haute/moyenne/basse",
      "deadline": "Date limite si applicable",
      "source": "Nom de la personne ou contexte d'où vient cette tâche"
    }
  ],
  
  "agenda": {
    "evenements_proposes": [
      {
        "expediteur": "Nom de la personne",
        "activite": "Type d'activité (volley, café, réunion, etc.)",
        "quand": "Le moment proposé (ex: 'Vendredi 20h', 'Ce weekend', 'La semaine prochaine')",
        "duree_estimee": "Durée estimée (ex: '2h pour sport', '1h pour café')",
        "disponibilite_jonas": "LIBRE ou CONFLIT avec [événement]",
        "creneaux_alternatifs": ["Si conflit, proposer des alternatives"],
        "reponse_suggérée": "Réponse à copier/coller"
      }
    ],
    "conflits_detectes": ["Description des conflits si applicable"],
    "resume_semaine": "Vue d'ensemble des événements proposés cette semaine"
  },
  
  "insights": [
    {
      "emoji": "✨/⚠️/📱/🎯/💡",
      "titre": "Titre court",
      "detail": "Explication",
      "recommandation": "Action recommandée"
    }
  ],
  
  "conclusion": "Une phrase de conclusion style Jarvis"
}

RÈGLES FINALES IMPORTANTES:
1. AGENDA: Si un message mentionne une date/heure/moment → OBLIGATOIREMENT dans agenda.evenements_proposes
2. TÂCHES: Extraire les tâches à faire (paiements, rappels, choses à régler) dans la section taches
3. Invitations sportives = catégorie "sport_loisirs" 
4. Vérifie les conflits avec l'agenda de Jonas et propose des alternatives
5. Maximum 5 messages_actionnables, 5 tâches et 4 insights`;

    try {
      let result;
      switch (this.#provider) {
        case 'gemini':
          result = await this.#callGeminiReport(prompt);
          break;
        case 'openai':
        case 'groq':
          result = await this.#callChatReport(prompt);
          break;
        default:
          result = null;
      }

      const formattedReport = this.#formatReport(result, stats, messages.length);
      
      // Retourner le rapport formaté ET les données brutes pour /tasks
      return {
        formatted: formattedReport,
        raw: result
      };
    } catch (error) {
      console.error('Failed to generate AI report:', error);
      return {
        formatted: this.#formatBasicReport(stats, messages),
        raw: null
      };
    }
  }

  async #callGeminiReport(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.#model}:generateContent?key=${this.#apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error('Gemini API error');
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return JSON.parse(text);
  }

  async #callChatReport(prompt) {
    const endpoint = this.#provider === 'groq' 
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#apiKey}`
      },
      body: JSON.stringify({
        model: this.#model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      throw new Error('Chat API error');
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  /**
   * Échappe les caractères HTML pour éviter les erreurs de parsing Telegram
   */
  #escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  #formatReport(aiResult, stats, totalMessages) {
    const now = new Date().toLocaleString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = ``;
    
    // ═══════════════════════════════════════════════════════
    // EN-TÊTE CARL
    // ═══════════════════════════════════════════════════════
    report += `🤖 <b>C.A.R.L. - Rapport Personnel</b>\n`;
    report += `📅 ${now}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Salutation Jarvis
    if (aiResult?.salutation) {
      report += `💬 <i>${aiResult.salutation}</i>\n\n`;
    }

    // Résumé de situation
    if (aiResult?.resume_situation) {
      report += `${aiResult.resume_situation}\n\n`;
    }

    // ═══════════════════════════════════════════════════════
    // STATISTIQUES DE LA JOURNÉE
    // ═══════════════════════════════════════════════════════
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 📊 <b>STATISTIQUES</b>         │\n`;
    report += `└─────────────────────────────────┘\n\n`;

    // Stats par catégorie
    report += `<b>Répartition par catégorie :</b>\n`;
    const categories = aiResult?.statistiques?.par_categorie || {};
    report += `├ 💼 Professionnel : ${categories.professionnel?.count || 0} (${categories.professionnel?.percent || 0}%)\n`;
    report += `├ 👤 Personnel     : ${categories.personnel?.count || 0} (${categories.personnel?.percent || 0}%)\n`;
    report += `├ 🤝 Bénévolat     : ${categories.benevolat?.count || 0} (${categories.benevolat?.percent || 0}%)\n`;
    report += `├ ⚽ Sport/Loisirs : ${categories.sport_loisirs?.count || 0} (${categories.sport_loisirs?.percent || 0}%)\n`;
    report += `└ 🚫 Spam          : ${categories.spam?.count || 0} (${categories.spam?.percent || 0}%)\n\n`;

    // Stats par urgence
    report += `<b>Répartition par urgence :</b>\n`;
    const urgences = aiResult?.statistiques?.par_urgence || {};
    report += `🔴 Critique : ${urgences.critique?.count || 0}\n`;
    report += `🟠 Haute    : ${urgences.haute?.count || 0}\n`;
    report += `🟡 Moyenne  : ${urgences.moyenne?.count || 0}\n`;
    report += `🟢 Basse    : ${urgences.basse?.count || 0}\n\n`;

    if (aiResult?.statistiques?.temps_reponse_estime) {
      report += `⏱️ <i>${aiResult.statistiques.temps_reponse_estime}</i>\n\n`;
    }

    // ═══════════════════════════════════════════════════════
    // ACTIONS REQUISES
    // ═══════════════════════════════════════════════════════
    if (aiResult?.messages_actionnables?.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `┌─────────────────────────────────┐\n`;
      report += `│ ⚡ <b>ACTIONS REQUISES</b>     │\n`;
      report += `└─────────────────────────────────┘\n\n`;

      aiResult.messages_actionnables.forEach((m, i) => {
        const urgenceIcon = {
          'critique': '🔴',
          'haute': '🟠', 
          'moyenne': '🟡',
          'basse': '🟢'
        }[m.urgence] || '⚪';
        
        const catIcon = {
          'professionnel': '💼',
          'personnel': '👤',
          'benevolat': '🤝',
          'sport_loisirs': '⚽'
        }[m.categorie] || '📝';

        const msgOriginal = this.#escapeHtml(m.message_original?.substring(0, 120));
        const actionReq = this.#escapeHtml(m.action_requise);
        const pourquoi = this.#escapeHtml(m.pourquoi);
        const brouillon = this.#escapeHtml(m.brouillon_reponse);
        
        report += `${urgenceIcon} ${catIcon} <b>${this.#escapeHtml(m.expediteur)}</b>\n`;
        report += `┌────────────────────────────\n`;
        report += `│ 💬 <i>"${msgOriginal}${m.message_original?.length > 120 ? '...' : ''}"</i>\n`;
        report += `│\n`;
        report += `│ ➡️ <b>Action:</b> ${actionReq}\n`;
        report += `│ ❓ <b>Pourquoi:</b> ${pourquoi}\n`;
        report += `│\n`;
        report += `│ ✏️ <b>Réponse suggérée:</b>\n`;
        report += `│ <code>${brouillon}</code>\n`;
        report += `└────────────────────────────\n\n`;
      });
    }

    // ═══════════════════════════════════════════════════════
    // AUTRES MESSAGES (info)
    // ═══════════════════════════════════════════════════════
    if (aiResult?.messages_info?.length > 0) {
      report += `┌─────────────────────────────────┐\n`;
      report += `│ 📋 <b>AUTRES MESSAGES</b>      │\n`;
      report += `└─────────────────────────────────┘\n`;
      aiResult.messages_info.forEach(m => {
        report += `• <b>${this.#escapeHtml(m.expediteur)}:</b> ${this.#escapeHtml(m.resume)}\n`;
      });
      report += `\n`;
    }

    // ═══════════════════════════════════════════════════════
    // TÂCHES À FAIRE
    // ═══════════════════════════════════════════════════════
    if (aiResult?.taches?.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `┌─────────────────────────────────┐\n`;
      report += `│ ✅ <b>TÂCHES À FAIRE</b>       │\n`;
      report += `└─────────────────────────────────┘\n\n`;

      aiResult.taches.forEach((t, i) => {
        const prioIcon = {
          'haute': '🔴',
          'moyenne': '🟡',
          'basse': '🟢'
        }[t.priorite] || '⚪';
        
        report += `${prioIcon} <b>${this.#escapeHtml(t.titre)}</b>\n`;
        report += `   ${this.#escapeHtml(t.description)}\n`;
        if (t.deadline) {
          report += `   ⏰ Deadline: ${this.#escapeHtml(t.deadline)}\n`;
        }
        if (t.source) {
          report += `   📍 Source: ${this.#escapeHtml(t.source)}\n`;
        }
        report += `\n`;
      });
    }

    // ═══════════════════════════════════════════════════════
    // AGENDA & ÉVÉNEMENTS PROPOSÉS
    // ═══════════════════════════════════════════════════════
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 📅 <b>AGENDA & RENDEZ-VOUS</b> │\n`;
    report += `└─────────────────────────────────┘\n\n`;

    const evenements = aiResult?.agenda?.evenements_proposes || [];
    
    if (evenements.length > 0) {
      evenements.forEach(evt => {
        const dispoIcon = evt.disponibilite_jonas?.includes('LIBRE') ? '✅' : '⚠️';
        
        report += `🗓️ <b>${this.#escapeHtml(evt.activite)}</b> avec ${this.#escapeHtml(evt.expediteur)}\n`;
        report += `   📍 Quand: <b>${this.#escapeHtml(evt.quand)}</b>\n`;
        if (evt.duree_estimee) {
          report += `   ⏱️ Durée: ${this.#escapeHtml(evt.duree_estimee)}\n`;
        }
        report += `   ${dispoIcon} ${this.#escapeHtml(evt.disponibilite_jonas)}\n`;
        
        if (evt.creneaux_alternatifs?.length > 0 && !evt.disponibilite_jonas?.includes('LIBRE')) {
          report += `   📋 Alternatives:\n`;
          evt.creneaux_alternatifs.forEach(alt => {
            report += `      • ${this.#escapeHtml(alt)}\n`;
          });
        }
        
        if (evt.reponse_suggérée) {
          report += `   💬 <code>${this.#escapeHtml(evt.reponse_suggérée)}</code>\n`;
        }
        report += `\n`;
      });

      if (aiResult?.agenda?.resume_semaine) {
        report += `📊 <i>${this.#escapeHtml(aiResult.agenda.resume_semaine)}</i>\n\n`;
      }
    } else {
      report += `🗓️ <i>Aucun événement ou créneau proposé dans les messages</i>\n\n`;
    }

    if (aiResult?.agenda?.conflits_detectes?.length > 0) {
      report += `⚠️ <b>Conflits détectés:</b>\n`;
      aiResult.agenda.conflits_detectes.forEach(c => {
        report += `   • ${this.#escapeHtml(c)}\n`;
      });
      report += `\n`;
    }

    // ═══════════════════════════════════════════════════════
    // INSIGHTS & RECOMMANDATIONS
    // ═══════════════════════════════════════════════════════
    if (aiResult?.insights?.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `┌───────────────────────────────────────┐\n`;
      report += `│ 💡 <b>INSIGHTS & RECOMMANDATIONS</b> │\n`;
      report += `└───────────────────────────────────────┘\n\n`;

      aiResult.insights.forEach(insight => {
        report += `${insight.emoji || '💡'} <b>${this.#escapeHtml(insight.titre)}</b>\n`;
        report += `   ${this.#escapeHtml(insight.detail)}\n`;
        if (insight.recommandation) {
          report += `   → <i>${this.#escapeHtml(insight.recommandation)}</i>\n`;
        }
        report += `\n`;
      });
    }

    // ═══════════════════════════════════════════════════════
    // CONCLUSION JARVIS
    // ═══════════════════════════════════════════════════════
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (aiResult?.conclusion) {
      report += `\n🎯 <i>${aiResult.conclusion}</i>\n`;
    }

    report += `\n<code>— C.A.R.L. v2.0 | Votre assistant personnel</code>`;

    return report;
  }

  #formatBasicReport(stats, messages) {
    const now = new Date().toLocaleString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = `🤖 <b>C.A.R.L. - Rapport Personnel</b>\n`;
    report += `📅 ${now}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    report += `💬 <i>Bonjour Jonas. L'analyse IA est temporairement indisponible, mais j'ai préparé un résumé de vos messages.</i>\n\n`;
    
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 📊 <b>STATISTIQUES</b>         │\n`;
    report += `└─────────────────────────────────┘\n\n`;
    report += `├ 📥 Messages reçus : ${stats.received}\n`;
    report += `├ 📤 Réponses       : ${stats.sent}\n`;
    report += `└ 👥 Contacts       : ${stats.contacts}\n\n`;
    
    if (stats.errors > 0) {
      report += `⚠️ ${stats.errors} erreur(s) détectée(s)\n\n`;
    }

    if (messages.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `┌─────────────────────────────────┐\n`;
      report += `│ 💬 <b>MESSAGES À TRAITER</b>   │\n`;
      report += `└─────────────────────────────────┘\n\n`;
      
      messages.slice(-10).forEach(m => {
        const sender = m.push_name || m.phone_number.split('@')[0];
        const time = new Date(m.received_at).toLocaleString('fr-CH', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        report += `📱 <b>${sender}</b> (${time})\n`;
        report += `   <i>"${m.body.substring(0, 150)}${m.body.length > 150 ? '...' : ''}"</i>\n\n`;
      });
    }

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `\n🎯 <i>Je reste à votre disposition pour toute assistance, Jonas.</i>\n`;
    report += `\n<code>— C.A.R.L. v2.0 | Mode dégradé</code>`;

    return report;
  }

  #formatEmptyReport(stats) {
    const now = new Date().toLocaleString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = `🤖 <b>C.A.R.L. - Rapport Personnel</b>\n`;
    report += `📅 ${now}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    report += `💬 <i>Bonjour Jonas. Journée particulièrement calme aujourd'hui.</i>\n\n`;
    
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 📊 <b>STATISTIQUES</b>         │\n`;
    report += `└─────────────────────────────────┘\n\n`;
    report += `😴 Aucun message reçu dans les dernières 24h\n\n`;
    
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 💡 <b>INSIGHTS</b>             │\n`;
    report += `└─────────────────────────────────┘\n\n`;
    report += `✨ Profitez de cette accalmie pour vous concentrer\n`;
    report += `   sur vos projets personnels, Jonas.\n\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `✅ Tous les systèmes sont opérationnels\n`;
    report += `\n🎯 <i>À votre service si vous avez besoin de quoi que ce soit.</i>\n`;
    report += `\n<code>— C.A.R.L. v2.0 | Votre assistant personnel</code>`;

    return report;
  }
}
