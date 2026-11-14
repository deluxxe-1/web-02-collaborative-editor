import { describe, expect, it, vi } from 'vitest';
import { DocumentRoom, RoomRegistry } from '../src/rooms';

function fakeMember(id: string) {
  const sent: string[] = [];
  return {
    id,
    sent,
    send: (payload: string) => sent.push(payload),
    lastMessage: () => (sent.length ? JSON.parse(sent[sent.length - 1]) : undefined),
  };
}

describe('DocumentRoom', () => {
  it('sends the current snapshot to a member when it joins', () => {
    const room = new DocumentRoom('demo');
    const alice = fakeMember('alice');

    room.addMember(alice);

    expect(alice.sent).toHaveLength(1);
    expect(alice.lastMessage()).toEqual({
      type: 'sync',
      roomId: 'demo',
      revision: 0,
      content: '',
    });
    expect(room.memberCount()).toBe(1);
  });

  it('applies an update, bumps the revision and broadcasts to others only', () => {
    const room = new DocumentRoom('demo');
    const alice = fakeMember('alice');
    const bob = fakeMember('bob');
    room.addMember(alice);
    room.addMember(bob);
    alice.sent.length = 0;
    bob.sent.length = 0;

    const state = room.applyUpdate('hello world', 'alice');

    expect(state).toEqual({ roomId: 'demo', revision: 1, content: 'hello world' });
    // The originator is not echoed back to.
    expect(alice.sent).toHaveLength(0);
    expect(bob.sent).toHaveLength(1);
    expect(bob.lastMessage()).toMatchObject({
      type: 'update',
      revision: 1,
      content: 'hello world',
      origin: 'alice',
    });
  });

  it('stops delivering messages after a member leaves', () => {
    const room = new DocumentRoom('demo');
    const alice = fakeMember('alice');
    room.addMember(alice);
    room.removeMember('alice');

    room.applyUpdate('x', 'someone-else');

    expect(room.memberCount()).toBe(0);
    expect(alice.sent).toHaveLength(1); // only the initial sync
  });
});

describe('RoomRegistry', () => {
  it('returns the same room instance for the same id', () => {
    const registry = new RoomRegistry();
    expect(registry.getOrCreate('a')).toBe(registry.getOrCreate('a'));
    expect(registry.size()).toBe(1);
  });

  it('lists active rooms with member counts and prunes empty rooms', () => {
    const registry = new RoomRegistry();
    const room = registry.getOrCreate('a');
    room.addMember({ id: 'x', send: vi.fn() });

    expect(registry.list()).toEqual([{ roomId: 'a', members: 1, revision: 0 }]);

    room.removeMember('x');
    registry.pruneEmpty();
    expect(registry.size()).toBe(0);
  });
});
