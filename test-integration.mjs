import WS from 'ws';

const WebSocket = globalThis.WebSocket || WS;
const PORT = 8787;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_BASE_URL = `ws://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

async function waitForSocketOpen(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);
    ws.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };
    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

function createMessageCollector(ws) {
  const queue = [];
  let waitingResolver = null;

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (waitingResolver) {
        const resolve = waitingResolver;
        waitingResolver = null;
        resolve(data);
      } else {
        queue.push(data);
      }
    } catch (e) {
      console.error('Failed to parse WS message:', event.data);
    }
  };

  return {
    async nextMessage(timeoutMs = 5000) {
      if (queue.length > 0) {
        return queue.shift();
      }
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          waitingResolver = null;
          reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
        }, timeoutMs);

        waitingResolver = (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        };
      });
    }
  };
}

async function runTests() {
  console.log('--- STARTING AUTOMATED INTEGRATION TESTS ---');

  // 1. Test Health Endpoint
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.status === 200, 'Health endpoint returns HTTP 200');
  const healthData = await healthRes.json();
  assert(healthData.status === 'healthy', 'Health response is healthy');

  // 2. Test Room Generation Endpoint
  const roomRes = await fetch(`${BASE_URL}/api/room/generate`);
  assert(roomRes.status === 200, 'Room generate endpoint returns HTTP 200');
  const roomData = await roomRes.json();
  assert(typeof roomData.roomId === 'string' && roomData.roomId.length === 6, 'Room ID is valid 6-char code');
  const roomId = roomData.roomId;
  console.log(`Generated Test Room ID: ${roomId}`);

  // 3. Connect Client A (Initiator)
  const wsA = new WebSocket(`${WS_BASE_URL}/ws?room=${roomId}&deviceId=dev_A&deviceName=MacBookPro&os=macOS`);
  const collectorA = createMessageCollector(wsA);
  await waitForSocketOpen(wsA);
  assert(true, 'Client A connected via WebSocket');

  const readyA = await collectorA.nextMessage();
  assert(readyA.type === 'room_ready', 'Client A received room_ready');
  assert(readyA.isInitiator === true, 'Client A is initiator (first in room)');

  // 4. Connect Client B (Second peer)
  const wsB = new WebSocket(`${WS_BASE_URL}/ws?room=${roomId}&deviceId=dev_B&deviceName=Pixel8&os=Android`);
  const collectorB = createMessageCollector(wsB);
  await waitForSocketOpen(wsB);
  assert(true, 'Client B connected via WebSocket');

  const readyB = await collectorB.nextMessage();
  assert(readyB.type === 'room_ready', 'Client B received room_ready');
  assert(readyB.isInitiator === false, 'Client B is not initiator');

  // Client A should receive peer_joined and peer_state_request
  const msgA1 = await collectorA.nextMessage();
  assert(msgA1.type === 'peer_joined', 'Client A received peer_joined event');
  assert(msgA1.peer.deviceId === 'dev_B', 'Joined peer is Client B');

  const msgA2 = await collectorA.nextMessage();
  assert(msgA2.type === 'peer_state_request', 'Client A received peer_state_request for late-joiner');
  assert(msgA2.requesterDeviceId === 'dev_B', 'Requester device is Client B');

  // 5. Test Peer State Transfer (A transfers in-memory state to B)
  const simulatedClip = {
    itemId: 'test-item-1',
    contentType: 'text/plain',
    iv: 'dGVzdC1pdi0xMmdi',
    ciphertext: 'c2ltdWxhdGVkLWVuY3J5cHRlZC1kYXRh',
    senderName: 'MacBookPro',
    senderOs: 'macOS',
    createdAt: Date.now(),
    isPinned: false
  };

  wsA.send(JSON.stringify({
    type: 'peer_state_transfer',
    targetDeviceId: 'dev_B',
    clips: [simulatedClip]
  }));

  const stateTransferB = await collectorB.nextMessage();
  assert(stateTransferB.type === 'peer_state_transfer', 'Client B received peer_state_transfer');
  assert(stateTransferB.clips.length === 1, 'Client B received 1 clip from peer state transfer');
  assert(stateTransferB.clips[0].itemId === 'test-item-1', 'Transferred clip itemId matches');

  // 6. Test Real-Time Broadcast (B publishes new clip -> A receives broadcast)
  const newClipFromB = {
    itemId: 'test-item-2',
    contentType: 'text/plain',
    iv: 'dGVzdC1pdi1jbGllbnQtYg==',
    ciphertext: 'ZW5jcnlwdGVkLXBheWxvYWQtZnJvbS1i',
    senderName: 'Pixel8',
    senderOs: 'Android',
    createdAt: Date.now(),
    isPinned: false
  };

  wsB.send(JSON.stringify({
    type: 'clip_publish',
    payload: newClipFromB
  }));

  const broadcastA = await collectorA.nextMessage();
  assert(broadcastA.type === 'clip_broadcast', 'Client A received clip_broadcast');
  assert(broadcastA.senderDeviceId === 'dev_B', 'Broadcast sender is dev_B');
  assert(broadcastA.payload.itemId === 'test-item-2', 'Broadcast payload itemId matches');

  // 7. Test Clip Deletion
  wsA.send(JSON.stringify({
    type: 'clip_delete',
    itemId: 'test-item-2'
  }));

  const deleteB = await collectorB.nextMessage();
  assert(deleteB.type === 'clip_delete', 'Client B received clip_delete');
  assert(deleteB.itemId === 'test-item-2', 'Deleted itemId matches');

  // 8. Test Disconnect & Peer Left Notification
  wsB.close();
  const leftA = await collectorA.nextMessage();
  assert(leftA.type === 'peer_left', 'Client A received peer_left event');
  assert(leftA.deviceId === 'dev_B', 'Disconnected device is dev_B');

  // Clean up Client A
  wsA.close();

  // 9. Test In-Memory Token Bucket Rate Limiting (Anti-Macro)
  console.log('Testing Token Bucket Rate Limiter...');
  const rateLimitRoom = 'RATELM';
  const wsSpam = new WebSocket(`${WS_BASE_URL}/ws?room=${rateLimitRoom}&deviceId=spammer&deviceName=SpamBot&os=Linux`);
  await waitForSocketOpen(wsSpam);
  const spamCollector = createMessageCollector(wsSpam);
  await spamCollector.nextMessage(); // room_ready

  // Fire 15 rapid messages (burst capacity is 10)
  for (let i = 0; i < 15; i++) {
    wsSpam.send(JSON.stringify({
      type: 'clip_publish',
      payload: {
        itemId: `spam-${i}`,
        type: 'text/plain',
        ciphertext: 'c3BhbQ==',
        senderName: 'SpamBot',
        senderOs: 'Linux',
        createdAt: Date.now(),
        isPinned: false
      }
    }));
  }

  let rateLimitCaught = false;
  try {
    for (let i = 0; i < 5; i++) {
      const resp = await spamCollector.nextMessage(2000);
      if (resp && resp.type === 'error' && resp.message.includes('Rate limit exceeded')) {
        rateLimitCaught = true;
        break;
      }
    }
  } catch {
    // wsSpam may close with 1008 policy violation
  }
  assert(rateLimitCaught || wsSpam.readyState >= 2, 'Spam burst triggered rate limiter');
  try { wsSpam.close(); } catch {}

  // 10. Test Max Payload Size Guard (RFC 6455 1009)
  console.log('Testing Pre-Parse Payload Guard...');
  const wsBig = new WebSocket(`${WS_BASE_URL}/ws?room=BIGPAY&deviceId=bigdev&deviceName=BigPayload&os=Linux`);
  await waitForSocketOpen(wsBig);
  const bigCollector = createMessageCollector(wsBig);
  await bigCollector.nextMessage(); // room_ready

  const bigClosePromise = new Promise((resolve) => {
    wsBig.onclose = (event) => resolve(event.code);
  });

  // Send a string larger than 5MB
  const massivePayload = 'X'.repeat(5 * 1024 * 1024 + 1024);
  wsBig.send(massivePayload);
  const closeCode = await bigClosePromise;
  assert(closeCode === 1009, `Payload exceeding 5MB rejected with RFC 6455 code 1009 (actual: ${closeCode})`);

  // 11. Test Room Capacity Guard (Max 10 Devices)
  console.log('Testing Room Capacity Guard...');
  const capRoom = 'ROOMCP';
  const sockets = [];
  for (let i = 0; i < 10; i++) {
    const ws = new WebSocket(`${WS_BASE_URL}/ws?room=${capRoom}&deviceId=dev_${i}&deviceName=Device${i}&os=Linux`);
    await waitForSocketOpen(ws);
    sockets.push(ws);
  }
  assert(sockets.length === 10, 'Successfully connected 10 peers to room');

  // Attempt 11th connection (must be rejected due to room capacity)
  const err11 = await new Promise((resolve) => {
    const ws11 = new WebSocket(`${WS_BASE_URL}/ws?room=${capRoom}&deviceId=dev_11&deviceName=Device11&os=Linux`);
    ws11.onerror = (err) => resolve(err.message || 'error_429');
    ws11.onopen = () => {
      ws11.close();
      resolve('unexpected_open');
    };
  });
  assert(err11.includes('429') || err11.includes('Unexpected server response') || err11.includes('error'), `11th peer rejected with Room Capacity Reached (result: ${err11})`);

  // Cleanup capacity sockets
  for (const s of sockets) {
    try { s.close(); } catch {}
  }

  console.log('--- ALL INTEGRATION & SECURITY TESTS PASSED SUCCESSFULLY (12/12) ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
