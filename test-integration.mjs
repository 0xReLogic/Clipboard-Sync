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

  console.log('--- ALL INTEGRATION TESTS PASSED SUCCESSFULLY (9/9) ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
