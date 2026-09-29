# Technical Specification: Module Pipe (Ephemeral Zero-Knowledge Terminal Log Streamer)

This specification defines the protocol, security posture, cost analysis, and implementation architecture for **Module Pipe**—a secure, real-time terminal output streaming utility connecting CLI environments (`tail -f`, build outputs, test runs) directly to web viewers (`xterm.js`) over Cloudflare Workers, Durable Objects, and Web Crypto AES-GCM-256.

---

## 1. Executive Summary & Core Guarantees

Module Pipe provides developer teams with instantaneous, zero-friction visibility into server terminal processes without requiring SSH credentials, VPN tunneling, or centralized log ingestion pipelines (such as Datadog or Logflare):

1. **Zero Configuration:** Terminal operators pipe stdout directly into the CLI tool:
   ```bash
   tail -f /var/log/nginx/error.log | npx @zeltra/pipe
   # Generated: https://zeltra.tools/pipe#ROOM_ID:KEY
   ```
2. **Zero Server Storage:** 0 bytes stored on disk or persistent databases. Terminal chunks exist exclusively in the volatile RAM of the Cloudflare Durable Object relay for active session broadcasting and scrollback caching.
3. **Zero-Knowledge E2EE:** Terminal streams frequently leak database passwords, API secrets, SQL queries, and internal IP addresses. All text lines are encrypted client-side by the CLI before transmission. Cloudflare relays only opaque ciphertext.
4. **$0.00 Operating Cost:** Designed around Cloudflare Free Tier constraints via a strict internal 50ms batching engine and WebSocket Hibernation.

---

## 2. Cloudflare Cost & Runtime Feasibility Analysis

### 2.1 The High-Frequency Context Switch Hazard
Sending WebSocket messages line-by-line during high-velocity logging (e.g., 1,000 lines per second) introduces excessive context switches between the Cloudflare JavaScript runtime and the underlying OS kernel, exhausting the single-threaded event loop of the Durable Object.

### 2.2 Internal 50ms Client-Side Batching Rule
The CLI engine aggregates standard input stream chunks using a dual-trigger buffer:
- **Time Trigger:** Flushes buffered lines every **50 ms** (maximum 20 frames per second).
- **Size Trigger:** Flushes immediately if the accumulated buffer reaches **16 KB**.

At 50 ms intervals:
- Throughput appears instantaneous to the human eye (20 FPS).
- Even during extreme log spikes (10,000 lines/second), the CLI will **never emit more than 20 WebSocket messages per second** to the Cloudflare relay.

### 2.3 Mathematical Billing Model (1 Hour Intensive Streaming)
- **Total Incoming WebSocket Messages:**  
  $$20\text{ frames/sec} \times 3,600\text{ sec} = 72,000\text{ messages}$$
- **Billable Requests (Cloudflare 20:1 Ratio):**  
  $$\frac{72,000}{20} = 3,600\text{ billable requests}$$
- **Compute Duration (GB-Seconds at 128 MB RAM):**  
  $$3,600\text{ sec} \times 0.128\text{ GB} = 460.8\text{ GB-seconds}$$

### 2.4 Cloudflare Quota Summary (Free vs Paid)

| Metric | Free Tier Allowance | Consumption (1 Hour Stream) | Monthly Capacity |
| :--- | :--- | :--- | :--- |
| **Worker Invocations** | 100,000 / day | 3,600 requests | ~27 hours active streaming / day |
| **DO Compute Duration** | 400,000 GB-s / month | 460.8 GB-s | **~868 hours active streaming / month** |
| **Egress Bandwidth** | Unlimited ($0) | ~50 MB text data | **$0.00** |

---

## 3. Cryptography & Threat Model

### 3.1 Key Lifecycle
1. When launched, the CLI generates a 256-bit cryptographic symmetric key using `crypto.getRandomValues()`:
   ```typescript
   const rawKey = crypto.getRandomValues(new Uint8Array(32));
   const hexKey = Array.from(rawKey).map(b => b.toString(16).padStart(2, '0')).join('');
   ```
2. The key is appended strictly to the URL fragment hash:
   `https://zeltra.tools/pipe#ROOM_ID:HEX_KEY`
3. Per RFC 3986, fragment identifiers are processed exclusively by the browser and are never transmitted in HTTP headers (`Referer`, `Host`).

### 3.2 Per-Batch AES-GCM-256 Authentication
- **Algorithm:** AES-GCM-256.
- **Nonce Policy:** A fresh, cryptographically random 12-byte IV is generated for every single 50ms batch:
  ```typescript
  const iv = crypto.getRandomValues(new Uint8Array(12));
  ```
- **Integrity Tag:** 128-bit authentication tag appended to each encrypted batch to guarantee tamper-proof log rendering.

