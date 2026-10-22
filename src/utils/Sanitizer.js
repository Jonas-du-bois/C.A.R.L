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
 * A safe wrapper around fetch that redacts sensitive information (like API keys and tokens)
 * from the URL in error messages and stack traces.
 */
export async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const sanitizeStr = (str) => {
      if (!str) return str;
      const urlRegex = /(https?:\/\/[^\s"'<]+)/g;
      return str.replace(urlRegex, (match) => {
        try {
          const parsed = new URL(match);
          let safeUrl = match;

          // Mask query parameters containing 'key' or 'token'
          for (const [key, value] of parsed.searchParams) {
            if (key.toLowerCase().includes('key') || key.toLowerCase().includes('token')) {
              safeUrl = safeUrl.replace(value, '[REDACTED]');
            }
          }

          // Mask telegram bot tokens in path
          const pathParts = parsed.pathname.split('/');
          for (const part of pathParts) {
            if (part.startsWith('bot') && part.includes(':')) {
              const token = part.substring(3);
              safeUrl = safeUrl.replace(token, '[REDACTED]');
            }
          }
          return safeUrl;
        } catch (e) {
          return '[REDACTED_URL]';
        }
      });
    };

    const safeMessage = sanitizeStr(err.message || '');
    const safeStack = sanitizeStr(err.stack || '');

    try {
      err.message = safeMessage;
      err.stack = safeStack;
      if (err.cause && err.cause.message) {
        err.cause.message = sanitizeStr(err.cause.message);
      }
      throw err;
    } catch (e) {
      if (e === err) {
        throw err;
      }
      const newErr = new Error(safeMessage);
      newErr.stack = safeStack;
      newErr.name = err.name;
      if (err.cause) {
        newErr.cause = err.cause;
      }
      throw newErr;
    }
  }
}
