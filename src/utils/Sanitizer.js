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
 * A safe wrapper for the global fetch function.
 * Ensures that sensitive keys and tokens (e.g. API keys, bot tokens)
 * are not leaked in the error message or stack trace if a network error occurs.
 */
export async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const sanitizeStr = (str) => {
      if (typeof str !== 'string') return str;
      return str.replace(/(key=|bot|Bearer\s+)[^\/\s&?]+/gi, '$1***');
    };

    const sanitizedMsg = sanitizeStr(err.message);
    let newErr;
    try {
      err.message = sanitizedMsg;
      if (err.stack) {
        err.stack = sanitizeStr(err.stack);
      }
      newErr = err;
    } catch (e) {
      newErr = new Error(sanitizedMsg);
      newErr.name = err.name;
      if (err.stack) {
        newErr.stack = sanitizeStr(err.stack);
      }
    }
    throw newErr;
  }
}