---

## 4. End-to-End System Architecture

```text
[ Terminal Process ]
│ (tail -f, docker logs)
▼
[ CLI Engine: @zeltra/pipe ]
├─ 1. Reads process.stdin (Binary / UTF-8)
├─ 2. 50ms / 16KB Aggregation Buffer
├─ 3. Web Crypto AES-GCM-256 Encryption
└─ 4. Emits JSON WebSocket Frame (pipe_batch)
       │
       ▼ (WSS Encrypted)
[ Cloudflare Edge Gateway ]
│ Route: wss://zeltra.tools/ws?tool=pipe&room=ROOM_ID
▼
[ Durable Object: pipe:ROOM_ID ]
├─ 1. Fan-out broadcaster (1 Publisher -> N Subscribers)
├─ 2. Volatile RAM Ring Buffer (Last 500 batches / ~1,000 lines)
├─ 3. Immediate context replay for late-joining viewers
└─ 4. Inactivity Alarm (Self-destructs 15 mins after all sockets close)
       │
       ▼ (WSS Blind Relay)
[ Web Client: xterm.js ]
├─ 1. Extracts AES-GCM key from URL fragment
├─ 2. Decrypts incoming batches on the fly
├─ 3. term.write() with full ANSI color support
├─ 4. Intelligent Auto-scroll (pauses when user scrolls up)
└─ 5. Regex search & Log file export (.log)
```

---

## 5. Late-Joiner Scrollback Protocol

When a developer joins a stream 10 minutes after it began, they must receive recent context without waiting for new log lines.

### 5.1 In-Memory Circular Buffer (RAM Only)
- The Durable Object maintains a bounded array:
  ```typescript
  private ringBuffer: PipeBatchMessage[] = [];
  private readonly MAX_RING_BUFFER = 500; // ~1,000 to 2,500 terminal lines
  ```
- When a new viewer WebSocket joins the room:
  1. DO transmits a `pipe_init` packet indicating current terminal dimensions.
  2. DO flushes the entire `ringBuffer` array sequentially to that specific viewer socket.
  3. The viewer browser decrypts the backlog and populates the terminal screen instantaneously.

### 5.2 Memory Bounding
At 500 batches with an average size of 1 KB per batch, the ring buffer consumes less than **1 MB of RAM** inside the Durable Object isolate, well below the 128 MB threshold.

---

## 6. Control Signaling & Wire Protocol

All control and streaming messages are routed as JSON-encoded frames:

### 6.1 `pipe_init` (Publisher -> Relay -> Subscribers)
Broadcast when the CLI starts:
```typescript
interface PipeInitMessage {
  type: 'pipe_init';
  sessionId: string;
  command?: string;
  cols: number;
  rows: number;
  createdAt: number;
}
```

### 6.2 `pipe_batch` (Publisher -> Relay -> Subscribers)
Emitted by CLI every 50 ms when new stdout/stderr data exists:
```typescript
interface PipeBatchMessage {
  type: 'pipe_batch';
  sequence: number;     // Monotonically increasing counter
  iv: string;           // Base64 encoded 12-byte IV
  ciphertext: string;   // Base64 encoded AES-GCM ciphertext
  timestamp: number;
}
```

### 6.3 `pipe_resize` (Publisher -> Relay -> Subscribers)
Emitted when the local terminal window dimensions change (`SIGWINCH`):
```typescript
interface PipeResizeMessage {
  type: 'pipe_resize';
  cols: number;
  rows: number;
}
```

### 6.4 `pipe_eof` (Publisher -> Relay -> Subscribers)
Emitted when the piped command finishes execution:
```typescript
interface PipeEofMessage {
  type: 'pipe_eof';
  exitCode: number;
  durationMs: number;
}
```

---

## 7. Web Client UI / UX Specifications (`xterm.js`)

The web viewer at `/pipe#ROOM_ID:KEY` incorporates the following features:

1. **Engine:** `@xterm/xterm` with `@xterm/addon-fit` for responsive resizing and `@xterm/addon-webgl` for GPU-accelerated rendering.
2. **Styling:** LamarKita Obsidian dark theme (`#0b0e0c` canvas, `#141916` elevated surfaces, `#1ed760` accents).
3. **Smart Autoscroll:** 
   - Scrolls to bottom automatically when new logs arrive.
   - If the user scrolls upward to inspect history, autoscroll pauses automatically and displays a floating pill: `New logs paused. Click to jump to bottom`.
4. **Search Bar:** Real-time search with case sensitivity and regex matching highlighting matching terms in yellow.
5. **Log Exporter:** Single-click "Export Log" button that formats all received scrollback and triggers a direct browser download (`session-TIMESTAMP.log`).
6. **Session Termination Banner:** When `pipe_eof` arrives, displays:
   `[zeltra pipe] Process terminated with exit code 0. Stream ended.`

