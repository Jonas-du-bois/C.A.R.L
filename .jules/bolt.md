## 2025-03-01 - Optimizing Message Retrieval by Contact
**Learning:** SQLite query performance for retrieving messages by contact was suboptimal because it required filtering by `contact_id` and then sorting by `received_at`. While individual indexes existed for both columns, the absence of a composite index `(contact_id, received_at DESC)` forced SQLite to perform a separate sort operation or inefficiently use single-column indexes.

**Action:** Added `CREATE INDEX IF NOT EXISTS idx_messages_contact_received ON messages(contact_id, received_at DESC);` to `src/repositories/Database.js`. This allows SQLite to retrieve messages for a specific contact already sorted by time, avoiding the sort step. Benchmarks showed a ~47% reduction in query time (from ~71ms to ~37ms for 100 queries). Future queries involving filtering and sorting should always be considered for composite indexes.

## 2025-03-01 - Parallelizing Message Processing
**Learning:** Sequential execution of "typing simulation" (artificial delay) and AI analysis was causing unnecessary latency. The user perceived the full sum of typing delay + AI processing time. By running them concurrently using `Promise.all`, the perceived latency is reduced to `max(typing_delay, ai_processing_time)`.
**Action:** Identify independent async operations in request handlers and use `Promise.all` to execute them in parallel. Also, fetching context *before* saving the current message prevents duplication in the AI prompt history, saving tokens and improving model coherence.
