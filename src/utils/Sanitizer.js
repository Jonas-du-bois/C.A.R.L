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
 * A wrapper around fetch that redacts sensitive information (API keys, Telegram bot tokens)
 * from error messages, stacks, and causes when fetch throws.
 */
export async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (error) {
    let safeError = error;
    // Matches standard Telegram bot tokens and generic URL keys
    const sensitivePattern = /(bot\d+:[a-zA-Z0-9_-]+)|(key=[a-zA-Z0-9_-]+)/gi;

    try {
      error.message = error.message.replace(sensitivePattern, '***REDACTED***');
      if (error.stack) {
        error.stack = error.stack.replace(sensitivePattern, '***REDACTED***');
      }
    } catch (e) {
      // DOMExceptions (e.g. TimeoutError/AbortError) have read-only 'message' properties in strict mode/Node.js
      safeError = new Error(error.message.replace(sensitivePattern, '***REDACTED***'));
      safeError.name = error.name;
      if (error.stack) {
        safeError.stack = error.stack.replace(sensitivePattern, '***REDACTED***');
      }
      if (error.cause) {
        safeError.cause = error.cause;
      }
    }

    if (safeError.cause && safeError.cause.message) {
      try {
        safeError.cause.message = safeError.cause.message.replace(sensitivePattern, '***REDACTED***');
      } catch (e) {
        const safeCause = new Error(safeError.cause.message.replace(sensitivePattern, '***REDACTED***'));
        safeCause.name = safeError.cause.name;
        if (safeError.cause.stack) safeCause.stack = safeError.cause.stack.replace(sensitivePattern, '***REDACTED***');
        safeError.cause = safeCause;
      }
    }

    throw safeError;
  }
}
