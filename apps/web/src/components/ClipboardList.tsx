import React from 'react';
import { useClipboard } from '../context/ClipboardContext';
import { ClipboardCard } from './ClipboardCard';

interface ListProps {
  onToast: (msg: string) => void;
}

export const ClipboardList: React.FC<ListProps> = ({ onToast }) => {
  const { clips } = useClipboard();

  if (clips.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-title">No clips in this room yet</span>
        <span className="empty-subtitle">
          Type or paste text above, press Ctrl+V to paste a screenshot, or pair another device to start syncing.
        </span>
      </div>
    );
  }

  return (
    <div className="clips-feed">
      {clips.map(clip => (
        <ClipboardCard key={clip.itemId} clip={clip} onToast={onToast} />
      ))}
    </div>
  );
};
