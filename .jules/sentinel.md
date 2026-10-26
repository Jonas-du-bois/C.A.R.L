## 2025-05-23 - AI Output Sanitization
**Vulnerability:** IDOR/Injection risk in `AIService`. The service blindly passed the `event_details` object from the AI response to `CalendarService`. Although the system prompt schema did not include `calendarId`, a compromised or hallucinating AI could inject this field, potentially allowing creation of events in arbitrary calendars.
**Learning:** LLM structured outputs (JSON) are still "user input" and must be strictly validated/sanitized. We cannot rely on the prompt instructions alone to enforce schema.
**Prevention:** Explicitly whitelist allowed fields when parsing AI JSON responses in `AIService`, discarding any unknown properties before passing data to other services.

## 2025-05-24 - Report Structure Sanitization
**Vulnerability:** Massive payload/DoS and Injection risk in `AIService.generateFullReport`. The method returned raw JSON parsed from AI response without validation. This allowed potential injection of massive strings (DoS), unexpected fields, or HTML/JS payloads that could be processed by downstream services (Telegram/Calendar).
**Learning:** Even complex nested AI outputs (like daily reports) must be rigorously sanitized. Trusting `JSON.parse` is not enough. Sanitize structure, types, lengths, and array sizes.
**Prevention:** Implemented `_sanitizeReport` method to enforce strict schema, string length limits (e.g. 1000 chars), array size limits (max 10 items), and valid enum values.

## 2025-05-25 - Prompt Injection via Message Body
**Vulnerability:** Direct concatenation of `message.body` in `AIService.analyzeMessage` allowed prompt injection attacks (e.g. "Ignore previous instructions").
**Learning:** LLM prompts are code. User input must be treated as data and strictly delimited.
**Prevention:** Wrapped all user input in `"""` triple quotes and updated `SYSTEM_PROMPT` to explicitly instruct the model to treat delimited content as data.

## 2025-05-26 - Prompt Injection via Delimiter Manipulation
**Vulnerability:** User input containing the delimiter `"""` could break out of the data block in `AIService` prompts, allowing instructions to be executed by the LLM (e.g., `""" Ignore previous instructions`).
**Learning:** Delimiters alone are insufficient if the user input can contain the delimiter itself. User input must be sanitized to escape or neutralize the delimiter characters.
**Prevention:** Implemented `#sanitizePromptInput` in `AIService` to escape all occurrences of `"""` in user input (messages and context) before injecting them into the prompt.

## 2025-05-27 - Prompt Injection via Contact Name
**Vulnerability:** Contact names (push names or display names) were interpolated directly into AI prompts in `AIService` methods like `extractEventsFromConversations` and `generateFullReport`. A malicious user could set their contact name to include `"""` or other delimiters to manipulate the prompt.
**Learning:** All user-controlled input, including metadata like contact names, must be treated as untrusted and sanitized before being used in LLM prompts.
**Prevention:** Sanitized `contactName` using `#sanitizePromptInput` in all occurrences within `AIService`.

## 2025-05-28 - Unbounded Memory Growth in Rate Limiting
**Vulnerability:** Denial of Service (DoS) via memory exhaustion in `GatekeeperHandler`. The handler stored user timestamps in an unbounded `Map` without cleanup, allowing an attacker to exhaust server memory by sending messages from many unique identifiers.
**Learning:** Any stateful mechanism tracking user activity (like rate limits) must implement a cleanup strategy (TTL or periodic purge) to prevent unbounded growth.
**Prevention:** Implemented a periodic `cleanup()` task in `GatekeeperHandler` that removes users with no recent activity every 5 minutes.

## 2025-05-29 - Prevent API Key Leak in Error Objects
**Vulnerability:** Raw `fetch` API error stack traces could leak API keys embedded in URLs (e.g., Gemini API, Telegram API) when a network error throws an exception containing the URL.
**Learning:** When intercepting and sanitizing errors from native `fetch` calls, the thrown error can be a `DOMException` (e.g., `TimeoutError`, `AbortError`) where the `message` property is a read-only getter. Attempting to directly reassign `err.message` causes a strict mode crash. Furthermore, modifying an `Error` object's `message` property does not automatically update its `stack` trace string in V8.
**Prevention:** Created a `safeFetch` wrapper that rigorously sanitizes both `err.message` and `err.stack` against a configurable list of secrets. Handled read-only getters by catching the reassignment exception and falling back to creating a new `Error` object with the original name and stack, throwing it carefully outside the `try/catch` block to preserve the correct control flow and error prototype chain.
