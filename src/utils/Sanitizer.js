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
 * A safe wrapper for fetch that prevents sensitive tokens from leaking in error messages and stacks.
 * @param {string|URL} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {Array<string>} sensitiveTokens - Array of tokens to redact from errors
 * @returns {Promise<Response>}
 */
export async function safeFetch(url, options, sensitiveTokens = []) {
  try {
    return await fetch(url, options);
  } catch (error) {
    let sanitizedMessage = error.message || '';
    let sanitizedStack = error.stack || '';

    if (sensitiveTokens && sensitiveTokens.length > 0) {
      for (const token of sensitiveTokens) {
        if (!token) continue;
        let escapedToken = '';
        for (let i = 0; i < token.length; i++) {
          if ('\\^$*+?.()|{}[]'.includes(token[i])) {
            escapedToken += '\\';
          }
          escapedToken += token[i];
        }
        const regex = new RegExp(escapedToken, 'g');
        sanitizedMessage = sanitizedMessage.replace(regex, '[REDACTED]');
        sanitizedStack = sanitizedStack.replace(regex, '[REDACTED]');
      }
    }

    try {
      error.message = sanitizedMessage;
      if (error.stack) error.stack = sanitizedStack;
      throw error;
    } catch (e) {
      // Handle DOMException or other errors where message is read-only
      const newError = new Error(sanitizedMessage);
      newError.name = error.name;
      newError.stack = sanitizedStack;
      throw newError;
    }
  }
}
