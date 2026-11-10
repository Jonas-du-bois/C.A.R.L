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
 * A safe fetch wrapper that sanitizes error messages and stacks to prevent
 * leaking sensitive tokens (like bot tokens or API keys) when network errors occur.
 * @param {string|Request} url - The URL or Request object to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const sanitizeString = (str) => {
      if (!str) return str;
      return str.replace(/(bot|key=)[^&/\s]+/g, '$1***');
    };

    let safeError;
    try {
      error.message = sanitizeString(error.message);
      if (error.stack) {
        error.stack = sanitizeString(error.stack);
      }
      safeError = error;
    } catch (e) {
      // Handle DOMExceptions where message is read-only
      safeError = new Error(sanitizeString(error.message));
      safeError.name = error.name;
      if (error.stack) {
        safeError.stack = sanitizeString(error.stack);
      }
      if (error.cause) {
         safeError.cause = error.cause;
      }
    }

    // Also sanitize cause if present
    if (safeError.cause && safeError.cause.message) {
        try {
            safeError.cause.message = sanitizeString(safeError.cause.message);
            if (safeError.cause.stack) {
                safeError.cause.stack = sanitizeString(safeError.cause.stack);
            }
        } catch(e) {
            // Read-only cause message
        }
    }
    throw safeError;
  }
}
