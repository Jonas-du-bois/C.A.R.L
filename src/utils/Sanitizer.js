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
 * Executes a fetch request safely, sanitizing error messages to prevent API key leaks
 * @param {string|URL|Request} input - The resource to fetch
 * @param {RequestInit} [init] - Fetch options
 * @returns {Promise<Response>}
 */
export async function safeFetch(input, init) {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (err instanceof Error) {
      // Find and sanitize keys in the error message
      let sanitizedMessage = err.message;
      let sanitizedStack = err.stack;

      const keyPattern = /key=[a-zA-Z0-9_-]+/gi;
      const tokenPattern = /bot[a-zA-Z0-9:_-]+/gi;

      sanitizedMessage = sanitizedMessage.replace(keyPattern, 'key=***');
      sanitizedMessage = sanitizedMessage.replace(tokenPattern, 'bot***');

      if (sanitizedStack) {
         sanitizedStack = sanitizedStack.replace(keyPattern, 'key=***');
         sanitizedStack = sanitizedStack.replace(tokenPattern, 'bot***');
      }

      try {
          err.message = sanitizedMessage;
          if (err.stack) err.stack = sanitizedStack;
          throw err;
      } catch (e) {
          // In case err.message is read-only (DOMException)
          const newErr = new Error(sanitizedMessage);
          newErr.name = err.name;
          if (sanitizedStack) newErr.stack = sanitizedStack;
          throw newErr;
      }
    }
    throw err;
  }
}
