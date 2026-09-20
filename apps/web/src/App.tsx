import React, { useState, useEffect } from 'react';
import { ClipboardProvider } from './context/ClipboardContext';
import { Header } from './components/Header';
import { QuickInput } from './components/QuickInput';
import { ClipboardList } from './components/ClipboardList';
import { QRCodeModal } from './components/QRCodeModal';
import { RoomJoin } from './components/RoomJoin';
import { DocsPage } from './components/DocsPage';

export const App: React.FC = () => {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [initialKey, setInitialKey] = useState<string | undefined>();
  const [isDocs, setIsDocs] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Parse URL hash or pathname for direct room, key, or docs links
  useEffect(() => {
    const DOCS_SECTIONS = new Set([
      'docs',
      'quick-start',
      'cryptography',
      'ephemeral-memory',
      'pwa',
      'shortcuts',
      'deployment'
    ]);

    const handleRoute = () => {
      const pathname = window.location.pathname;
      const rawHash = window.location.hash.replace(/^#/, '');

      if (
        pathname === '/docs' ||
        rawHash === 'docs' ||
        rawHash.startsWith('docs') ||
        DOCS_SECTIONS.has(rawHash.toLowerCase())
      ) {
        setIsDocs(true);
        setRoomId(null);
        setInitialKey(undefined);
        return;
      }

      setIsDocs(false);
      const params = new URLSearchParams(rawHash);
      const hashRoom = params.get('room');
      const hashKey = params.get('key');

      if (hashRoom && /^[0-9A-HJKMNP-Z]{6}$/i.test(hashRoom)) {
        setRoomId(hashRoom.toUpperCase());
        if (hashKey) {
          setInitialKey(hashKey);
        }
      } else {
        setRoomId(null);
        setInitialKey(undefined);
      }
    };

    handleRoute();
    window.addEventListener('hashchange', handleRoute);
    window.addEventListener('popstate', handleRoute);
    return () => {
      window.removeEventListener('hashchange', handleRoute);
      window.removeEventListener('popstate', handleRoute);
    };
  }, []);

  const handleJoin = (newRoom: string, key?: string) => {
    setIsDocs(false);
    setRoomId(newRoom);
    setInitialKey(key);
    window.location.hash = `room=${newRoom}${key ? `&key=${key}` : ''}`;
  };

  const handleLeave = () => {
    setIsDocs(false);
    setRoomId(null);
    setInitialKey(undefined);
    window.location.hash = '';
  };

  const handleOpenDocs = () => {
    setIsDocs(true);
    window.location.hash = 'docs';
  };

  const handleBackFromDocs = () => {
    setIsDocs(false);
    if (window.location.pathname === '/docs') {
      window.history.pushState({}, '', '/');
    } else {
      window.location.hash = '';
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  if (isDocs) {
    return <DocsPage onBack={handleBackFromDocs} />;
  }

  if (!roomId) {
    return <RoomJoin onJoin={handleJoin} onOpenDocs={handleOpenDocs} />;
  }

  return (
    <ClipboardProvider
      roomId={roomId}
      initialKey={initialKey}
      onLeave={handleLeave}
    >
      <div className="app-container">
        <Header onOpenQR={() => setIsQROpen(true)} />
        <QuickInput />
        <ClipboardList onToast={showToast} />
        <QRCodeModal
          isOpen={isQROpen}
          onClose={() => setIsQROpen(false)}
          onToast={showToast}
        />
        {toastMessage && <div className="toast-notice">{toastMessage}</div>}
      </div>
    </ClipboardProvider>
  );
};
