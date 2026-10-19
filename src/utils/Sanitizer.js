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
 * Executes a fetch request safely, preventing API keys from being leaked
 * in error messages when exceptions occur.
 *
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {string|string[]} secretsToHide - Secrets to redact from error messages (e.g. API keys)
 * @returns {Promise<Response>} Fetch response
 */
export async function safeFetch(url, options = {}, secretsToHide = []) {
  try {
    return await fetch(url, options);
  } catch (error) {
    // Determine secrets to redact
    const secrets = Array.isArray(secretsToHide) ? [...secretsToHide] : [secretsToHide];

    // Extract headers that might contain secrets (like Authorization)
    if (options.headers) {
      let authHeader;
      if (options.headers instanceof Headers) {
        authHeader = options.headers.get('Authorization') || options.headers.get('authorization');
      } else {
        authHeader = options.headers['Authorization'] || options.headers['authorization'];
      }
      if (authHeader && authHeader.startsWith('Bearer ')) {
        secrets.push(authHeader.replace('Bearer ', '').trim());
      }
    }

    // Filter out empty/null secrets
    const validSecrets = secrets.filter(s => s && typeof s === 'string' && s.length > 0);

    // Create a new sanitized error to avoid mutating read-only properties
    let sanitizedMessage = error.message;
    let sanitizedStack = error.stack;

    for (const secret of validSecrets) {
      // Escape secret for use in regex
      let escapedSecret = '';
      for (const char of secret) {
        if ('\\^$*+?.()|{}[]'.includes(char)) {
          escapedSecret += '\\' + char;
        } else {
          escapedSecret += char;
        }
      }

      const regex = new RegExp(escapedSecret, 'g');
      sanitizedMessage = sanitizedMessage.replace(regex, '***REDACTED***');
      if (sanitizedStack) {
        sanitizedStack = sanitizedStack.replace(regex, '***REDACTED***');
      }
    }

    // Construct new Error preserving sanitized info
    const newError = new Error(sanitizedMessage);
    newError.name = error.name;
    if (sanitizedStack) {
      newError.stack = sanitizedStack;
    }
    if (error.cause) {
      newError.cause = error.cause;
    }

    throw newError;
  }
}
