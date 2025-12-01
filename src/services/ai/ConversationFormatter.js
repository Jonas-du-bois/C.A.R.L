/**
 * ConversationFormatter - Formate les conversations pour l'IA
 * 
 * Ce module gère le formatage des conversations pour les envoyer
 * à l'IA de manière structurée et lisible.
 * 
 * @module services/ai/ConversationFormatter
 */

// ============================================
// CONSTANTES
// ============================================

const MAX_MESSAGE_LENGTH = 300;
const URGENCY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

// ============================================
// CLASSE PRINCIPALE
// ============================================

export class ConversationFormatter {

  /**
   * Formate les conversations pour le prompt IA
   * @param {Array} conversations - Conversations groupées par contact
   * @param {number} maxConversations - Nombre max de conversations (défaut: 15)
   * @returns {string} Texte formaté pour le prompt
   */
  static formatForAI(conversations, maxConversations = 15) {
    const limited = conversations.slice(0, maxConversations);
    
    return limited.map((conv, index) => {
      const messagesText = this.#formatMessages(conv);
      const dominantCategory = this.#getDominantCategory(conv);
      const maxUrgency = this.#getMaxUrgency(conv);

      return `
┌─────────────────────────────────────────────────────────────────────
│ CONVERSATION #${index + 1}: ${conv.contactName}
│ Messages: ${conv.stats.incoming} reçus, ${conv.stats.outgoing} réponses
│ Catégorie détectée: ${dominantCategory} | Urgence max: ${maxUrgency}
├─────────────────────────────────────────────────────────────────────
${messagesText}
└─────────────────────────────────────────────────────────────────────`;
    }).join('\n\n');
  }

  /**
   * Formate les résumés pré-traités pour le prompt final
   * @param {Array} summaries - Résumés des conversations pré-traitées
   * @returns {string} Section formatée
   */
  static formatPreprocessedSection(summaries) {
    if (!summaries || summaries.length === 0) return '';

    return `
═══════════════════════════════════════════════════════════════════════
RÉSUMÉS DES CONVERSATIONS IMPORTANTES (pré-analysées)
═══════════════════════════════════════════════════════════════════════

${summaries.map((summary, i) => `
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

  /**
   * Génère un résumé par contact pour les stats
   * @param {Array} conversations - Conversations
   * @param {number} maxContacts - Nombre max de contacts à afficher
   * @returns {string}
   */
  static formatContactSummary(conversations, maxContacts = 10) {
    return conversations.slice(0, maxContacts).map(c => 
      `• ${c.contactName}: ${c.stats.incoming} reçus, ${c.stats.outgoing} envoyés`
    ).join('\n');
  }

  /**
   * Formate les informations d'agenda
   * @param {Object} agendaSummary - Résumé de l'agenda
   * @returns {string}
   */
  static formatAgendaInfo(agendaSummary) {
    if (!agendaSummary?.configured) {
      return "Agenda Google non configuré.";
    }

    const eventsStr = agendaSummary.events?.length > 0
      ? agendaSummary.events.map(e => `- ${e.day}: ${e.title} à ${e.start}`).join('\n')
      : "Aucun événement à venir.";
    
    const slotsStr = agendaSummary.slots?.length > 0
      ? agendaSummary.slots.map(s => `- ${s.day}: ${s.start} - ${s.end} (${s.duration})`).join('\n')
      : "Pas de créneau disponible trouvé.";
    
    return `ÉVÉNEMENTS À VENIR (3 prochains jours):
${eventsStr}

CRÉNEAUX DISPONIBLES (min 1h30):
${slotsStr}`;
  }

  /**
   * Crée un fallback de résumé si l'IA échoue
   * @param {Object} conv - Conversation
   * @returns {Object} Résumé de fallback
   */
  static createFallbackSummary(conv) {
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

  // ============================================
  // MÉTHODES PRIVÉES
  // ============================================

  /**
   * Formate les messages d'une conversation
   * @param {Object} conv - Conversation
   * @returns {string}
   */
  static #formatMessages(conv) {
    return conv.messages.map(msg => {
      const time = new Date(msg.timestamp).toLocaleString('fr-CH', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const direction = msg.direction === 'incoming' ? '→' : '←';
      const sender = msg.direction === 'incoming' ? conv.contactName : 'Jonas (toi)';
      
      const body = msg.body?.length > MAX_MESSAGE_LENGTH 
        ? msg.body.substring(0, MAX_MESSAGE_LENGTH) + '...' 
        : msg.body;
      
      return `  ${direction} [${time}] ${sender}: "${body}"`;
    }).join('\n');
  }

  /**
   * Obtient la catégorie dominante d'une conversation
   * @param {Object} conv - Conversation
   * @returns {string}
   */
  static #getDominantCategory(conv) {
    const entries = Object.entries(conv.stats.categories);
    if (entries.length === 0) return 'non classé';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Obtient l'urgence maximale d'une conversation
   * @param {Object} conv - Conversation
   * @returns {string}
   */
  static #getMaxUrgency(conv) {
    const urgencies = Object.keys(conv.stats.urgencies);
    if (urgencies.length === 0) return 'normal';
    return urgencies.sort((a, b) => 
      (URGENCY_ORDER[b] || 0) - (URGENCY_ORDER[a] || 0)
    )[0];
  }
}
