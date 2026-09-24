export type ContentType = 'text/plain' | 'text/markdown' | 'image/png' | 'application/octet-stream';

export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

export interface PeerMeta {
  deviceId: string;
  deviceName: string;
  os: string;
  joinedAt: number;
}

export interface PreviewMeta {
  charCount?: number;
  lineCount?: number;
  byteSize?: number;
  imageWidth?: number;
  imageHeight?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface ClipItemPayload {
  itemId: string;
  contentType: ContentType;
  iv: string;
  ciphertext: string;
  previewMeta?: PreviewMeta;
  createdAt: number;
  senderName: string;
  senderOs: string;
  isPinned?: boolean;
}

export interface InMemoryClip {
  itemId: string;
  contentType: ContentType;
  decryptedContent: string;
  previewUrl?: string;
  previewMeta?: PreviewMeta;
  senderDeviceId: string;
  senderName: string;
  senderOs: string;
  createdAt: number;
  isPinned: boolean;
}

export interface RoomReadyMessage {
  type: 'room_ready';
  deviceId: string;
  isInitiator: boolean;
  peers: PeerMeta[];
}

export interface PeerJoinedMessage {
  type: 'peer_joined';
  peer: PeerMeta;
}

export interface PeerLeftMessage {
  type: 'peer_left';
  deviceId: string;
}

export interface PeerStateRequestMessage {
  type: 'peer_state_request';
  requesterDeviceId: string;
}

export interface PeerStateTransferMessage {
  type: 'peer_state_transfer';
  targetDeviceId?: string;
  fromDeviceId?: string;
  roomKey?: string;
  clips: ClipItemPayload[];
}

export interface ClipPublishMessage {
  type: 'clip_publish';
  payload: ClipItemPayload;
}

export interface ClipBroadcastMessage {
  type: 'clip_broadcast';
  senderDeviceId: string;
  payload: ClipItemPayload;
}

export interface ClipDeleteMessage {
  type: 'clip_delete';
  itemId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type WSClientMessage =
  | ClipPublishMessage
  | PeerStateRequestMessage
  | PeerStateTransferMessage
  | ClipDeleteMessage;

export type WSServerMessage =
  | RoomReadyMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | PeerStateRequestMessage
  | PeerStateTransferMessage
  | ClipBroadcastMessage
  | ClipDeleteMessage
  | ErrorMessage;
