## 2025-03-01 - Optimizing Message Retrieval by Contact
**Learning:** SQLite query performance for retrieving messages by contact was suboptimal because it required filtering by `contact_id` and then sorting by `received_at`. While individual indexes existed for both columns, the absence of a composite index `(contact_id, received_at DESC)` forced SQLite to perform a separate sort operation or inefficiently use single-column indexes.

**Action:** Added `CREATE INDEX IF NOT EXISTS idx_messages_contact_received ON messages(contact_id, received_at DESC);` to `src/repositories/Database.js`. This allows SQLite to retrieve messages for a specific contact already sorted by time, avoiding the sort step. Benchmarks showed a ~47% reduction in query time (from ~71ms to ~37ms for 100 queries). Future queries involving filtering and sorting should always be considered for composite indexes.

## 2025-03-01 - Parallelizing Message Processing
**Learning:** Sequential execution of "typing simulation" (artificial delay) and AI analysis was causing unnecessary latency. The user perceived the full sum of typing delay + AI processing time. By running them concurrently using `Promise.all`, the perceived latency is reduced to `max(typing_delay, ai_processing_time)`.
**Action:** Identify independent async operations in request handlers and use `Promise.all` to execute them in parallel. Also, fetching context *before* saving the current message prevents duplication in the AI prompt history, saving tokens and improving model coherence.

## 2026-02-09 - Direct Key Lookup vs JOINs in High-Throughput Paths
**Learning:** `MessageRepository.findRecent` used a JOIN with the `contacts` table to filter by phone number, even when the `contact_id` was already known in the calling context (`MessageHandler`). This added unnecessary overhead to the "hot path" of every incoming message.
**Action:** Implemented `findRecentByContactId` to query the `messages` table directly using `contact_id`, leveraging the `idx_messages_contact_received` index without a JOIN. Benchmarks showed a ~3.3x speedup (~1.4ms to ~0.4ms) for context retrieval. Always prefer direct foreign key lookups over JOINs when the ID is available in the upper layer.

## 2026-02-10 - Deferring Non-Critical DB Writes
**Learning:** Even fast synchronous DB operations like `saveAnalysis` (SQLite INSERT) block the event loop. When placed in the critical path before sending a network response (`sendMessage`), they add unnecessary latency to the user experience. By moving these operations *after* the response is sent, the perceived latency is reduced by the duration of the DB write plus any serialization overhead.
**Action:** Audit request handlers to ensure that only operations strictly required to generate the response (e.g., AI analysis) occur before sending it. Move logging, analytics, and non-blocking side effects to execute after the response is sent.

## 2026-02-12 - Read-Optimized UPSERT for Frequent Writes
**Learning:** Using `INSERT ... ON CONFLICT DO UPDATE` unconditionally performs a write operation (and potentially triggers WAL checkpoints) even when the data hasn't changed. For high-frequency entities like `contacts` (accessed per message), this creates unnecessary I/O overhead.
**Action:** Implemented a "Read-First" strategy: attempt to `SELECT` the record first. If it exists and matches metadata, skip the write entirely. Only perform the UPSERT when data actually changes or the record is missing. This significantly reduces unnecessary writes for stable contact data.
