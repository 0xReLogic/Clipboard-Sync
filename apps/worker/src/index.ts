import { ClipboardRelay, type Env } from './relay';

export { ClipboardRelay };

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CROCKFORD_ALPHABET[bytes[i] % 32];
  }
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Upgrade'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({ status: 'healthy', timestamp: Date.now() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname === '/api/room/generate') {
      const roomId = generateRoomId();
      return new Response(
        JSON.stringify({ roomId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname === '/docs' || url.pathname === '/docs/') {
      if (env.ASSETS) {
        return env.ASSETS.fetch(new Request(new URL('/', request.url), request));
      }
    }

    if (url.pathname === '/ws') {
      const rawRoom = url.searchParams.get('room') || '';
      // Crockford Base32 normalization: normalize confusing glyphs (O->0, I/L->1)
      const roomId = rawRoom.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').trim();

      if (!roomId || !/^[0-9A-HJKMNP-Z]{6}$/.test(roomId)) {
        return new Response('Invalid 6-character Crockford Base32 Room ID', {
          status: 400,
          headers: corsHeaders
        });
      }

      const id = env.CLIPBOARD_RELAYS.idFromName(roomId);
      const stub = env.CLIPBOARD_RELAYS.get(id);

      return stub.fetch(request);
    }

    // Serve frontend static assets (SPA)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
