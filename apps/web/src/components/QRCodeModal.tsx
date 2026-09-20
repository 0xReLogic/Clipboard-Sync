import React, { useEffect, useRef } from 'react';
import * as QRCode from 'qrcode';
import { useClipboard } from '../context/ClipboardContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const QRCodeModal: React.FC<ModalProps> = ({ isOpen, onClose, onToast }) => {
  const { roomId, cryptoKey } = useClipboard();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fullPairingUrl = `${window.location.origin}${window.location.pathname}#room=${roomId}&key=${cryptoKey}`;

  useEffect(() => {
    if (isOpen && canvasRef.current && fullPairingUrl) {
      QRCode.toCanvas(canvasRef.current, fullPairingUrl, {
        width: 220,
        margin: 1,
        color: {
          dark: '#0b0e0c',
          light: '#ffffff'
        }
      });
    }
  }, [isOpen, fullPairingUrl]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullPairingUrl);
        onToast('Invite link copied to clipboard');
      }
    } catch {
      onToast('Failed to copy link automatically');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Pair Another Device</h3>
        <p className="modal-subtitle">
          Scan this QR code with your mobile camera to instantly join this room with end-to-end encryption.
        </p>

        <div className="qr-canvas-container">
          <canvas ref={canvasRef} />
        </div>

        <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '8px' }}>
          <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={handleCopyLink}>
            Copy Link
          </button>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
