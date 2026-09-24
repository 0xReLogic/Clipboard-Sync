import React, { useState, useRef, useEffect } from 'react';
import { useClipboard } from '../context/ClipboardContext';

export const QuickInput: React.FC = () => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { publishClip } = useClipboard();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPasteTimeRef = useRef(0);

  const handleProcessFile = async (file: File) => {
    // 3.5 MB max limit to account for ~33% Base64 expansion within 5MB RFC 6455 frame cap
    const MAX_FILE_SIZE = 3.5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 3.5 MB memory limit.`);
      setTimeout(() => setFileError(null), 5000);
      return;
    }

    setFileError(null);
    setIsSending(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) {
          const isImage = file.type.startsWith('image/');
          const contentType = isImage ? 'image/png' : 'application/octet-stream';
          await publishClip(dataUrl, contentType, {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'application/octet-stream',
            byteSize: file.size
          });
        }
        setIsSending(false);
      };
      reader.onerror = () => {
        setFileError('Failed to read file.');
        setIsSending(false);
        setTimeout(() => setFileError(null), 4000);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to process file:', err);
      setIsSending(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSending) return;

    setIsSending(true);
    try {
      await publishClip(content, 'text/plain');
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (err) {
      console.error('Failed to publish clip:', err);
    } finally {
      // 300ms client cooldown to prevent accidental rapid double-submits
      setTimeout(() => {
        setIsSending(false);
      }, 300);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // Reset input value so same file can be selected again
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
  };

  // Listen for direct screenshot paste (Ctrl+V with image blob or copied file)
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const now = Date.now();
      if (now - lastPasteTimeRef.current < 500) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) {
            lastPasteTimeRef.current = now;
            event.preventDefault();
            handleProcessFile(file);
            return;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [publishClip]);

  return (
    <form
      onSubmit={handleSubmit}
      className={`quick-input-card ${isDragging ? 'is-dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="input-field-wrapper">
        <textarea
          ref={textareaRef}
          className="quick-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type or paste text/code, drop any file (PDF, zip, doc), or press Ctrl+V for screenshots..."
          rows={3}
        />
        {isDragging && (
          <div className="drag-overlay">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Drop file here to encrypt & sync (Max 3.5 MB)</span>
          </div>
        )}
      </div>

      {fileError && (
        <div className="file-error-banner">
          {fileError}
        </div>
      )}

      <div className="input-footer">
        <div className="footer-left">
          <button
            type="button"
            className="btn-icon btn-attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            title="Attach file (PDF, documents, archives, images up to 3.5 MB)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span>Attach File</span>
          </button>
          <span className="input-hint">Tip: Drag & drop files or press Ctrl+Enter</span>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={!content.trim() || isSending}
        >
          {isSending ? 'Encrypting...' : 'Send to Room'}
        </button>
      </div>
    </form>
  );
};

