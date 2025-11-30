import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import { EventEmitter } from 'events';

export class WhatsAppService extends EventEmitter {
  #client;

  constructor(config) {
    super();
    this.#client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: config.whatsapp.puppeteer
    });

    this.#client.on('qr', (qr) => this.emit('qr', qr));
    this.#client.on('ready', () => this.emit('ready'));
    this.#client.on('message', (msg) => this.emit('message', msg));
  }

  initialize() {
    return this.#client.initialize();
  }

  async sendStateTyping(chatId) {
    const chat = await this.#client.getChatById(chatId);
    await chat.sendStateTyping();
  }

  async sendMessage(chatId, content) {
    await this.#client.sendMessage(chatId, content);
  }
}
