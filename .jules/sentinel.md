## 2024-05-23 - HTML Injection in Telegram Messages
**Vulnerability:** User input (names, messages) was interpolated directly into Telegram messages sent with `parse_mode: 'HTML'`.
**Learning:** Even internal/admin tools are vulnerable to DoS if they process untrusted input. Telegram API fails on invalid HTML.
**Prevention:** Always escape user input when using `parse_mode: 'HTML'`. Added `escapeHtml` to `src/utils/Sanitizer.js`.
