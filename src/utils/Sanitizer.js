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
 * Wraps global fetch to sanitize errors and prevent sensitive data leakage (e.g. API keys in URLs)
 * @param {string|URL|Request} resource - The resource to fetch
 * @param {Object} options - Fetch options
 * @param {Array<string>} sensitiveData - Array of strings to redact from error messages
 * @returns {Promise<Response>}
 */
export async function safeFetch(resource, options = {}, sensitiveData = []) {
  try {
    const fetchFn = globalThis.fetch;
    return await fetchFn(resource, options);
  } catch (err) {
    let sanitizedMsg = err.message || '';
    let sanitizedStack = err.stack || '';

    if (sensitiveData && sensitiveData.length > 0) {
      for (const secret of sensitiveData) {
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
        sanitizedMsg = sanitizedMsg.replace(regex, '***REDACTED***');
        sanitizedStack = sanitizedStack.replace(regex, '***REDACTED***');
      }
    }

    let errorToThrow;
    try {
      err.message = sanitizedMsg;
      err.stack = sanitizedStack;
      errorToThrow = err;
    } catch (e) {
      // Handle DOMException where message is read-only
      errorToThrow = new Error(sanitizedMsg);
      errorToThrow.name = err.name;
      errorToThrow.stack = sanitizedStack;
    }

    throw errorToThrow;
  }
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
