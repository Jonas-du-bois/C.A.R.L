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
 * A safe wrapper for fetch that prevents leaking sensitive data like tokens
 * in error messages when exceptions (e.g., network errors, DOMExceptions) occur.
 */
export async function safeFetch(url, options = {}, secretToken = null) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (!secretToken) {
      throw err;
    }

    let escapedToken = '';
    for (const char of secretToken) {
      if ('\\^$*+?.()|{}[]'.includes(char)) {
        escapedToken += '\\';
      }
      escapedToken += char;
    }
    const tokenRegex = new RegExp(escapedToken, 'g');

    let newErr = err;
    try {
      if (err.message) {
        err.message = err.message.replace(tokenRegex, '***');
      }
    } catch (e) {
      // Handles cases where message is a read-only getter, e.g. DOMException
      newErr = new Error(err.message.replace(tokenRegex, '***'));
      newErr.name = err.name;
    }

    if (newErr.stack) {
      newErr.stack = newErr.stack.replace(tokenRegex, '***');
    }
    throw newErr;
  }
}
