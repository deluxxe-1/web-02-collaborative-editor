'use client';

import { type JSX, useEffect, useRef, useState } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
const ROOM = 'demo';

type Status = 'connecting' | 'connected' | 'disconnected';

/**
 * Minimal client placeholder: a text area wired to the relay's WebSocket
 * endpoint. Remote updates replace the local text; local edits are pushed as
 * `{ type: 'update' }` messages.
 */
export function Editor(): JSX.Element {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(`${WS_URL}?room=${ROOM}`);
    socketRef.current = socket;

    socket.onopen = () => setStatus('connected');
    socket.onclose = () => setStatus('disconnected');
    socket.onerror = () => setStatus('disconnected');
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; content?: string };
        if ((message.type === 'sync' || message.type === 'update') && typeof message.content === 'string') {
          setText(message.content);
        }
      } catch {
        // Ignore malformed frames; the relay validates too.
      }
    };

    return () => socket.close();
  }, []);

  const handleChange = (value: string): void => {
    setText(value);
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'update', content: value }));
    }
  };

  return (
    <section>
      <p aria-live="polite" style={{ color: status === 'connected' ? '#0a7d2c' : '#b00020' }}>
        Status: {status}
      </p>
      <label htmlFor="doc" style={{ display: 'block', marginBottom: '0.5rem' }}>
        Shared document
      </label>
      <textarea
        id="doc"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        rows={12}
        style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: 6 }}
        placeholder="Start typing…"
      />
    </section>
  );
}
