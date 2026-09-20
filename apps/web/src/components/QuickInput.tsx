import React, { useState, useRef, useEffect } from 'react';
import { useClipboard } from '../context/ClipboardContext';

export const QuickInput: React.FC = () => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { publishClip } = useClipboard();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastPasteTimeRef = useRef(0);

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

  // Listen for direct screenshot paste (Ctrl+V with image blob)
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const now = Date.now();
      if (now - lastPasteTimeRef.current < 500) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            lastPasteTimeRef.current = now;
            event.preventDefault();
            const reader = new FileReader();
            reader.onload = async (e) => {
              const base64 = e.target?.result as string;
              if (base64) {
                await publishClip(base64, 'image/png');
              }
            };
            reader.readAsDataURL(blob);
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
    <form onSubmit={handleSubmit} className="quick-input-card">
      <textarea
        ref={textareaRef}
        className="quick-textarea"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type or paste text/code here... (Or press Ctrl+V anywhere to paste a screenshot)"
        rows={3}
      />
      <div className="input-footer">
        <span className="input-hint">Tip: Press Ctrl+Enter to send instantly</span>
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
