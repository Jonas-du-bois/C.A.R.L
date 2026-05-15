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

export function sanitizeError(error, token) {
  if (!error || !token) return error;

  if (!(error instanceof Error)) {
    if (typeof error === 'string') {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return error.replace(new RegExp(escapedToken, 'g'), '[HIDDEN_TOKEN]');
    }
    return error;
  }

  const newError = new Error(error.message);

  // Clone all other properties to not drop custom fields
  Object.getOwnPropertyNames(error).forEach(key => {
    if (key !== 'message' && key !== 'stack' && key !== 'cause') {
      newError[key] = error[key];
    }
  });
  newError.name = error.name;

  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenRegex = new RegExp(escapedToken, 'g');

  if (error.stack) {
    newError.stack = error.stack.replace(tokenRegex, '[HIDDEN_TOKEN]');
  }

  if (newError.message) {
    newError.message = newError.message.replace(tokenRegex, '[HIDDEN_TOKEN]');
  }

  if (error.cause) {
     newError.cause = sanitizeError(error.cause, token);
  }

  return newError;
}
