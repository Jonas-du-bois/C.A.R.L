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
 * A safe fetch wrapper that sanitizes error messages and stack traces
 * to prevent API keys (e.g. key=... or bot...) from leaking.
 * @param {string|Request} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function safeFetch(input, init) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const sanitize = (str) => {
      if (!str) return str;
      return str.replace(/(bot|key=)[^&/\s]+/g, "$1***");
    };

    const sanitizeError = (err) => {
      let safeErr = err;
      try {
        safeErr.message = sanitize(err.message);
      } catch (e) {
        // Handle read-only message properties (like DOMException)
        safeErr = new Error(sanitize(err.message));
        safeErr.name = err.name;
      }

      if (err.stack) {
        safeErr.stack = sanitize(err.stack);
      }

      if (err.cause) {
        safeErr.cause = sanitizeError(err.cause);
      }

      return safeErr;
    };

    throw sanitizeError(error);
  }
}
