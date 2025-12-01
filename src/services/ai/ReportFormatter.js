/**
 * ReportFormatter - Formate les rapports IA pour Telegram
 * 
 * Ce module gère le formatage HTML des rapports générés par l'IA
 * pour l'affichage dans Telegram.
 * 
 * @module services/ai/ReportFormatter
 */

// ============================================
// CLASSE PRINCIPALE
// ============================================

export class ReportFormatter {
  
  /**
   * Formate un rapport IA complet pour Telegram
   * @param {Object} aiResult - Résultat de l'IA
   * @param {Object} stats - Statistiques
   * @param {number} totalMessages - Nombre total de messages
   * @returns {string} Rapport formaté en HTML
   */
  static format(aiResult, stats, totalMessages) {
    const now = new Date().toLocaleString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = '';

    // En-tête
    report += this.#formatHeader(now);

    // Salutation et résumé
    if (aiResult?.salutation) {
      report += `💬 <i>${aiResult.salutation}</i>\n\n`;
    }
    if (aiResult?.resume_situation) {
      report += `${aiResult.resume_situation}\n\n`;
    }

    // Statistiques
    report += this.#formatStats(aiResult?.statistiques);

    // Messages actionnables
    report += this.#formatActionableMessages(aiResult?.messages_actionnables);

    // Messages informatifs
    report += this.#formatInfoMessages(aiResult?.messages_info);

    // Tâches
    report += this.#formatTasks(aiResult?.taches);

    // Agenda
    report += this.#formatAgenda(aiResult?.agenda);

    // Insights
    report += this.#formatInsights(aiResult?.insights);

    // Conclusion
    if (aiResult?.conclusion) {
      report += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `💭 <i>${aiResult.conclusion}</i>\n`;
    }

    return report;
  }

  /**
   * Formate un rapport basique sans IA
   * @param {Object} stats - Statistiques
   * @param {Array} messages - Messages
   * @returns {string}
   */
  static formatBasic(stats, messages) {
    const now = new Date().toLocaleString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = `🤖 <b>C.A.R.L. - Rapport</b>\n`;
    report += `📅 ${now}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `📊 <b>Statistiques</b>\n`;
    report += `• Messages reçus: ${stats.received || 0}\n`;
    report += `• Messages envoyés: ${stats.sent || 0}\n`;
    report += `• Contacts: ${stats.contacts || 0}\n`;
    report += `• Erreurs: ${stats.errors || 0}\n\n`;

    if (messages?.length > 0) {
      report += `📨 <b>Derniers messages:</b>\n`;
      messages.slice(0, 5).forEach(m => {
        report += `• ${m.phone_number?.split('@')[0]}: "${(m.body || '').substring(0, 50)}..."\n`;
      });
    }

    return report;
  }

  /**
   * Formate un rapport vide (aucun message)
   * @param {Object} stats - Statistiques
   * @param {Object} agendaSummary - Résumé agenda
   * @returns {string}
   */
  static formatEmpty(stats, agendaSummary) {
    const now = new Date().toLocaleString('fr-CH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    let report = `🤖 <b>C.A.R.L. - Rapport</b>\n`;
    report += `📅 ${now}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    report += `💬 <i>Bonjour Jonas ! Journée calme aujourd'hui.</i>\n\n`;
    report += `📭 Aucun nouveau message à traiter.\n\n`;

    if (agendaSummary?.events?.length > 0) {
      report += `📅 <b>Agenda à venir:</b>\n`;
      agendaSummary.events.forEach(e => {
        report += `• ${e.day}: ${e.title} à ${e.start}\n`;
      });
    }

    return report;
  }

  // ============================================
  // MÉTHODES PRIVÉES - Sections du rapport
  // ============================================

