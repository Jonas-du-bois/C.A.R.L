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
 * A safe fetch wrapper that sanitizes API keys from error messages, specifically handling DOMException.
 * @param {string|URL|Request} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export async function safeFetch(input, init) {
  try {
    return await fetch(input, init);
  } catch (err) {
    const message = err.message || '';
    // Look for common API key patterns (e.g., `key=...` or `Bearer ...`)
    const sanitizedMessage = message.replace(/(key=)[^&\s]+|([B|b]earer\s+)[^\s]+/g, '$1$2[REDACTED]');

    // Some Fetch errors (like AbortError) are DOMException which has a read-only message property
    try {
      err.message = sanitizedMessage;
      if (err.stack) {
        err.stack = err.stack.replace(/(key=)[^&\s]+|([B|b]earer\s+)[^\s]+/g, '$1$2[REDACTED]');
      }
    } catch (readonlyErr) {
      const sanitizedErr = new Error(sanitizedMessage);
      sanitizedErr.name = err.name;
      sanitizedErr.stack = err.stack?.replace(/(key=)[^&\s]+|([B|b]earer\s+)[^\s]+/g, '$1$2[REDACTED]');
      throw sanitizedErr;
    }
    throw err;
  }
}
