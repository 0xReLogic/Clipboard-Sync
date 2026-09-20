import React, { useState } from 'react';
import type { InMemoryClip } from '@clipboard-sync/shared';
import { useClipboard } from '../context/ClipboardContext';
import { copyTextToClipboard, copyImageToClipboard } from '../lib/clipboardHandler';

interface CardProps {
  clip: InMemoryClip;
  onToast: (msg: string) => void;
}

function formatTimeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export const ClipboardCard: React.FC<CardProps> = ({ clip, onToast }) => {
  const { togglePin, deleteClip } = useClipboard();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    let success = false;
    if (clip.contentType === 'image/png') {
      success = await copyImageToClipboard(clip.decryptedContent);
    } else {
      success = await copyTextToClipboard(clip.decryptedContent);
    }

    if (success) {
      setIsCopied(true);
      onToast('Copied to system clipboard');
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      onToast('Unable to write to clipboard automatically');
    }
  };

  return (
    <div className={`clip-card ${clip.isPinned ? 'is-pinned' : ''}`}>
      <div className="clip-header">
        <div className="clip-meta">
          <span className="clip-sender">{clip.senderName} ({clip.senderOs})</span>
          <span>•</span>
          <span>{formatTimeAgo(clip.createdAt)}</span>
          {clip.previewMeta?.charCount !== undefined && (
            <>
              <span>•</span>
              <span>{clip.previewMeta.charCount} chars</span>
            </>
          )}
        </div>

        <div className="clip-actions">
          <button
            type="button"
            className={`btn-mini ${clip.isPinned ? 'active' : ''}`}
            onClick={() => togglePin(clip.itemId)}
            title={clip.isPinned ? 'Unpin clip' : 'Pin clip'}
          >
            {clip.isPinned ? 'Pinned' : 'Pin'}
          </button>
          <button
            type="button"
            className="btn-mini"
            onClick={() => deleteClip(clip.itemId)}
            title="Delete clip"
          >
            Delete
          </button>
          <button
            type="button"
            className="btn-mini btn-copy"
            onClick={handleCopy}
          >
            {isCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {clip.contentType === 'image/png' ? (
        <img
          src={clip.decryptedContent}
          alt="Clipboard screenshot"
          className="clip-image-preview"
          loading="lazy"
        />
      ) : (
        <pre className="clip-content">{clip.decryptedContent}</pre>
      )}
    </div>
  );
};
