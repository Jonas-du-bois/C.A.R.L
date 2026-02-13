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

## 2026-02-11 - Atomic Updates for Contact Stats
**Learning:** The message processing pipeline was performing redundant writes to the `contacts` table: one UPSERT to update metadata (last seen) and a subsequent UPDATE to increment message stats. This caused two DB roundtrips and increased lock contention.
**Action:** Modified `findOrCreateContact` to accept an option for atomic increment, merging the metadata update and stats increment into a single UPSERT query. This reduced the number of DB writes per message from 3 to 2 (1 for contact+stats, 1 for message).

## 2026-03-01 - Optimizing Queue Throughput with Nested Queues
**Learning:** The previous `QueueService` implementation used `globalQueue.add(() => senderQueue.add(task))`. This caused a severe "Head-of-Line Blocking" issue where a single sender with many sequential tasks would monopolize global concurrency slots. The global queue saw the *wrapper* tasks as active, even though the inner `senderQueue` was blocking them.
**Action:** Inverted the queue nesting to `senderQueue.add(() => globalQueue.add(task))`. This ensures that only tasks *actually ready to execute* enter the global queue. Benchmark showed a ~6.6x latency reduction (113ms -> 17ms) for other users during congestion. Always verify that rate-limiting or serialization logic doesn't inadvertently consume shared resources while waiting.
