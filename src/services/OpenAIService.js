import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are C.A.R.L., a helpful assistant.`;
const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action: { type: "string", enum: ["none", "calendar_event"] }
  },
  required: ["reply", "action"],
  additionalProperties: false
};

export class OpenAIService {
  #client;
  #model;

  constructor(config) {
    this.#client = new OpenAI({ apiKey: config.openai.apiKey });
    this.#model = config.openai.model;
  }

  async analyzeMessage(message, context = []) {
    const response = await this.#client.chat.completions.create({
      model: this.#model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...context.map(m => ({ role: 'user', content: m.body })),
        { role: 'user', content: message.body }
      ],
      response_format: { type: 'json_schema', json_schema: { name: "response", schema: SCHEMA } },
      temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content);
  }
}
