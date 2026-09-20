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
}

export class ClipboardRelay extends DurableObject<Env> {
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

        case 'peer_state_transfer': {
          const targetDeviceId = data.targetDeviceId;
          if (targetDeviceId) {
            const targets = this.ctx.getWebSockets(targetDeviceId);
            const forwardMsg: PeerStateTransferMessage = {
              type: 'peer_state_transfer',
              fromDeviceId: senderDeviceId,
              targetDeviceId,
              clips: data.clips
            };
            const serialized = JSON.stringify(forwardMsg);
            for (const targetWs of targets) {
              try {
                targetWs.send(serialized);
              } catch {
                // Handled on close
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
    try {
      ws.close(1011, 'Relay Runtime Error');
    } catch {
      // Socket may already be closed
    }
  }

  private broadcastToOthers(senderWs: WebSocket, message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== senderWs) {
        try {
          ws.send(message);
        } catch {
          // Handled on close
        }
      }
    }
  }
}
