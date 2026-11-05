export function sanitizePhoneNumber(phone) {
  return phone.replace(/[^\d+]/g, '');
}

export function sanitizeMessageContent(content) {
  // Remove zero-width characters and control characters
  let cleaned = content.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Truncate to 4096 characters
  if (cleaned.length > 4096) {
    cleaned = cleaned.slice(0, 4096);
  }

  return cleaned;
}

/**
 * Escapes HTML characters to prevent injection in Telegram messages
 * @param {string} unsafe - The string to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Safely fetches a URL without leaking API keys or secrets in error messages/stack traces.
 *
 * @param {string} url - The URL to fetch.
 * @param {Object} options - Fetch options.
 * @returns {Promise<Response>}
 */
export async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    let errMessage = error.message;
    let stack = error.stack;

    // Sanitize API keys from URL patterns (both query params and Telegram bot token paths)
    // For telegram: /bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/ -> /bot***/
    const secretRegex = /(key|token|api_key|secret)=[^&\s]+|bot[^/]+/gi;
    if (errMessage) errMessage = errMessage.replace(secretRegex, (match) => {
        if (match.toLowerCase().startsWith('bot')) return 'bot***';
        return match.split('=')[0] + '=***';
    });
    if (stack) stack = stack.replace(secretRegex, (match) => {
        if (match.toLowerCase().startsWith('bot')) return 'bot***';
        return match.split('=')[0] + '=***';
    });

    let safeError;
    try {
        error.message = errMessage;
        error.stack = stack;
        safeError = error;
    } catch (e) {
        safeError = new Error(errMessage);
        safeError.name = error.name;
        safeError.cause = error.cause;
        safeError.stack = stack;
    }
    throw safeError;
  }
}
