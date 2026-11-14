import http from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomRegistry } from './rooms';

/** Maximum accepted characters for a single document update. */
const MAX_CONTENT_LENGTH = 100_000;
/** Maximum accepted inbound WebSocket frame in bytes. */
const MAX_PAYLOAD_BYTES = 256 * 1024;

export interface ServerHandle {
  app: express.Express;
  server: http.Server;
  rooms: RoomRegistry;
  wss: WebSocketServer;
}

function isValidRoomId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

/**
 * Build the HTTP + WebSocket server. Returned separately from `listen` so tests
 * can bind to an ephemeral port.
 */
export function createServer(): ServerHandle {
  const rooms = new RoomRegistry();
  const maxMembers = Number(process.env.MAX_ROOM_MEMBERS ?? 50);
  const corsOrigin = process.env.CORS_ORIGIN ?? '*';

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    next();
  });

  app.get('/', (_req, res) => {
    res.json({
      service: 'collab-relay',
      version: '0.1.0',
      endpoints: ['/health', '/api/rooms', '/ws'],
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'collab-relay' });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ data: rooms.list() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PAYLOAD_BYTES });

  wss.on('connection', (socket: WebSocket, request) => {
    const url = new URL(request.url ?? '/ws', 'http://localhost');
    const roomId = url.searchParams.get('room');
    if (!isValidRoomId(roomId)) {
      socket.close(1008, 'invalid or missing room id');
      return;
    }

    const room = rooms.getOrCreate(roomId);
    if (room.memberCount() >= maxMembers) {
      socket.close(1013, 'room is full');
      return;
    }

    const memberId = randomUUID();
    room.addMember({ id: memberId, send: (payload) => socket.send(payload) });

    socket.on('message', (data) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'invalid JSON' }));
        return;
      }
      if (
        typeof message !== 'object' ||
        message === null ||
        (message as { type?: unknown }).type !== 'update'
      ) {
        socket.send(JSON.stringify({ type: 'error', message: 'unsupported message type' }));
        return;
      }
      const content = (message as { content?: unknown }).content;
      if (typeof content !== 'string') {
        socket.send(JSON.stringify({ type: 'error', message: 'content must be a string' }));
        return;
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        socket.send(JSON.stringify({ type: 'error', message: 'content too large' }));
        return;
      }
      room.applyUpdate(content, memberId);
    });

    socket.on('close', () => {
      room.removeMember(memberId);
      rooms.pruneEmpty();
    });
  });

  return { app, server, rooms, wss };
}

const port = Number(process.env.PORT ?? 8080);

if (require.main === module) {
  const { server } = createServer();
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`collab-relay listening on http://localhost:${port} (ws://localhost:${port}/ws)`);
  });
}