---

## 8. Abuse Mitigation, Rate Limiting & Infrastructure Defense

Terminal log streams are high-risk targets for both privacy exposure and infrastructure exhaustion. Module Pipe implements strict perimeter and in-room defenses to safeguard the Cloudflare Free Tier resources and protect terminal integrity.

### 8.1 Threat Vectors Addressed
1. **Terminal Hijacking & Log Poisoning:** Rogue entities guessing room IDs and injecting forged terminal frames or deceptive commands into viewers' active screens.
2. **Denial-of-Wallet & Ingress Flooding:** Rogue CLI clients disabling the 50ms batch buffer to bombard the Durable Object with unthrottled line-by-line frames (e.g. 5,000 req/sec).
3. **Zombie Streams:** Background CI/CD or server scripts piping output and remaining open indefinitely, exhausting Durable Object compute duration.
4. **Viewer Concurrency Exhaustion:** Publicly shared log links attracting hundreds of viewers, exhausting DO socket memory.

### 8.2 Layer 1: Edge Gateway IP Throttling (`apps/worker/src/index.ts`)
- Evaluates `request.headers.get('CF-Connecting-IP')`.
- Enforces an in-memory limit of **maximum 5 pipe room creations per minute per IP**.
- Limits concurrent connections from a single IP to **maximum 10 active sockets**.

### 8.3 Layer 2: Single-Publisher Lock & Token Enforcement
Unlike bi-directional chat rooms, `pipe` is strictly **one-to-many (1 Publisher -> N Viewers)**:
- **Connection Handshake:**
  - CLI Publisher: `/ws?tool=pipe&room=ROOM_ID&role=pub&token=PUBLISHER_TOKEN`
  - Web Viewer: `/ws?tool=pipe&room=ROOM_ID&role=sub`
- **Single Publisher Constraint:** A room allows **strictly ONE active publisher socket**. If a second client attempts to connect with `role=pub`, the Worker immediately rejects with `HTTP 409 Conflict`.
- **Read-Only Viewer Enforcement:** Web viewer sockets are strictly read-only. If a viewer sends any message (text or binary) other than protocol ping, the Durable Object closes the socket immediately with RFC 6455 `1008 Policy Violation`.

### 8.4 Layer 3: Throughput & Frame Rate Token Bucket
To ensure malicious modified CLIs cannot flood the relay:
- **Message Frequency Cap:** Maximum **25 frames/second** (standard CLI emits at 20 frames/s).
- **Frame Size Cap:** Maximum **64 KB per individual batch frame**. Frames exceeding 64 KB are rejected with RFC 6455 `1009 Message Too Big`.
- **Bandwidth Ceiling:** Maximum **256 KB/second** sustained throughput per pipe room. Continued violations trigger socket termination with RFC 6455 `1008 Policy Violation`.

### 8.5 Layer 4: Viewer Concurrency Cap (Max 1 Publisher + 5 Viewers)
- Pipe sessions are designed for focused team debugging, not mass public webcasts.
- The Durable Object caps room occupancy at **1 Publisher + 5 Viewers (6 total sockets)**.
- The 7th connection attempt receives `HTTP 429 Too Many Requests`.

### 8.6 Layer 5: Hard Session TTL & Zombie Cleanup
- **3-Hour Maximum Runtime:** Durable Object schedules a hard alarm for **3 hours** upon room creation. When triggered, the DO emits a `pipe_eof` with code `124` (Timeout), closes all sockets, and self-destructs.
- **Publisher Disconnect Timeout:** When the CLI disconnects (`EOF` or network drop), viewers may continue reading the 500-batch scrollback buffer for up to **15 minutes**. After 15 minutes of publisher inactivity, the room destroys its in-memory buffer.

---

## 9. Implementation Milestones

- [ ] **Milestone 1:** Add `PipeInitMessage`, `PipeBatchMessage`, `PipeResizeMessage`, and `PipeEofMessage` to `packages/shared/src/index.ts`.
- [ ] **Milestone 2:** Implement `pipe` room prefix routing, single-publisher lock, and in-memory ring buffer inside `apps/worker/src/relay.ts`.
- [ ] **Milestone 3:** Create CLI binary package in `packages/cli` with standard input reader, 50ms batch buffer, and Web Crypto AES-GCM encryption.
- [ ] **Milestone 4:** Build the web terminal viewer component in `apps/web/src/components/PipeViewer.tsx` powered by `xterm.js`.
- [ ] **Milestone 5:** Add automated integration tests in `test-integration.mjs` verifying publisher batching, late-joiner scrollback replay, rate limit enforcement, and EOF signaling.
