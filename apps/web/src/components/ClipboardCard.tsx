import React, { useState } from 'react';
import type { InMemoryClip } from '@clipboard-sync/shared';
import { useClipboard } from '../context/ClipboardContext';
import { copyTextToClipboard, copyImageToClipboard, downloadFile } from '../lib/clipboardHandler';

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

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ClipboardCard: React.FC<CardProps> = ({ clip, onToast }) => {
  const { togglePin, deleteClip } = useClipboard();
  const [isCopied, setIsCopied] = useState(false);

  const isFile = clip.contentType === 'application/octet-stream' || !!clip.previewMeta?.fileName;
  const isImage = clip.contentType === 'image/png';

  const handleCopy = async () => {
    let success = false;
    if (isImage) {
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

  const handleDownload = () => {
    const fileName = clip.previewMeta?.fileName || (isImage ? 'screenshot.png' : 'file-download');
    const success = downloadFile(clip.decryptedContent, fileName);
    if (success) {
      onToast(`Downloading ${fileName}`);
    } else {
      onToast('Failed to trigger file download');
    }
  };

  return (
    <div className={`clip-card ${clip.isPinned ? 'is-pinned' : ''}`}>
      <div className="clip-header">
        <div className="clip-meta">
          <span className="clip-sender">{clip.senderName} ({clip.senderOs})</span>
          <span>•</span>
          <span>{formatTimeAgo(clip.createdAt)}</span>
          {clip.previewMeta?.charCount !== undefined && !isFile && !isImage && (
            <>
              <span>•</span>
              <span>{clip.previewMeta.charCount} chars</span>
            </>
          )}
          {clip.previewMeta?.fileSize !== undefined && (
            <>
              <span>•</span>
              <span>{formatFileSize(clip.previewMeta.fileSize)}</span>
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
          {(isFile || isImage) && (
            <button
              type="button"
              className="btn-mini btn-download"
              onClick={handleDownload}
              title="Download file to device"
            >
              Download
            </button>
          )}
          <button
            type="button"
            className="btn-mini btn-copy"
            onClick={handleCopy}
          >
            {isCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {isImage ? (
        <div className="clip-image-wrapper">
          <img
            src={clip.decryptedContent}
            alt={clip.previewMeta?.fileName || 'Clipboard screenshot'}
            className="clip-image-preview"
            loading="lazy"
          />
        </div>
      ) : isFile ? (
        <div className="clip-file-box">
          <div className="file-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div className="file-info-box">
            <span className="file-name-text" title={clip.previewMeta?.fileName}>
              {clip.previewMeta?.fileName || 'Encrypted Attachment'}
            </span>
            <span className="file-size-text">
              {formatFileSize(clip.previewMeta?.fileSize || clip.previewMeta?.byteSize)}
              {clip.previewMeta?.mimeType ? ` • ${clip.previewMeta.mimeType}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="btn-primary btn-file-download"
            onClick={handleDownload}
          >
            Download
          </button>
        </div>
      ) : (
        <pre className="clip-content">{clip.decryptedContent}</pre>
      )}
    </div>
  );
};

