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
 * A safe wrapper around global fetch that redacts sensitive information from error messages.
 * @param {string|Request} url - The URL to fetch.
 * @param {Object} options - Fetch options.
 * @param {string[]} secretsToHide - Array of string secrets to redact from errors.
 * @returns {Promise<Response>} The fetch response.
 */
export async function safeFetch(url, options = {}, secretsToHide = []) {
  try {
    return await globalThis.fetch(url, options);
  } catch (err) {
    if (secretsToHide && secretsToHide.length > 0) {
      let sanitizedMessage = err.message || '';
      let sanitizedStack = err.stack || '';

      for (const secret of secretsToHide) {
        if (!secret) continue;

        let escapedSecret = '';
        for (let i = 0; i < secret.length; i++) {
          const char = secret[i];
          if ('\\^$*+?.()|{}[]'.includes(char)) {
            escapedSecret += '\\' + char;
          } else {
            escapedSecret += char;
          }
        }

        const regex = new RegExp(escapedSecret, 'g');
        sanitizedMessage = sanitizedMessage.replace(regex, '***REDACTED***');
        sanitizedStack = sanitizedStack.replace(regex, '***REDACTED***');
      }

      try {
        err.message = sanitizedMessage;
        if (err.stack) {
           err.stack = sanitizedStack;
        }
      } catch (assignError) {
        // DOMException has read-only message property in strict mode
        const newErr = new Error(sanitizedMessage);
        newErr.stack = sanitizedStack;
        throw newErr;
      }
    }
    throw err;
  }
}