  static #formatHeader(dateString) {
    return `🤖 <b>C.A.R.L. - Rapport Personnel</b>\n` +
           `📅 ${dateString}\n` +
           `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }

  static #formatStats(statistiques) {
    if (!statistiques) return '';

    let section = `┌─────────────────────────────────┐\n`;
    section += `│ 📊 <b>STATISTIQUES</b>         │\n`;
    section += `└─────────────────────────────────┘\n\n`;

    const categories = statistiques.par_categorie || {};
    section += `<b>Répartition par catégorie :</b>\n`;
    section += `├ 💼 Professionnel : ${categories.professionnel?.count || 0} (${categories.professionnel?.percent || 0}%)\n`;
    section += `├ 👤 Personnel     : ${categories.personnel?.count || 0} (${categories.personnel?.percent || 0}%)\n`;
    section += `├ 🤝 Bénévolat     : ${categories.benevolat?.count || 0} (${categories.benevolat?.percent || 0}%)\n`;
    section += `├ ⚽ Sport/Loisirs : ${categories.sport_loisirs?.count || 0} (${categories.sport_loisirs?.percent || 0}%)\n`;
    section += `└ 🚫 Spam          : ${categories.spam?.count || 0} (${categories.spam?.percent || 0}%)\n\n`;

    const urgences = statistiques.par_urgence || {};
    section += `<b>Par urgence :</b>\n`;
    section += `├ 🔴 Critique : ${urgences.critique?.count || 0}\n`;
    section += `├ 🟠 Haute    : ${urgences.haute?.count || 0}\n`;
    section += `├ 🟡 Moyenne  : ${urgences.moyenne?.count || 0}\n`;
    section += `└ 🟢 Basse    : ${urgences.basse?.count || 0}\n\n`;

    if (statistiques.temps_reponse_estime) {
      section += `⏱️ Temps de réponse conseillé: ${statistiques.temps_reponse_estime}\n\n`;
    }

    return section;
  }

  static #formatActionableMessages(messages) {
    if (!messages || messages.length === 0) return '';

    let section = `┌─────────────────────────────────┐\n`;
    section += `│ 🎯 <b>ACTIONS REQUISES</b>      │\n`;
    section += `└─────────────────────────────────┘\n\n`;

    messages.forEach((m, i) => {
      const urgencyIcon = {
        critique: '🔴',
        haute: '🟠',
        moyenne: '🟡',
        basse: '🟢'
      }[m.urgence] || '⚪';

      section += `${urgencyIcon} <b>${i + 1}. ${this.#escapeHtml(m.expediteur)}</b>\n`;
      section += `   📝 "${this.#escapeHtml((m.message_original || '').substring(0, 100))}"\n`;
      section += `   ➡️ <b>Action:</b> ${this.#escapeHtml(m.action_requise)}\n`;
      
      if (m.brouillon_reponse) {
        section += `   💬 <i>Réponse suggérée:</i>\n`;
        section += `   "${this.#escapeHtml(m.brouillon_reponse)}"\n`;
      }
      section += `\n`;
    });

    return section;
  }

  static #formatInfoMessages(messages) {
    if (!messages || messages.length === 0) return '';

    let section = `┌─────────────────────────────────┐\n`;
    section += `│ ℹ️ <b>MESSAGES INFORMATIFS</b>  │\n`;
    section += `└─────────────────────────────────┘\n\n`;

    messages.forEach(m => {
      section += `• <b>${this.#escapeHtml(m.expediteur)}:</b> ${this.#escapeHtml(m.resume)}\n`;
    });
    section += '\n';

    return section;
  }

  static #formatTasks(taches) {
    if (!taches || taches.length === 0) return '';

    let section = `┌─────────────────────────────────┐\n`;
    section += `│ ✅ <b>TÂCHES À FAIRE</b>        │\n`;
    section += `└─────────────────────────────────┘\n\n`;

    taches.forEach((t, i) => {
      const prioIcon = { haute: '🔴', moyenne: '🟡', basse: '🟢' }[t.priorite] || '⚪';
      section += `${prioIcon} <b>${i + 1}. ${this.#escapeHtml(t.titre)}</b>\n`;
      section += `   ${this.#escapeHtml(t.description)}\n`;
      if (t.deadline) {
        section += `   ⏰ Deadline: ${t.deadline}\n`;
      }
      section += `\n`;
    });

    return section;
  }

  static #formatAgenda(agenda) {
    if (!agenda) return '';

    let section = `┌─────────────────────────────────┐\n`;
    section += `│ 📅 <b>AGENDA</b>                │\n`;
    section += `└─────────────────────────────────┘\n\n`;

    const evenements = agenda.evenements_proposes || [];
    if (evenements.length > 0) {
      section += `<b>Événements proposés:</b>\n`;
      evenements.forEach(e => {
        section += `🗓️ <b>${this.#escapeHtml(e.activite)}</b> avec ${this.#escapeHtml(e.expediteur)}\n`;
        section += `   📍 ${e.quand}\n`;
        section += `   ${e.disponibilite_jonas === 'LIBRE' ? '✅' : '⚠️'} ${e.disponibilite_jonas}\n`;
        if (e.reponse_suggérée) {
          section += `   💬 "${this.#escapeHtml(e.reponse_suggérée)}"\n`;
        }
        section += `\n`;
      });
    }

    if (agenda.conflits_detectes?.length > 0) {
      section += `⚠️ <b>Conflits détectés:</b>\n`;
      agenda.conflits_detectes.forEach(c => {
        section += `• ${this.#escapeHtml(c)}\n`;
      });
      section += '\n';
    }

    if (agenda.resume_semaine) {
      section += `📋 ${this.#escapeHtml(agenda.resume_semaine)}\n\n`;
    }

    return section;
  }

  static #formatInsights(insights) {
    if (!insights || insights.length === 0) return '';

    let section = `┌─────────────────────────────────┐\n`;
    section += `│ 💡 <b>INSIGHTS</b>              │\n`;
    section += `└─────────────────────────────────┘\n\n`;

    insights.forEach(insight => {
      section += `${insight.emoji || '💡'} <b>${this.#escapeHtml(insight.titre)}</b>\n`;
      section += `   ${this.#escapeHtml(insight.detail)}\n`;
      if (insight.recommandation) {
        section += `   ➡️ ${this.#escapeHtml(insight.recommandation)}\n`;
      }
      section += `\n`;
    });

    return section;
  }

  /**
   * Échappe les caractères HTML
   * @param {string} text - Texte à échapper
   * @returns {string}
   */
  static #escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
