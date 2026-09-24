import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type {
  PeerMeta,
  ContentType,
  InMemoryClip,
  ClipItemPayload,
  WSServerMessage,
  ClipPublishMessage,
  PeerStateTransferMessage,
  ClipDeleteMessage
} from '@clipboard-sync/shared';
import { EphemeralCrypto } from '../lib/crypto';
import { MemoryRingBuffer } from '../lib/ringBuffer';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface ClipboardContextValue {
  roomId: string;
  cryptoKey: string;
  status: ConnectionStatus;
  deviceId: string;
  peers: PeerMeta[];
  clips: InMemoryClip[];
  publishClip: (
    content: string,
    contentType?: ContentType,
    meta?: InMemoryClip['previewMeta']
  ) => Promise<void>;
  togglePin: (itemId: string) => void;
  deleteClip: (itemId: string) => void;
  leaveRoom: () => void;
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null);

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  return 'Linux';
}

function detectDeviceName(): string {
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua)) return 'MacBook';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android Device';
  return 'Desktop Client';
}

interface ProviderProps {
  roomId: string;
  initialKey?: string;
  onLeave: () => void;
  children: React.ReactNode;
}

export const ClipboardProvider: React.FC<ProviderProps> = ({
  roomId,
  initialKey,
  onLeave,
  children
}) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [peers, setPeers] = useState<PeerMeta[]>([]);
  const [clips, setClips] = useState<InMemoryClip[]>([]);
  const [cryptoKey, setCryptoKey] = useState<string>(initialKey || '');

  const deviceIdRef = useRef<string>(crypto.randomUUID());
  const cryptoRef = useRef<EphemeralCrypto>(new EphemeralCrypto());
  const cryptoKeyRef = useRef<string>(initialKey || '');
  const ringBufferRef = useRef<MemoryRingBuffer>(new MemoryRingBuffer());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);

  // Initialize crypto key from URL hash or generate fresh key
  useEffect(() => {
    let active = true;
    async function setupCrypto() {
      try {
        const resolvedKey = await cryptoRef.current.initKey(initialKey);
        if (active) {
          setCryptoKey(resolvedKey);
          cryptoKeyRef.current = resolvedKey;
          // Persist key strictly in URL fragment hash so server never sees it
          window.location.hash = `room=${roomId}&key=${resolvedKey}`;
        }
      } catch (err) {
        console.error('Failed to initialize cryptographic key:', err);
      }
    }
    setupCrypto();
    return () => {
      active = false;
    };
  }, [roomId, initialKey]);

  // Handle incoming server messages
  const handleServerMessage = useCallback(async (msg: WSServerMessage) => {
    switch (msg.type) {
      case 'room_ready': {
        // Deduplicate peers by deviceId to prevent React duplicate key warnings
        const peerMap = new Map<string, PeerMeta>();
        for (const p of msg.peers) {
          peerMap.set(p.deviceId, p);
        }
        setPeers(Array.from(peerMap.values()));
        break;
      }

      case 'peer_joined': {
        setPeers(prev => {
          const peerMap = new Map<string, PeerMeta>();
          for (const p of prev) {
            peerMap.set(p.deviceId, p);
          }
          peerMap.set(msg.peer.deviceId, msg.peer);
          return Array.from(peerMap.values());
        });
        break;
      }

      case 'peer_left': {
        setPeers(prev => prev.filter(p => p.deviceId !== msg.deviceId));
        break;
      }

      case 'peer_state_request': {
        // Active peer receives request to transfer in-memory clips and session key to newly joined device
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const currentClips = ringBufferRef.current.getAll();
          const payloadList: ClipItemPayload[] = [];
          for (const clip of currentClips) {
            try {
              const enc = await cryptoRef.current.encrypt(clip.decryptedContent);
              payloadList.push({
                itemId: clip.itemId,
                contentType: clip.contentType,
                iv: enc.iv,
                ciphertext: enc.ciphertext,
                previewMeta: clip.previewMeta,
                createdAt: clip.createdAt,
                senderName: clip.senderName,
                senderOs: clip.senderOs,
                isPinned: clip.isPinned
              });
            } catch (err) {
              console.warn('Failed to encrypt clip for state transfer:', err);
            }
          }

          const transferMsg: PeerStateTransferMessage = {
            type: 'peer_state_transfer',
            targetDeviceId: msg.requesterDeviceId,
            roomKey: cryptoKeyRef.current,
            clips: payloadList
          };
          wsRef.current.send(JSON.stringify(transferMsg));
        }
        break;
      }

      case 'peer_state_transfer': {
        // Late-joiner receives initial state & session key from active peer
        if (msg.roomKey && msg.roomKey !== cryptoKeyRef.current) {
          try {
            await cryptoRef.current.initKey(msg.roomKey);
            setCryptoKey(msg.roomKey);
            cryptoKeyRef.current = msg.roomKey;
            window.location.hash = `room=${roomId}&key=${msg.roomKey}`;
          } catch (err) {
            console.error('Failed to adopt host encryption key:', err);
          }
        }

        if (msg.clips && msg.clips.length > 0) {
          for (const clipPayload of msg.clips) {
            try {
              const decrypted = await cryptoRef.current.decrypt({
                iv: clipPayload.iv,
                ciphertext: clipPayload.ciphertext
              });

              let previewUrl: string | undefined;
              if (clipPayload.contentType === 'image/png') {
                previewUrl = decrypted;
              }

              const inMemory: InMemoryClip = {
                itemId: clipPayload.itemId,
                contentType: clipPayload.contentType,
                decryptedContent: decrypted,
                previewUrl,
                previewMeta: clipPayload.previewMeta,
                senderDeviceId: msg.fromDeviceId || 'peer',
                senderName: clipPayload.senderName,
                senderOs: clipPayload.senderOs,
                createdAt: clipPayload.createdAt,
                isPinned: !!clipPayload.isPinned
              };

              const updated = ringBufferRef.current.push(inMemory);
              setClips(updated);
            } catch (err) {
              console.warn('Failed to decrypt clip in state transfer:', err);
            }
          }
        }
        break;
      }

      case 'clip_broadcast': {
        try {
          const payload = msg.payload;
          const decrypted = await cryptoRef.current.decrypt({
            iv: payload.iv,
            ciphertext: payload.ciphertext
          });

          let previewUrl: string | undefined;
          if (payload.contentType === 'image/png') {
            previewUrl = decrypted;
          }

          const inMemory: InMemoryClip = {
            itemId: payload.itemId,
            contentType: payload.contentType,
            decryptedContent: decrypted,
            previewUrl,
            previewMeta: payload.previewMeta,
            senderDeviceId: msg.senderDeviceId,
            senderName: payload.senderName,
            senderOs: payload.senderOs,
            createdAt: payload.createdAt,
            isPinned: false
          };

          const updated = ringBufferRef.current.push(inMemory);
          setClips(updated);
        } catch (err) {
          console.warn('Failed to decrypt broadcast clip (key mismatch). Requesting key re-sync:', err);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'peer_state_request',
              requesterDeviceId: deviceIdRef.current
            }));
          }
        }
        break;
      }

      case 'clip_delete': {
        const updated = ringBufferRef.current.delete(msg.itemId);
        setClips(updated);
        break;
      }
    }
  }, [roomId]);

  // WebSocket Connection Management with Exponential Backoff
  const connect = useCallback(() => {
    if (!roomId) return;

    setStatus(reconnectAttemptRef.current === 0 ? 'connecting' : 'reconnecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const deviceName = encodeURIComponent(detectDeviceName());
    const os = encodeURIComponent(detectOS());
    const wsUrl = `${protocol}//${host}/ws?room=${roomId}&deviceId=${deviceIdRef.current}&deviceName=${deviceName}&os=${os}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;
      // Proactively request key & in-memory state from existing room host
      if (!initialKey) {
        try {
          ws.send(JSON.stringify({
            type: 'peer_state_request',
            requesterDeviceId: deviceIdRef.current
          }));
        } catch {
          // Socket error handled in onerror
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSServerMessage;
        handleServerMessage(data);
      } catch {
        // Malformed frame
      }
    };

    ws.onclose = () => {
      setStatus('reconnecting');
      // Exponential backoff with jitter up to max 10 seconds
      const timeout = Math.min(
        10000,
        1000 * Math.pow(1.5, reconnectAttemptRef.current) + Math.random() * 500
      );
      reconnectAttemptRef.current += 1;
      reconnectTimeoutRef.current = window.setTimeout(connect, timeout);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [roomId, handleServerMessage]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
      ringBufferRef.current.clear();
    };
  }, [connect]);

  // Publish new clip to room
  const publishClip = useCallback(async (
    content: string,
    contentType: ContentType = 'text/plain',
    meta?: InMemoryClip['previewMeta']
  ) => {
    if (!content.trim()) return;

    const itemId = crypto.randomUUID();
    const now = Date.now();
    const encrypted = await cryptoRef.current.encrypt(content);

    let previewUrl: string | undefined;
    if (contentType === 'image/png') {
      previewUrl = content;
    }

    const localClip: InMemoryClip = {
      itemId,
      contentType,
      decryptedContent: content,
      previewUrl,
      previewMeta: {
        charCount: content.length,
        lineCount: content.split('\n').length,
        ...meta
      },
      senderDeviceId: deviceIdRef.current,
      senderName: detectDeviceName(),
      senderOs: detectOS(),
      createdAt: now,
      isPinned: false
    };

    // Store in local RAM ring buffer immediately
    const updated = ringBufferRef.current.push(localClip);
    setClips(updated);

    // Relay to connected peers via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const publishMsg: ClipPublishMessage = {
        type: 'clip_publish',
        payload: {
          itemId,
          contentType,
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          previewMeta: localClip.previewMeta,
          createdAt: now,
          senderName: localClip.senderName,
          senderOs: localClip.senderOs,
          isPinned: false
        }
      };
      wsRef.current.send(JSON.stringify(publishMsg));
    }
  }, []);

  const togglePin = useCallback((itemId: string) => {
    const updated = ringBufferRef.current.togglePin(itemId);
    setClips(updated);
  }, []);

  const deleteClip = useCallback((itemId: string) => {
    const updated = ringBufferRef.current.delete(itemId);
    setClips(updated);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const deleteMsg: ClipDeleteMessage = {
        type: 'clip_delete',
        itemId
      };
      wsRef.current.send(JSON.stringify(deleteMsg));
    }
  }, []);

  const leaveRoom = useCallback(() => {
    window.location.hash = '';
    onLeave();
  }, [onLeave]);

  return (
    <ClipboardContext.Provider
      value={{
        roomId,
        cryptoKey,
        status,
        deviceId: deviceIdRef.current,
        peers,
        clips,
        publishClip,
        togglePin,
        deleteClip,
        leaveRoom
      }}
    >
      {children}
    </ClipboardContext.Provider>
  );
};

export function useClipboard(): ClipboardContextValue {
  const ctx = useContext(ClipboardContext);
  if (!ctx) {
    throw new Error('useClipboard must be used within ClipboardProvider');
  }
  return ctx;
}
