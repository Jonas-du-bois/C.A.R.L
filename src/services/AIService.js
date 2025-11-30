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

  /**
   * Génère un rapport complet et actionnable à partir de tous les messages
   * Style: Assistant personnel type Jarvis
   * @param {Array} messages - Messages à analyser
   * @param {Object} stats - Statistiques
   * @param {Object} agendaSummary - Résumé de l'agenda Google (optionnel)
   * @param {Object} calendarService - Service calendrier pour vérifier les dispos (optionnel)
   */
  async generateFullReport(messages, stats, agendaSummary = null, calendarService = null) {
    if (!messages || messages.length === 0) {
      return this.#formatEmptyReport(stats, agendaSummary);
    }

    // Formater les messages avec TOUT le contenu pour l'IA
    const recentMessages = messages.slice(-30);
    const messagesText = recentMessages.map((m, i) => {
      const date = new Date(m.received_at).toLocaleString('fr-CH', { 
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit', 
        minute: '2-digit' 
      });
      const sender = m.push_name || m.display_name || m.phone_number.split('@')[0];
      const category = m.category || 'non classé';
      const urgency = m.urgency || 'normal';
      return `[MSG ${i+1}]
De: ${sender}
Date: ${date}
Catégorie: ${category}
Urgence: ${urgency}
Message: "${m.body}"
---`;
    }).join('\n');

    // Calculer les stats par expéditeur
    const senderStats = {};
    recentMessages.forEach(m => {
      const sender = m.push_name || m.display_name || m.phone_number.split('@')[0];
      senderStats[sender] = (senderStats[sender] || 0) + 1;
    });

    // Préparer les infos agenda
    let agendaInfo = "Agenda Google non configuré.";
    if (agendaSummary?.configured) {
      const eventsStr = agendaSummary.events?.length > 0
        ? agendaSummary.events.map(e => `- ${e.day}: ${e.title} à ${e.start}`).join('\n')
        : "Aucun événement à venir.";
      
      const slotsStr = agendaSummary.slots?.length > 0
        ? agendaSummary.slots.map(s => `- ${s.day}: ${s.start} - ${s.end} (${s.duration})`).join('\n')
        : "Pas de créneau disponible trouvé.";
      
      agendaInfo = `ÉVÉNEMENTS À VENIR (3 prochains jours):
${eventsStr}

CRÉNEAUX DISPONIBLES (min 1h30):
${slotsStr}`;
    }

    const prompt = `Tu es C.A.R.L., l'assistant personnel intelligent de Jonas - comme Jarvis pour Tony Stark.
Tu t'adresses DIRECTEMENT à Jonas avec un ton professionnel mais chaleureux, légèrement spirituel.

MESSAGES À ANALYSER:
${messagesText}

STATISTIQUES:
- Total messages: ${stats.received}
- Contacts uniques: ${stats.contacts}
- Par catégorie: ${JSON.stringify(stats.byCategory || {})}
- Par urgence: ${JSON.stringify(stats.byUrgency || {})}
- Messages par expéditeur: ${JSON.stringify(senderStats)}

AGENDA DE JONAS:
${agendaInfo}

GÉNÈRE UN JSON AVEC CETTE STRUCTURE EXACTE:
{
  "salutation": "Une salutation personnalisée style Jarvis (ex: 'Bonjour Jonas, voici votre briefing du jour.')",
  "resume_situation": "Résumé de la situation en 2-3 phrases, style assistant personnel",
  
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
      "categorie": "professionnel/personnel/etc",
      "urgence": "critique/haute/moyenne/basse",
      "action_requise": "Action concrète à faire",
      "pourquoi": "Explication de l'importance",
      "brouillon_reponse": "Réponse suggérée prête à envoyer",
      "dates_proposees": ["dates mentionnées dans le message si applicable"],
      "type_activite": "type d'activité proposée si applicable (café, dîner, réunion, etc.)"
    }
  ],
  
  "messages_info": [
    {
      "expediteur": "Nom",
      "resume": "Résumé court du message"
    }
  ],
  
  "agenda": {
    "rdv_proposes": [
      {
        "expediteur": "Nom de la personne",
        "activite": "Type d'activité proposée",
        "dates_mentionnees": ["dates/moments mentionnés"],
        "creneaux_suggeres": ["créneaux qui fonctionneraient selon l'agenda de Jonas"],
        "suggestion_reponse": "Suggestion de réponse avec les créneaux disponibles"
      }
    ],
    "conflits_detectes": ["Si une date proposée entre en conflit avec l'agenda"],
    "suggestion_generale": "Suggestion concernant l'agenda"
  },
  
  "insights": [
    {
      "emoji": "✨/⚠️/📱/🎯/💡",
      "titre": "Titre court de l'insight",
      "detail": "Explication détaillée",
      "recommandation": "Ce que Jonas devrait faire"
    }
  ],
  
  "conclusion": "Une phrase de conclusion style Jarvis (ex: 'Souhaitez-vous que je prépare quelque chose, Jonas?')"
}

RÈGLES IMPORTANTES:
- Parle DIRECTEMENT à Jonas comme son assistant personnel
- Sois concret, utile et légèrement spirituel comme Jarvis
- Les brouillons de réponse doivent être naturels et prêts à copier/coller
- Si quelqu'un propose une date ou une activité, VÉRIFIE les créneaux disponibles dans l'agenda et PROPOSE des créneaux libres
- Si une date proposée entre en conflit avec l'agenda, INDIQUE le conflit
- Pour les activités sans date précise, suggère des créneaux disponibles adaptés (café=1h, dîner=2h, sport=2h)
- Identifie les patterns (quelqu'un qui écrit beaucoup, urgences, etc.)
- Maximum 5 messages_actionnables et 4 insights`;

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

      return this.#formatReport(result, stats, messages.length);
    } catch (error) {
      console.error('Failed to generate AI report:', error);
      return this.#formatBasicReport(stats, messages);
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
    // EN-TÊTE JARVIS
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
    report += `│ 📊 <b>STATISTIQUES</b>                    │\n`;
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
      report += `│ ⚡ <b>ACTIONS REQUISES</b>               │\n`;
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

        report += `${urgenceIcon} ${catIcon} <b>${m.expediteur}</b>\n`;
        report += `┌────────────────────────────\n`;
        report += `│ 💬 <i>"${m.message_original?.substring(0, 120)}${m.message_original?.length > 120 ? '...' : ''}"</i>\n`;
        report += `│\n`;
        report += `│ ➡️ <b>Action:</b> ${m.action_requise}\n`;
        report += `│ ❓ <b>Pourquoi:</b> ${m.pourquoi}\n`;
        report += `│\n`;
        report += `│ ✏️ <b>Réponse suggérée:</b>\n`;
        report += `│ <code>${m.brouillon_reponse}</code>\n`;
        report += `└────────────────────────────\n\n`;
      });
    }

    // ═══════════════════════════════════════════════════════
    // AUTRES MESSAGES (info)
    // ═══════════════════════════════════════════════════════
    if (aiResult?.messages_info?.length > 0) {
      report += `┌─────────────────────────────────┐\n`;
      report += `│ 📋 <b>AUTRES MESSAGES</b>               │\n`;
      report += `└─────────────────────────────────┘\n`;
      aiResult.messages_info.forEach(m => {
        report += `• <b>${m.expediteur}:</b> ${m.resume}\n`;
      });
      report += `\n`;
    }

    // ═══════════════════════════════════════════════════════
    // AGENDA & RENDEZ-VOUS
    // ═══════════════════════════════════════════════════════
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 📅 <b>AGENDA & RENDEZ-VOUS</b>          │\n`;
    report += `└─────────────────────────────────┘\n\n`;

    if (aiResult?.agenda?.rdv_detectes?.length > 0) {
      report += `🗓️ <b>RDV détectés:</b>\n`;
      aiResult.agenda.rdv_detectes.forEach(rdv => {
        report += `  • ${rdv}\n`;
      });
      report += `\n`;
    } else {
      report += `🗓️ Aucune demande de rendez-vous détectée\n\n`;
    }

    if (aiResult?.agenda?.suggestion) {
      report += `💡 <i>${aiResult.agenda.suggestion}</i>\n\n`;
    }

    // ═══════════════════════════════════════════════════════
    // PROPOSITIONS DE CRÉNEAUX
    // ═══════════════════════════════════════════════════════
    if (aiResult?.disponibilites_suggerees?.length > 0) {
      report += `┌─────────────────────────────────┐\n`;
      report += `│ 🗓️ <b>CRÉNEAUX SUGGÉRÉS</b>             │\n`;
      report += `└─────────────────────────────────┘\n\n`;

      aiResult.disponibilites_suggerees.forEach(prop => {
        report += `📌 <b>${prop.expediteur}</b> - ${prop.contexte}\n`;
        if (prop.creneaux_proposes?.length > 0) {
          report += `   ✅ <b>Créneaux disponibles :</b>\n`;
          prop.creneaux_proposes.forEach(creneau => {
            report += `      • ${creneau}\n`;
          });
        } else {
          report += `   ⚠️ <i>Aucun créneau disponible pour cette période</i>\n`;
        }
        if (prop.reponse_suggeree) {
          report += `   💬 <b>Réponse suggérée :</b>\n`;
          report += `   <code>${prop.reponse_suggeree}</code>\n`;
        }
        report += `\n`;
      });
    }

    // ═══════════════════════════════════════════════════════
    // INSIGHTS & RECOMMANDATIONS
    // ═══════════════════════════════════════════════════════
    if (aiResult?.insights?.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `┌─────────────────────────────────┐\n`;
      report += `│ 💡 <b>INSIGHTS & RECOMMANDATIONS</b>   │\n`;
      report += `└─────────────────────────────────┘\n\n`;

      aiResult.insights.forEach(insight => {
        report += `${insight.emoji || '💡'} <b>${insight.titre}</b>\n`;
        report += `   ${insight.detail}\n`;
        if (insight.recommandation) {
          report += `   → <i>${insight.recommandation}</i>\n`;
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
    report += `│ 📊 <b>STATISTIQUES</b>                    │\n`;
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
      report += `│ 💬 <b>MESSAGES À TRAITER</b>            │\n`;
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
    report += `│ 📊 <b>STATISTIQUES</b>                    │\n`;
    report += `└─────────────────────────────────┘\n\n`;
    report += `😴 Aucun message reçu dans les dernières 24h\n\n`;
    
    report += `┌─────────────────────────────────┐\n`;
    report += `│ 💡 <b>INSIGHTS</b>                        │\n`;
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
