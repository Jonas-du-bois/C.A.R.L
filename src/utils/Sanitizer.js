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
 * A wrapper around native fetch that sanitizes error messages and stack traces
 * to prevent leaking sensitive information (like API keys) in logs.
 * @param {string|URL} url - The URL to fetch.
 * @param {Object} options - Fetch options.
 * @param {Array<string>} secretsToHide - Array of secrets to redact from error messages.
 * @returns {Promise<Response>} The fetch response.
 */
export async function safeFetch(url, options = {}, secretsToHide = []) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (!secretsToHide || secretsToHide.length === 0) {
      throw err;
    }

    let sanitizedMessage = err.message || '';
    let sanitizedStack = err.stack || '';

    for (const secret of secretsToHide) {
      if (!secret) continue;

      let escapedSecret = '';
      for (let i = 0; i < secret.length; i++) {
        const char = secret[i];
        if ('\\^$*+?.()|{}[]'.includes(char)) {
          escapedSecret += '\\';
        }
        escapedSecret += char;
      }

      const regex = new RegExp(escapedSecret, 'g');
      sanitizedMessage = sanitizedMessage.replace(regex, '***HIDDEN***');
      sanitizedStack = sanitizedStack.replace(regex, '***HIDDEN***');
    }

    let rethrowErr = err;
    try {
      err.message = sanitizedMessage;
      err.stack = sanitizedStack;
    } catch (e) {
      // Handle DOMException where message is a read-only getter
      rethrowErr = new Error(sanitizedMessage);
      rethrowErr.name = err.name;
      rethrowErr.stack = sanitizedStack;
      if (err.cause) rethrowErr.cause = err.cause;
    }
    throw rethrowErr;
  }
}
