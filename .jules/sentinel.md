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
