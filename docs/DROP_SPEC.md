# Technical Specification: Module Drop (E2EE Zero-Storage File Streaming)

This specification defines the protocol, security posture, and implementation architecture for **Module Drop**—a peer-to-peer style large file streaming engine (up to 1 GB) operating over Cloudflare Workers, Durable Objects, and Web Crypto AES-GCM-256.

---

## 1. Executive Summary & Core Constraints

Module Drop expands Clipboard-Sync from ad-hoc text and screenshot sharing into a high-throughput streaming transfer system without violating the core architectural principles of the platform:

1. **Zero Server Storage:** 0 bytes written to disk, SQLite, KV, or object storage (R2/S3). Chunks exist exclusively in volatile RAM for the duration of a memory-forwarding call.
2. **Zero-Knowledge E2EE:** All file chunks are encrypted on the sender's device before entering the network. Keys reside exclusively in the URL fragment (`#key=...`) and are never transmitted in HTTP headers.
3. **Deterministic NAT Traversal:** Bypasses WebRTC P2P failures (Symmetric NAT, corporate firewalls, mobile cellular data) by routing encrypted frames through Cloudflare Anycast edge relays.
4. **Bounded Memory Footprint:** Neither the server relay (128 MB RAM ceiling) nor the client browsers (WebKit memory limits) may accumulate the full file in memory.

---

## 2. Cloudflare Edge Runtime Analysis

### 2.1 CPU Time and Invocation Limits
- **CPU Time vs. Wall Time:** Cloudflare limits Workers to 10 ms (Free) or 30 seconds (Durable Objects) of *active CPU time*. Network I/O and waiting on sockets do not count toward CPU time.
- **Per-Message Reset:** Every incoming WebSocket message resets the available CPU timer to 30 seconds.
- **Relay Processing Cost:** Forwarding a binary `ArrayBuffer` from an incoming socket to an outgoing socket (`client.send(buffer)`) takes approximately 0.015 ms of CPU time.
- **Verdict:** CPU exhaustion is mathematically impossible under standard streaming conditions.

### 2.2 Billing and Request Ratios
- **WebSocket Billing Ratio (20:1):** Cloudflare bills incoming WebSocket messages at a 20:1 ratio (20 incoming frames count as 1 billable request).
- **Outgoing WebSocket Frames:** 100% free of charge.
- **Egress Bandwidth:** $0 (Cloudflare does not bill for egress bandwidth on Workers).
- **Chunk Size Efficiency:**
  - With **64 KB chunks**, a 1 GB file requires 16,384 messages (~819 billable requests).
  - With **256 KB chunks**, a 1 GB file requires 4,096 messages (**~204 billable requests**).
  - **Standard Choice:** 256 KB chunk size optimizes both network throughput and request quota consumption by 75%.

---

## 3. Congestion Control & Backpressure Protocol

### 3.1 The Buffer Overflow Hazard
Cloudflare's underlying runtime (`workerd`) does not expose an accurate server-side `WebSocket.bufferedAmount` measurement (refer to `cloudflare/workerd` issue #988). If a sender on a 1 Gbps connection streams data to a receiver on a 5 Mbps connection, unconsumed frames will queue in the Durable Object's memory, eventually triggering an Out-of-Memory (OOM) crash at 128 MB.

### 3.2 Application-Level Sliding Window (Client-to-Client ACK)
To prevent server memory exhaustion, Module Drop enforces an end-to-end sliding window protocol:

1. **Window Size ($W$):** The sender is permitted to transmit a maximum of 16 unacknowledged chunks (4 MB in-flight window).
2. **Acknowledgment Packet (`drop_ack`):** Upon receiving and writing each chunk to disk or memory, the receiver sends a lightweight JSON packet:
   ```json
   {
     "type": "drop_ack",
     "transferId": "4a7b9c1d",
     "chunkIndex": 42
   }
   ```
3. **Sender Throttling:** If the difference between the latest sent chunk and the highest acknowledged chunk exceeds $W$ ($\text{SentIndex} - \text{AckIndex} \ge 16$), the sender pauses reading from disk until the next `drop_ack` arrives.
4. **Guaranteed Invariant:** At any single millisecond, at most 4 MB of unconsumed file data can exist across the entire Cloudflare Durable Object memory and network pipeline.

---

## 4. Client-Side Storage Architecture

### 4.1 The WebKit/Mobile RAM Problem
Constructing an in-memory `Blob` from an array of chunks requires holding the entire file in RAM. On mobile devices (iOS Safari, Android Chrome), tabs are forcefully killed by the OS when memory pressure reaches 1.0 GB to 1.5 GB.

