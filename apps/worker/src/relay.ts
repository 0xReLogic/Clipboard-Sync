import { DurableObject } from 'cloudflare:workers';
import type {
  PeerMeta,
  WSClientMessage,
  WSServerMessage,
  RoomReadyMessage,
  PeerJoinedMessage,
  PeerLeftMessage,
  PeerStateRequestMessage,
  PeerStateTransferMessage,
  ClipBroadcastMessage,
  ClipDeleteMessage
} from '@clipboard-sync/shared';

export interface Env {
  CLIPBOARD_RELAYS: DurableObjectNamespace<ClipboardRelay>;
  ASSETS?: Fetcher;
}

// Security & Abuse Mitigation Constants
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB RFC 6455 limit
const MAX_PEERS_PER_ROOM = 10;              // Prevents DO socket exhaustion
const RATE_LIMIT_BURST = 10;                // Max burst messages allowed
const RATE_LIMIT_REFILL_PER_SEC = 2;        // Token refill rate per second
const MAX_VIOLATIONS = 5;                   // Violations before socket termination

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  violations: number;
}

export class ClipboardRelay extends DurableObject<Env> {
  private rateLimits = new Map<WebSocket, RateLimitBucket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Auto-respond to heartbeat pings at the edge without waking compute
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const deviceId = url.searchParams.get('deviceId');
    const deviceName = url.searchParams.get('deviceName') || 'Unknown Device';
    const os = url.searchParams.get('os') || 'Web';

    if (!deviceId) {
      return new Response('Missing deviceId parameter', { status: 400 });
    }

    // Guard: Prevent bot farms from exhausting DO memory allocation
    const currentSockets = this.ctx.getWebSockets();
    if (currentSockets.length >= MAX_PEERS_PER_ROOM) {
      return new Response('Room capacity reached (maximum 10 devices per room)', {
        status: 429,
        headers: { 'Retry-After': '30' }
      });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const meta: PeerMeta = {
      deviceId,
      deviceName,
      os,
      joinedAt: Date.now()
    };

    // Tag the WebSocket with deviceId for fast direct routing via ctx.getWebSockets(deviceId)
    this.ctx.acceptWebSocket(server, [deviceId]);
    server.serializeAttachment(meta);

    const activeSockets = this.ctx.getWebSockets();
    const otherSockets = activeSockets.filter(ws => ws !== server);

    const connectedPeers: PeerMeta[] = [];
    for (const ws of activeSockets) {
      const att = ws.deserializeAttachment() as PeerMeta | null;
      if (att) connectedPeers.push(att);
    }

    const readyPayload: RoomReadyMessage = {
      type: 'room_ready',
      deviceId,
      isInitiator: otherSockets.length === 0,
      peers: connectedPeers
    };
    server.send(JSON.stringify(readyPayload));

    // Notify other peers about the new arrival
    const joinedPayload: PeerJoinedMessage = {
      type: 'peer_joined',
      peer: meta
    };
    this.broadcastToOthers(server, JSON.stringify(joinedPayload));

    // If existing peers are present, request in-memory state transfer for late-joiner
    if (otherSockets.length > 0) {
      const hostSocket = otherSockets[0];
      const stateRequest: PeerStateRequestMessage = {
        type: 'peer_state_request',
        requesterDeviceId: deviceId
      };
      try {
        hostSocket.send(JSON.stringify(stateRequest));
      } catch {
        // Handled on close
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    // Guard 1: Pre-parse payload size guard (RFC 6455 1009)
    if (message.length > MAX_PAYLOAD_BYTES) {
      ws.close(1009, 'Message payload exceeds 5MB limit');
      this.rateLimits.delete(ws);
      return;
    }

    // Guard 2: In-memory token bucket rate limiter (RFC 6455 1008)
    const now = Date.now();
    let bucket = this.rateLimits.get(ws);
    if (!bucket) {
      bucket = { tokens: RATE_LIMIT_BURST, lastRefill: now, violations: 0 };
      this.rateLimits.set(ws, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(RATE_LIMIT_BURST, bucket.tokens + elapsedSec * RATE_LIMIT_REFILL_PER_SEC);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      bucket.violations++;
      if (bucket.violations >= MAX_VIOLATIONS) {
        ws.close(1008, 'Rate limit violation (RFC 6455)');
        this.rateLimits.delete(ws);
        return;
      }
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded. Please slow down.' }));
      return;
    }

    bucket.tokens -= 1;
    bucket.violations = 0;

    try {
      const data = JSON.parse(message) as WSClientMessage;
      const meta = ws.deserializeAttachment() as PeerMeta | null;
      const senderDeviceId = meta?.deviceId || 'unknown';

      switch (data.type) {
        case 'clip_publish': {
          const broadcastMsg: ClipBroadcastMessage = {
            type: 'clip_broadcast',
            senderDeviceId,
            payload: data.payload
          };
          this.broadcastToOthers(ws, JSON.stringify(broadcastMsg));
          break;
        }

        case 'peer_state_request': {
          const requestMsg: PeerStateRequestMessage = {
            type: 'peer_state_request',
            requesterDeviceId: senderDeviceId
          };
          this.broadcastToOthers(ws, JSON.stringify(requestMsg));
          break;
        }

        case 'peer_state_transfer': {
          const targetDeviceId = data.targetDeviceId;
          if (targetDeviceId) {
            const forwardMsg: PeerStateTransferMessage = {
              type: 'peer_state_transfer',
              fromDeviceId: senderDeviceId,
              targetDeviceId,
              roomKey: data.roomKey,
              clips: data.clips
            };
            const serialized = JSON.stringify(forwardMsg);
            for (const targetWs of this.ctx.getWebSockets()) {
              const targetMeta = targetWs.deserializeAttachment() as PeerMeta | null;
              if (targetMeta?.deviceId === targetDeviceId) {
                try {
                  targetWs.send(serialized);
                } catch {
                  // Handled on close
                }
              }
            }
          }
          break;
        }

        case 'clip_delete': {
          const deleteMsg: ClipDeleteMessage = {
            type: 'clip_delete',
            itemId: data.itemId
          };
          this.broadcastToOthers(ws, JSON.stringify(deleteMsg));
          break;
        }
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Malformed message packet' }));
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.rateLimits.delete(ws);
    const meta = ws.deserializeAttachment() as PeerMeta | null;
    if (meta) {
      const leftMsg: PeerLeftMessage = {
        type: 'peer_left',
        deviceId: meta.deviceId
      };
      this.broadcastToOthers(ws, JSON.stringify(leftMsg));
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.rateLimits.delete(ws);
    try {
      ws.close(1011, 'Relay Runtime Error');
    } catch {
      // Socket may already be closed
    }
  }

  private broadcastToOthers(senderWs: WebSocket, message: string): void {
    const senderMeta = senderWs.deserializeAttachment() as PeerMeta | null;
    const senderDeviceId = senderMeta?.deviceId;
    const sockets = this.ctx.getWebSockets();

    for (const ws of sockets) {
      const targetMeta = ws.deserializeAttachment() as PeerMeta | null;
      if (senderDeviceId && targetMeta?.deviceId === senderDeviceId) {
        continue;
      }
      try {
        ws.send(message);
      } catch {
        // Handled on close
      }
    }
  }
}
