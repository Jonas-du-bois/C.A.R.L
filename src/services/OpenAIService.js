import OpenAI from 'openai';

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

Your output MUST be a valid JSON object matching the provided schema. Never include explanations outside the JSON structure.`;

const SCHEMA = {
  type: "object",
  properties: {
    reply: { 
      type: "string",
      description: "The response message to send to the user"
    },
    action: { 
      type: "string", 
      enum: ["none", "calendar_event", "notify_admin"],
      description: "The action to take based on the message"
    },
    urgency: { 
      type: "string", 
      enum: ["low", "medium", "high", "critical"],
      description: "The urgency level of the message"
    },
    category: { 
      type: "string", 
      enum: ["professional", "personal", "spam", "other"],
      description: "The category of the message"
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence score for the analysis"
    }
  },
  required: ["reply", "action", "urgency", "category", "confidence"],
  additionalProperties: false
};

export class OpenAIService {
  #client;
  #model;
  #maxTokens;
  #temperature;

  constructor(config) {
    this.#client = new OpenAI({ apiKey: config.openai.apiKey });
    this.#model = config.openai.model;
    this.#maxTokens = config.openai.maxTokens || 500;
    this.#temperature = config.openai.temperature || 0.3;
  }

  async analyzeMessage(message, context = []) {
    const contextMessages = context.slice(-3).map(m => ({
      role: m.from === message.from ? 'user' : 'assistant',
      content: m.body
    }));

    const response = await this.#client.chat.completions.create({
      model: this.#model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...contextMessages,
        { role: 'user', content: message.body }
      ],
      response_format: { 
        type: 'json_schema', 
        json_schema: { 
          name: "message_analysis", 
          schema: SCHEMA,
          strict: true
        } 
      },
      max_tokens: this.#maxTokens,
      temperature: this.#temperature
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * For testing purposes - allows mocking
   */
  static createMock(responses = {}) {
    return {
      analyzeMessage: async () => responses.analyzeMessage || {
        reply: "Mock response",
        action: "none",
        urgency: "low",
        category: "other",
        confidence: 0.9
      }
    };
  }
}
