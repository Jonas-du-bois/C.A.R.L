import { ValidationError } from '../utils/Errors.js';

export class Message {
  #id;
  #from;
  #body;
  #timestamp;
  #urgency;
  #category;

  constructor({ id, from, body, timestamp, urgency = 'low', category = 'other' }) {
    if (!id || !from || !body) throw new ValidationError('Missing fields');
    this.#id = id;
    this.#from = from;
    this.#body = body.replace(/[\u200B-\u200D\uFEFF]/g, '').slice(0, 4096);
    this.#timestamp = timestamp || Date.now();
    this.#urgency = urgency;
    this.#category = category;
  }

  get id() { return this.#id; }
  get from() { return this.#from; }
  get body() { return this.#body; }
  get timestamp() { return this.#timestamp; }
  get urgency() { return this.#urgency; }
  get category() { return this.#category; }

  withAnalysis(analysis) {
    return new Message({
      id: this.#id,
      from: this.#from,
      body: this.#body,
      timestamp: this.#timestamp,
      urgency: analysis.urgency,
      category: analysis.category
    });
  }

  toJSON() {
    return {
      id: this.#id,
      from: this.#from,
      body: this.#body,
      timestamp: this.#timestamp,
      urgency: this.#urgency,
      category: this.#category
    };
  }
}
