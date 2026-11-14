import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createServer, type ServerHandle } from '../src/index';

interface TestClient {
  socket: WebSocket;
  messages: Array<Record<string, unknown>>;
  ready: Promise<void>;
}

/**
 * Open a client and attach message collection *before* awaiting `open`, so the
 * initial `sync` snapshot (sent by the server immediately on connect) is never
 * missed.
 */
function connect(url: string): TestClient {
  const socket = new WebSocket(url);
  const messages: Array<Record<string, unknown>> = [];
  socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  const ready = new Promise<void>((resolve, reject) => {
    socket.on('open', () => resolve());
    socket.on('error', reject);
  });
  return { socket, messages, ready };
}

function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timed out waiting for condition'));
      }
    }, 10);
  });
}

describe('collab relay server', () => {
  let handle: ServerHandle;
  let wsUrl: string;

  beforeAll(async () => {
    handle = createServer();
    await new Promise<void>((resolve) => handle.server.listen(0, resolve));
    const { port } = handle.server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterAll(async () => {
    // Terminate any lingering sockets so server.close() can complete promptly.
    for (const client of handle.wss.clients) client.terminate();
    await new Promise<void>((resolve) => handle.server.close(() => resolve()));
  });

  it('responds to GET /health', async () => {
    const res = await request(handle.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'collab-relay' });
  });

  it('rejects a WebSocket connection without a room id', async () => {
    const socket = new WebSocket(wsUrl);
    const code = await new Promise<number>((resolve) => {
      socket.on('close', (c) => resolve(c));
    });
    expect(code).toBe(1008);
  });

  it('relays a document update between two clients in the same room', async () => {
    const alice = connect(`${wsUrl}?room=demo`);
    const bob = connect(`${wsUrl}?room=demo`);
    await Promise.all([alice.ready, bob.ready]);

    // Both clients receive the initial snapshot.
    await waitFor(() => alice.messages.some((m) => m.type === 'sync'));
    await waitFor(() => bob.messages.some((m) => m.type === 'sync'));

    alice.socket.send(JSON.stringify({ type: 'update', content: 'shared text' }));

    await waitFor(() => bob.messages.some((m) => m.type === 'update'));
    const update = bob.messages.find((m) => m.type === 'update')!;
    expect(update.content).toBe('shared text');
    expect(update.revision).toBe(1);
    // The sender does not receive its own update back.
    expect(alice.messages.some((m) => m.type === 'update')).toBe(false);

    alice.socket.close();
    bob.socket.close();
  });

  it('reports active rooms via GET /api/rooms', async () => {
    const res = await request(handle.app).get('/api/rooms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
