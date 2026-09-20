import type { EncryptedPayload } from '@clipboard-sync/shared';

export class EphemeralCrypto {
  private key: CryptoKey | null = null;

  async initKey(rawKey?: string): Promise<string> {
    const trimmed = rawKey ? rawKey.trim() : '';

    // Check if 64-character Hex string (standard 256-bit key)
    if (trimmed && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const keyBytes = this.fromHex(trimmed);
      this.key = await crypto.subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
      return trimmed.toLowerCase();
    }

    // Fallback for legacy base64 keys, sanitizing spaces back to '+'
    if (trimmed && trimmed.length >= 32) {
      try {
        const sanitized = trimmed.replace(/ /g, '+');
        const keyBytes = this.fromBase64(sanitized);
        this.key = await crypto.subtle.importKey(
          'raw',
          keyBytes as BufferSource,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
        return this.toHex(keyBytes);
      } catch {
        // Fall through to generate fresh key if base64 corrupted
      }
    }

    // Generate fresh cryptographically secure 256-bit key (32 bytes)
    const rawBytes = crypto.getRandomValues(new Uint8Array(32));
    this.key = await crypto.subtle.importKey(
      'raw',
      rawBytes as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    return this.toHex(rawBytes);
  }

  async encrypt(data: string): Promise<EncryptedPayload> {
    if (!this.key) {
      throw new Error('Cryptographic key uninitialized');
    }

    // Generate fresh 96-bit (12-byte) random IV for every message
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      this.key,
      encoded
    );

    return {
      iv: this.toBase64(iv),
      ciphertext: this.toBase64(new Uint8Array(ciphertextBuffer))
    };
  }

  async decrypt(payload: EncryptedPayload): Promise<string> {
    if (!this.key) {
      throw new Error('Cryptographic key uninitialized');
    }

    const iv = this.fromBase64(payload.iv);
    const ciphertext = this.fromBase64(payload.ciphertext);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      this.key,
      ciphertext as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  toHex(buf: Uint8Array): string {
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  fromHex(hex: string): Uint8Array {
    const clean = hex.trim();
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
  }

  private toBase64(buf: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buf.byteLength; i++) {
      binary += String.fromCharCode(buf[i]);
    }
    return btoa(binary);
  }

  private fromBase64(str: string): Uint8Array {
    // Sanitize any space characters that might have resulted from URL encoding
    const sanitized = str.replace(/ /g, '+');
    const binary = atob(sanitized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
