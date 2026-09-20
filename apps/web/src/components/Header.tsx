import React, { useState, useEffect } from 'react';
import { useClipboard } from '../context/ClipboardContext';

interface HeaderProps {
  onOpenQR: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenQR }) => {
  const { roomId, status, peers, deviceId, leaveRoom } = useClipboard();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'reconnecting':
        return 'Reconnecting';
      case 'connecting':
        return 'Connecting';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div>
      <header className="app-header">
        <div className="header-left">
          <span className="brand-title">Clipboard-Sync</span>
          <div className="room-badge">
            <span>Room:</span>
            <strong>{roomId}</strong>
          </div>
          <div className="status-pill">
            <span className={`status-dot ${status}`} />
            <span>{getStatusLabel()}</span>
          </div>
        </div>

        <div className="header-actions">
          {deferredPrompt && (
            <button
              type="button"
              className="btn-icon"
              onClick={handleInstall}
              title="Install application to home screen or desktop"
            >
              Install App
            </button>
          )}
          <button type="button" className="btn-icon" onClick={onOpenQR} title="Pair with mobile device">
            Pair Device
          </button>
          <button type="button" className="btn-icon" onClick={leaveRoom} title="Leave room">
            Leave
          </button>
        </div>
      </header>

      {peers.length > 0 && (
        <div className="peers-bar">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Connected Devices:</span>
          {peers.map(peer => {
            const isMe = peer.deviceId === deviceId;
            return (
              <div key={peer.deviceId} className={`peer-chip ${isMe ? 'current-device' : ''}`}>
                <span>{peer.os}</span>
                <span>•</span>
                <span>{peer.deviceName} {isMe ? '(You)' : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
