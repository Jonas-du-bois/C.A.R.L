import { ValidationError } from '../utils/Errors.js';

export class Message {
  #id;
  #from;
  #body;
  #timestamp;

  constructor({ id, from, body, timestamp }) {
    if (!id || !from || !body) throw new ValidationError('Missing fields');
    this.#id = id;
    this.#from = from;
    this.#body = body.replace(/[\u200B-\u200D\uFEFF]/g, '').slice(0, 4096);
    this.#timestamp = timestamp || Date.now();
  }

  get id() { return this.#id; }
  get from() { return this.#from; }
  get body() { return this.#body; }
  get timestamp() { return this.#timestamp; }

  toJSON() {
    return {
      id: this.#id,
      from: this.#from,
      body: this.#body,
      timestamp: this.#timestamp
    };
  }
}
