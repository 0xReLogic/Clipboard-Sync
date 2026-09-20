import React, { useEffect } from 'react';

interface DocsPageProps {
  onBack: () => void;
}

export const DocsPage: React.FC<DocsPageProps> = ({ onBack }) => {
  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '');
    const targetId = raw.replace(/^docs\/?/, '');
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    }
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      window.history.replaceState(null, '', `#docs/${id}`);
    }
  };
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}>
      {/* Docs Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(11, 14, 12, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span style={{ color: 'var(--accent-primary)' }}>Clipboard-Sync</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '14px' }}>/ docs</span>
          </button>
          <span
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--accent-primary)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              padding: '2px 8px',
              borderRadius: '999px'
            }}
          >
            v1.0.0
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href="https://github.com/0xReLogic/Clipboard-Sync"
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '13px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)'
            }}
          >
            GitHub
          </a>
          <button
            type="button"
            className="btn-primary"
            onClick={onBack}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            Launch App
          </button>
        </div>
      </header>

      {/* Docs Body */}
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '40px 24px 80px',
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: '48px',
          alignItems: 'start'
        }}
      >
        {/* Sticky Sidebar Navigation */}
        <aside
          style={{
            position: 'sticky',
            top: '88px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
            Documentation
          </div>
          <a href="#docs/quick-start" onClick={(e) => scrollToSection(e, 'quick-start')} style={sidebarLinkStyle}>1. Quick Start</a>
          <a href="#docs/cryptography" onClick={(e) => scrollToSection(e, 'cryptography')} style={sidebarLinkStyle}>2. Security & Zero-Knowledge</a>
          <a href="#docs/ephemeral-memory" onClick={(e) => scrollToSection(e, 'ephemeral-memory')} style={sidebarLinkStyle}>3. Ephemeral Memory & Ring Buffer</a>
          <a href="#docs/pwa" onClick={(e) => scrollToSection(e, 'pwa')} style={sidebarLinkStyle}>4. Progressive Web App (PWA)</a>
          <a href="#docs/shortcuts" onClick={(e) => scrollToSection(e, 'shortcuts')} style={sidebarLinkStyle}>5. Keyboard Shortcuts</a>
          <a href="#docs/deployment" onClick={(e) => scrollToSection(e, 'deployment')} style={sidebarLinkStyle}>6. Self-Hosting & Deployment</a>
        </aside>

        {/* Content Section */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '48px', lineHeight: 1.6 }}>
          {/* Intro */}
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.8px', marginBottom: '12px' }}>
              System Documentation
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
              Clipboard-Sync is an open-source, zero-knowledge, real-time multi-device clipboard relay.
              Paylod data is encrypted client-side using Web Crypto AES-GCM-256 before leaving your device,
              and servers retain zero bytes of persistent data.
            </p>
          </div>

          {/* 1. Quick Start */}
          <section id="quick-start" style={sectionStyle}>
            <h2 style={headingStyle}>1. Quick Start</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Synchronizing text, code snippets, tokens, and screenshots between computers, tablets, and smartphones takes seconds:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div style={cardStyle}>
                <div style={stepBadgeStyle}>Step 1</div>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Create or Join Room</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Click <strong>Create New Room</strong> to generate a random 6-character Crockford Base32 room code and cryptographic key.
                </div>
              </div>

              <div style={cardStyle}>
                <div style={stepBadgeStyle}>Step 2</div>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Pair Your Devices</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Open the QR modal and scan the QR code with your smartphone camera to connect with end-to-end encryption instantly.
                </div>
              </div>

              <div style={cardStyle}>
                <div style={stepBadgeStyle}>Step 3</div>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Sync in Real-Time</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Type text, paste code, or press <code>Ctrl+V</code> anywhere on the page to paste screenshots instantly across all active peers.
                </div>
              </div>
            </div>
          </section>

          {/* 2. Security & Zero-Knowledge */}
          <section id="cryptography" style={sectionStyle}>
            <h2 style={headingStyle}>2. Security & Zero-Knowledge Cryptography</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Unlike commercial clipboard utilities that store plain text in remote databases, Clipboard-Sync is engineered around a zero-trust model:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div style={cardStyle}>
                <div style={{ color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  Authenticated Encryption (AES-GCM-256)
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  All clipboard items are encrypted via the browser native <code>window.crypto.subtle</code> implementation with a 256-bit symmetric key. Every message includes a 128-bit authentication tag ensuring tampering detection.
                </p>
              </div>

              <div style={cardStyle}>
                <div style={{ color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  Client-Only URL Hash Key (`#key=...`)
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Encryption keys are stored strictly in the URL hash fragment. Per RFC 3986, fragment identifiers are processed exclusively client-side and are never transmitted over the network in HTTP request headers (`Referer`, `Host`), keeping the key hidden from ISPs and Cloudflare servers.
                </p>
              </div>

              <div style={cardStyle}>
                <div style={{ color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '4px' }}>
                  96-Bit Cryptographic Nonces
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  A fresh, cryptographically secure 12-byte initialization vector (IV) is generated via <code>crypto.getRandomValues()</code> for every single broadcast message, completely eliminating nonce-reuse vulnerabilities.
                </p>
              </div>
            </div>

            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Layer</th>
                  <th style={thStyle}>Implementation</th>
                  <th style={thStyle}>Guarantee</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>Payload Cipher</td>
                  <td style={tdStyle}><code>AES-GCM-256</code></td>
                  <td style={tdStyle}>Confidentiality & Integrity</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Key Storage</td>
                  <td style={tdStyle}><code>window.location.hash</code></td>
                  <td style={tdStyle}>Zero Server Knowledge (RFC 3986)</td>
                </tr>
                <tr>
                  <td style={tdStyle}>Server Storage</td>
                  <td style={tdStyle}>0 Bytes (Volatile RAM only)</td>
                  <td style={tdStyle}>Zero Persistent Footprint</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 3. Ephemeral Memory */}
          <section id="ephemeral-memory" style={sectionStyle}>
            <h2 style={headingStyle}>3. Ephemeral Memory & Ring Buffer</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              The server infrastructure acts purely as a <em>blind WebSocket relay</em> via Cloudflare Workers Durable Objects. Sockets hibernate when inactive, incurring virtually zero compute costs.
            </p>
            <div style={cardStyle}>
              <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>20-Item Bounded Ring Buffer:</strong> Client browsers maintain an in-memory buffer limited to 20 items. Older unpinned items are automatically evicted to preserve memory.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Automatic Blob URL Cleanup:</strong> Image attachments allocate temporary blob URLs that are cleaned up via <code>URL.revokeObjectURL</code> upon eviction to prevent browser memory leaks.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Peer State Transfer:</strong> When a late-joining peer connects, the active room host pushes existing items directly through the encrypted relay so historical state is synchronized without server persistence.
                </li>
                <li>
                  <strong style={{ color: 'var(--text-primary)' }}>Permanent Self-Destruction:</strong> When all connected tabs/devices leave or disconnect, all room state in memory is permanently destroyed.
                </li>
              </ul>
            </div>
          </section>

          {/* 4. Progressive Web App */}
          <section id="pwa" style={sectionStyle}>
            <h2 style={headingStyle}>4. Progressive Web App (PWA)</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Clipboard-Sync is a full Progressive Web App equipped with an offline service worker shell:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div style={cardStyle}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>iOS (Safari)</div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Tap the <strong>Share</strong> button at the bottom of Safari, then choose <strong>Add to Home Screen</strong>. Clipboard-Sync will launch in fullscreen standalone mode.
                </p>
              </div>
              <div style={cardStyle}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>Android & Desktop (Chrome / Edge)</div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Click the <strong>Install App</strong> button located in the application header or browser URL bar to install Clipboard-Sync directly to your desktop or home launcher.
                </p>
              </div>
            </div>
          </section>

          {/* 5. Shortcuts */}
          <section id="shortcuts" style={sectionStyle}>
            <h2 style={headingStyle}>5. Keyboard Shortcuts</h2>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Shortcut</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Context</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}><kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>Enter</kbd></td>
                  <td style={tdStyle}>Send text or code block to room</td>
                  <td style={tdStyle}>Input textarea</td>
                </tr>
                <tr>
                  <td style={tdStyle}><kbd style={kbdStyle}>Ctrl</kbd> + <kbd style={kbdStyle}>V</kbd></td>
                  <td style={tdStyle}>Paste image screenshot directly into clipboard</td>
                  <td style={tdStyle}>Global (Anywhere on page)</td>
                </tr>
                <tr>
                  <td style={tdStyle}><kbd style={kbdStyle}>Esc</kbd></td>
                  <td style={tdStyle}>Close open dialogs or QR Code modal</td>
                  <td style={tdStyle}>Modal window</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 6. Self-Hosting */}
          <section id="deployment" style={sectionStyle}>
            <h2 style={headingStyle}>6. Self-Hosting & Deployment</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              You can deploy your own instance of Clipboard-Sync on Cloudflare in under 3 minutes:
            </p>
            <div style={cardStyle}>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>1. Clone Repository</div>
              <pre style={codeBlockStyle}><code>git clone https://github.com/0xReLogic/Clipboard-Sync.git{'\n'}cd Clipboard-Sync{'\n'}npm install</code></pre>

              <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '16px 0 8px' }}>2. Deploy Worker Relay</div>
              <pre style={codeBlockStyle}><code>cd apps/worker{'\n'}npx wrangler deploy</code></pre>

              <div style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '16px 0 8px' }}>3. Build & Deploy Frontend to Cloudflare Pages</div>
              <pre style={codeBlockStyle}><code>cd ../web{'\n'}npm run build{'\n'}npx wrangler pages deploy dist --project-name=clipboard-sync</code></pre>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

const sidebarLinkStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  transition: 'all 0.15s ease'
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column'
};

const headingStyle: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '-0.4px',
  marginBottom: '12px',
  paddingBottom: '8px',
  borderBottom: '1px solid var(--border-subtle)'
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding: '16px 20px'
};

const stepBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'var(--bg-elevated)',
  color: 'var(--accent-primary)',
  border: '1px solid var(--border-subtle)',
  fontSize: '11px',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '4px',
  marginBottom: '8px'
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  overflow: 'hidden',
  fontSize: '14px'
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  background: 'var(--bg-elevated)',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)',
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)'
};

const kbdStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '4px',
  padding: '2px 6px',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)'
};

const codeBlockStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: '13px',
  color: 'var(--accent-primary)',
  overflowX: 'auto',
  margin: 0
};
