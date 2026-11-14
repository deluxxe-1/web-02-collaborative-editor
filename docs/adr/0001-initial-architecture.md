# ADR 0001: Initial Architecture

- **Status:** Accepted
- **Date:** 2026-11-14
- **Deciders:** Realtime team

## Context

We need a bootstrap for a real-time collaborative editor. The core risk is the
collaboration/relay contract, so we want it isolated, testable, and independent of any
particular frontend or infrastructure.

## Decision

1. **Node.js + TypeScript + Express + `ws`** for the relay. `ws` is the de-facto standard
   WebSocket library and pairs cleanly with Express on one HTTP server.
2. **Transport-agnostic room logic** in `rooms.ts`. `RoomMember` is an interface with a
   `send` method, so sockets never leak into the domain model.
3. **Last-write-wins** conflict resolution for the scaffold. Simple, deterministic, and
   easy to reason about; the CRDT upgrade is a localised change.
4. **Next.js (App Router)** for the client placeholder — the same stack a production editor
   would use, with a `'use client'` component for the socket.
5. **npm workspaces** keep server and web builds independent while sharing one lockfile.

## Consequences

- **Positive:** fast iteration, fully unit-testable room logic, swappable transport and
  merge strategy.
- **Negative:** no real conflict merging yet, and no cross-instance fan-out. Both are on
  the roadmap (Yjs, Redis Pub/Sub).

## Alternatives considered

- **Yjs from day one:** more upfront complexity than needed to validate the contract;
  deferred but planned.
- **Socket.IO:** adds a custom protocol on top of WebSocket; plain `ws` keeps the wire
  format transparent for the scaffold.