### 4.2 Dual-Path Receiver Pipeline

```text
                        [ Incoming Decrypted 256 KB Chunk ]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       Path A: Direct-to-Disk Stream               Path B: In-Memory Buffer
   (Chrome, Edge, Opera, Desktop Safari)           (Mobile Safari, Fallback)
                   │                                           │
         FileSystemAccess API                         Memory ArrayBuffer Buffer
    `showSaveFilePicker()` Handle                              │
    `writable.write(chunk)`                                    ▼
                   │                                Safe Limit Check (< 200 MB)
                   ▼                                           │
         RAM Usage: < 15 MB Constant                           ▼
         Maximum File Size: Unlimited                 Trigger Download on Complete
```

#### Path A: File System Access API (Recommended)
- Initiated upon receiver accepting the transfer:
  ```typescript
  const handle = await window.showSaveFilePicker({
    suggestedName: offer.fileName
  });
  const writable = await handle.createWritable();
  ```
- Each decrypted chunk is piped directly to the local filesystem: `await writable.write(decryptedData)`.
- When all chunks finish, the stream closes: `await writable.close()`.
- Memory consumption remains flat at **< 15 MB** regardless of file size.

#### Path B: In-Memory Blob Fallback
- For browsers lacking `showSaveFilePicker`:
- Enforces a client-side warning if `fileSize > 200 MB`.
- Chunks accumulate in an array of `ArrayBuffer` slices.
- Triggers browser download via `URL.createObjectURL(new Blob(chunks))` upon transfer completion.

---

## 5. Cryptography Specification

### 5.1 Cipher and Parameter Standards
- **Algorithm:** AES-GCM-256 (`window.crypto.subtle`).
- **Key Derivation / Location:** AES-GCM 256-bit symmetric key extracted from the URL fragment hash (`#key=...`).
- **Integrity Tag:** 128-bit authentication tag appended to each chunk by default in AES-GCM.
- **End-to-End Checksum:** SHA-256 computed progressively over the original unencrypted file stream.

### 5.2 Nonce Reuse Prevention
Reusing an Initialization Vector (IV) with the same key in AES-GCM completely compromises ciphertext authenticity. 
- For every 256 KB chunk, the sender generates a **fresh, cryptographically random 12-byte IV**:
  ```typescript
  const chunkIv = crypto.getRandomValues(new Uint8Array(12));
  ```
- The 12-byte IV is embedded directly into the binary frame header of that specific chunk.

---

## 6. Binary Frame Protocol

To eliminate Base64 expansion overhead (~33%) and avoid server-side JSON parsing, all chunk data is transmitted as raw WebSocket binary frames (`ArrayBuffer`).

### 6.1 Binary Frame Layout (24-Byte Header)

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Magic Bytes: 0x44524F50 ("DROP")              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Transfer ID Hash (4 Bytes)                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Chunk Index uint32 (4 Bytes)                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
+                    Initialization Vector (IV)                 +
|                            (12 Bytes)                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|        Encrypted Ciphertext Payload (Up to 256 KB)            |
|               + 16 Bytes AES-GCM Auth Tag                     |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

---

## 7. Control Signaling Protocol

Control signaling operates over JSON-encoded text frames routed through the standard Durable Object WebSocket relay:

### 7.1 `drop_offer`
Sent by the file owner to initiate transfer negotiation:
```typescript
interface DropOfferMessage {
  type: 'drop_offer';
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  chunkSize: number;
  senderDeviceId: string;
  senderName: string;
}
```

### 7.2 `drop_accept`
Sent by the recipient indicating readiness to receive chunks:
```typescript
interface DropAcceptMessage {
  type: 'drop_accept';
  transferId: string;
  receiverDeviceId: string;
}
```

### 7.3 `drop_reject`
Sent if the recipient declines or lacks storage:
```typescript
interface DropRejectMessage {
  type: 'drop_reject';
  transferId: string;
  receiverDeviceId: string;
  reason?: string;
}
```

### 7.4 `drop_ack`
Sent by recipient to advance the sender's sliding window:
```typescript
interface DropAckMessage {
  type: 'drop_ack';
  transferId: string;
  chunkIndex: number;
}
```

### 7.5 `drop_complete`
Sent by sender upon transmitting all chunks, including the final file checksum:
```typescript
interface DropCompleteMessage {
  type: 'drop_complete';
  transferId: string;
  checksumSha256: string;
}
```

### 7.6 `drop_cancel`
Sent by either party to abort the transfer immediately:
```typescript
interface DropCancelMessage {
  type: 'drop_cancel';
  transferId: string;
  reason?: string;
}
```

