# Product Roadmap: Zeltra Ecosystem

This document outlines the architectural roadmap for expanding this platform into a suite of zero-knowledge, zero-storage, edge-native developer utilities.

Contributors interested in submitting pull requests should align their implementations with the technical specifications and acceptance criteria defined below.

---

## Architectural Principles

All tools in the ecosystem must adhere to four non-negotiable constraints:

1. **Zero Server Storage:** 0 bytes of persistent storage (no databases, no S3/R2 buckets, no disk writes). Data resides exclusively in client volatile RAM during active sessions.
2. **Zero-Knowledge E2EE:** Payloads are encrypted client-side via Web Crypto (AES-GCM-256) before transmission. Keys reside strictly in the URL hash fragment (`#key=...`) and are never sent to the server.
3. **Zero Registration:** Instant ad-hoc pairing via 6-character Crockford Base32 room codes or QR codes.
4. **Edge WebSocket Relays:** Blind packet routing powered by Cloudflare Workers and Durable Objects using the WebSocket Hibernation API.

---

## Phase 1: `drop` (Zero-Storage Ephemeral File Transfer)

### Overview
A peer-to-peer style file streaming utility capable of transferring large files (up to 1 GB) through the Cloudflare Anycast edge network without writing any file bytes to persistent server storage.

### Data Flow & Protocol Specification
1. **Sender Chunking:** The sender client reads a file using `ReadableStream` and splits it into sequential 64 KB binary chunks.
2. **Client-Side Encryption:** Each chunk is encrypted using AES-GCM-256 with an incrementing counter or unique IV.
3. **Stream-Through Relay:** The sender transmits encrypted binary frames via WebSocket to the assigned Durable Object (`drop:ROOM_ID`).
4. **Memory Passthrough:** The Durable Object immediately forwards each chunk to connected receiver WebSockets without buffering the full file in memory.
5. **Receiver Assembly:** The receiver decrypts chunks on the fly and streams them directly to disk using the `FileSystemWritableFileStream` API (or accumulates into an in-memory `Blob` for smaller transfers).

### PR Acceptance Criteria
- [ ] Sub-package created under `apps/drop` sharing existing design tokens (`packages/shared`).
- [ ] Handles backpressure via WebSocket flow control to prevent receiver buffer overflow.
- [ ] Graceful cancellation: Closing any client socket immediately aborts the active stream.
- [ ] Automated headless integration test verifying end-to-end checksum integrity (SHA-256 match).

---

## Phase 2: `pipe` (Ephemeral Terminal Log Streamer)

### Overview
A lightweight CLI and web pairing tool allowing developers to stream stdout and stderr outputs (`tail -f`, Docker build outputs, test runs) directly to a real-time web viewer without SSH access or third-party log infrastructure.

### Data Flow & Protocol Specification
1. **CLI Ingestion:** A single-binary CLI (`zeltra pipe`) reads from `process.stdin`.
   ```bash
   tail -f /var/log/nginx/access.log | zeltra pipe
   # Outputs: Stream live at https://zeltra.tools/pipe#ROOM_ID:KEY
   ```
2. **Edge Broadcasting:** The CLI connects via WebSocket to the Worker relay (`pipe:ROOM_ID`). The Durable Object acts as a fan-out broadcaster (1 publisher -> N subscribers).
3. **Circular Ring Buffer:** The Durable Object retains an in-memory ring buffer of the last 200 lines in volatile RAM so newly connected viewers receive immediate context.
4. **Web Terminal Renderer:** The receiver web client renders incoming streams using `xterm.js` with ANSI color support, search filter, and pause/resume scroll locks.

### PR Acceptance Criteria
- [ ] Lightweight CLI implementation in `packages/cli` with zero heavy runtime dependencies.
- [ ] Web viewer interface created under `apps/pipe`.
- [ ] Support for piped input and interactive terminal resizing signals.
- [ ] Automated integration test validating line ordering and subscriber fan-out.

---

## Contributing a Module

1. Open an issue referencing the roadmap phase before submitting large architectural PRs.
2. Ensure shared cryptographic routines are imported from `@clipboard-sync/shared` (to be reorganized under `packages/crypto`).
3. Maintain zero-storage compliance: Any PR introducing persistent database writes or remote disk storage will be rejected.
4. All automated unit, typecheck, and integration tests must pass cleanly:
   ```bash
   npm run typecheck
   npm run test:integration
   npm run build
   ```
