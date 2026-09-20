import React, { useState } from 'react';

interface JoinProps {
  onJoin: (roomId: string, key?: string) => void;
  onOpenDocs?: () => void;
}

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateClientRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CROCKFORD_ALPHABET[bytes[i] % 32];
  }
  return code;
}

export const RoomJoin: React.FC<JoinProps> = ({ onJoin, onOpenDocs }) => {
  const [inputCode, setInputCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateNew = async () => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/room/generate');
      if (res.ok) {
        const data = await res.json() as { roomId: string };
        onJoin(data.roomId.toUpperCase());
        return;
      }
    } catch {
      // Fallback to client generator if offline or dev mode
    }

    const fallbackCode = generateClientRoomId();
    onJoin(fallbackCode);
    setIsCreating(false);
  };

  const handleManualJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputCode.trim();

    // Smart-detect full invite URL or hash fragment
    if (raw.includes('#') || raw.includes('room=')) {
      try {
        const hashPart = raw.includes('#') ? raw.split('#')[1] : raw;
        const params = new URLSearchParams(hashPart);
        const parsedRoom = params.get('room');
        const parsedKey = params.get('key');
        if (parsedRoom && /^[0-9A-HJKMNP-Z]{6}$/i.test(parsedRoom)) {
          onJoin(parsedRoom.toUpperCase(), parsedKey || undefined);
          return;
        }
      } catch {
        // Fallback to plain code
      }
    }

    const clean = raw.toUpperCase();
    if (/^[0-9A-HJKMNP-Z]{6}$/.test(clean)) {
      onJoin(clean);
    }
  };

  const isJoinDisabled = () => {
    const raw = inputCode.trim();
    if (raw.length === 6) return false;
    if (raw.includes('room=') || raw.includes('#')) return false;
    return true;
  };

  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '8px' }}>
            Clipboard-Sync
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.5 }}>
            Real-time, zero-knowledge clipboard sharing across all your devices. Nothing is saved on servers.
          </p>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%', padding: '12px' }}
            onClick={handleCreateNew}
            disabled={isCreating}
          >
            {isCreating ? 'Generating Room...' : 'Create New Room'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '12px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            <span>OR JOIN EXISTING</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          </div>

          <form onSubmit={handleManualJoin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Enter 6-char Code or Paste Link"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '15px',
                textAlign: 'center',
                letterSpacing: inputCode.length <= 6 ? '2px' : '0px',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              className="btn-secondary"
              style={{ width: '100%' }}
              disabled={isJoinDisabled()}
            >
              Join Room
            </button>
          </form>

          <div style={{ marginTop: '4px', textAlign: 'center' }}>
            <a
              href="#docs"
              onClick={(e) => {
                e.preventDefault();
                if (onOpenDocs) {
                  onOpenDocs();
                } else {
                  window.location.hash = 'docs';
                }
              }}
              style={{
                color: 'var(--text-muted)',
                fontSize: '13px',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'color 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              Docs & Security Model
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