---

## 8. Server-Side Relay Implementation Rules

Inside `apps/worker/src/relay.ts`:

1. **Binary Passthrough Route:**
   ```typescript
   if (message instanceof ArrayBuffer) {
     // Validate minimum frame header length
     if (message.byteLength < 24) return;
     
     // Blind broadcast to active peers in the room
     const sockets = this.ctx.getWebSockets();
     for (const peer of sockets) {
       if (peer !== ws && peer.readyState === WebSocket.OPEN) {
         peer.send(message);
       }
     }
     return;
   }
   ```
2. **Zero In-Memory Buffering:** Durable Objects must not save, inspect, or log binary frames.
3. **Session Teardown on Disconnect:** If any peer disconnects while a transfer is in progress, the Durable Object broadcasts a `drop_cancel` message to all remaining peers to terminate open file handles.

---

## 9. Abuse Mitigation, Rate Limiting & Infrastructure Defense

To protect both user sessions and the Cloudflare Free Tier hosting infrastructure from Denial-of-Wallet (DoW) attacks, botnet tunneling, and resource exhaustion, Module Drop enforces a 5-layer defensive posture.

### 9.1 Threat Vectors Addressed
1. **Denial-of-Wallet (Quota Draining):** Automated bots creating thousands of ephemeral rooms and flooding frames to deplete Cloudflare's daily 100,000 request limit and monthly 400,000 GB-s duration quota.
2. **Buffer Flooding & OOM:** Attackers ignoring the sliding window and blasting unthrottled gigabytes to trigger 128 MB V8 isolate crashes.
3. **Open Anonymous Proxy Tunneling:** External entities utilizing the edge WebSocket relay as a free, untraceable binary conduit for unauthorized data transit.
4. **Room Poisoning:** Unauthorized third parties guessing a 6-character room code and hijacking the active transfer.

### 9.2 Layer 1: Edge Gateway IP Throttling (`apps/worker/src/index.ts`)
- Evaluates `request.headers.get('CF-Connecting-IP')`.
- Enforces an in-memory rate limit of **maximum 5 room creations per minute per IP**.
- Restricts concurrent WebSocket connections from a single IP to **maximum 10 active connections**. Exceeding requests are rejected with `HTTP 429 Too Many Requests`.

### 9.3 Layer 2: Asymmetric Role Enforcement & Publisher Token
Unlike generic clipboard rooms where all connected peers share symmetrical publish/subscribe permissions, `drop` enforces strict role segregation:
- **Room Initiator (Sender):** Generates a 16-byte random hex `publisherToken` upon room generation.
- **Connection Handshake:**
  - Sender: `/ws?tool=drop&room=ROOM_ID&role=sender&token=PUBLISHER_TOKEN`
  - Receiver: `/ws?tool=drop&room=ROOM_ID&role=receiver`
- **Enforcement in DO:** Only the verified socket possessing `PUBLISHER_TOKEN` is permitted to emit `drop_offer` and binary chunks. If a receiver socket attempts to transmit binary frames, the Durable Object terminates the connection immediately with RFC 6455 `1008 Policy Violation`.

### 9.4 Layer 3: Bandwidth & Throughput Token Bucket
The Durable Object maintains a byte-level rate limiter on the sender socket:
- **Burst Allowance:** 16 MB.
- **Sustained Throughput Ceiling:** **8 MB/second** (64 Mbps).
- If the sender transmits faster than 8 MB/s over a sustained 3-second window, the DO suspends socket reads until the token bucket refills. Continued flooding results in immediate socket termination with RFC 6455 `1008 Policy Violation`.

### 9.5 Layer 4: Strict Room Concurrency Cap (Max 2 Devices)
A file transfer session is strictly point-to-point:
- A `drop` room permits **exactly 1 Sender and 1 Receiver** (maximum 2 WebSocket connections).
- Any 3rd connection attempt is immediately rejected at the Worker gateway with `HTTP 409 Conflict` (`Room transfer in progress with 2 devices`). This eliminates the ability to abuse the room as a one-to-many mass distribution relay.

### 9.6 Layer 5: Hard Session TTL & Inactivity Alarms
To guarantee zero zombie isolates in Cloudflare memory:
- **Transfer Window Cap:** Durable Object sets an internal alarm for **30 minutes** from session start. Transfers exceeding 30 minutes are terminated (`drop_cancel`) to prevent indefinite socket pinning.
- **Inactivity Timeout:** If both peers are connected but zero chunks or heartbeats flow for **2 minutes**, the room self-destructs.
