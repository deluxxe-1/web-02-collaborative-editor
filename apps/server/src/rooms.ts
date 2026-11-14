/**
 * Pure, transport-agnostic collaboration logic.
 *
 * A {@link DocumentRoom} holds the canonical document for one room and a set of
 * members that can receive serialised messages. Keeping this free of any
 * WebSocket dependency makes it straightforward to unit test and to swap the
 * conflict-resolution strategy (e.g. for a CRDT) later.
 */

export interface RoomMember {
  /** Unique id of the connected client. */
  id: string;
  /** Deliver a serialised message to this member. */
  send: (payload: string) => void;
}

export interface RoomState {
  roomId: string;
  revision: number;
  content: string;
}

export class DocumentRoom {
  private readonly members = new Map<string, RoomMember>();
  private revision = 0;
  private content = '';

  constructor(public readonly roomId: string) {}

  /** Register a member and send it the current document snapshot. */
  addMember(member: RoomMember): void {
    this.members.set(member.id, member);
    member.send(
      JSON.stringify({
        type: 'sync',
        ...this.snapshot(),
      }),
    );
  }

  removeMember(memberId: string): void {
    this.members.delete(memberId);
  }

  memberCount(): number {
    return this.members.size;
  }

  snapshot(): RoomState {
    return { roomId: this.roomId, revision: this.revision, content: this.content };
  }

  /**
   * Apply a document update and broadcast it to every member except the
   * originator. Returns the resulting state.
   */
  applyUpdate(content: string, originId: string): RoomState {
    this.content = content;
    this.revision += 1;
    const state = this.snapshot();
    this.broadcast({ type: 'update', ...state, origin: originId }, originId);
    return state;
  }

  /** Send an arbitrary message to all members, optionally excluding one. */
  broadcast(message: unknown, excludeId?: string): void {
    const payload = JSON.stringify(message);
    for (const [id, member] of this.members) {
      if (id === excludeId) continue;
      member.send(payload);
    }
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, DocumentRoom>();

  /** Get an existing room or create it on first access. */
  getOrCreate(roomId: string): DocumentRoom {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new DocumentRoom(roomId);
      this.rooms.set(roomId, room);
    }
    return room;
  }

  get(roomId: string): DocumentRoom | undefined {
    return this.rooms.get(roomId);
  }

  size(): number {
    return this.rooms.size;
  }

  /** Summary of every active room, used by `GET /api/rooms`. */
  list(): Array<{ roomId: string; members: number; revision: number }> {
    return [...this.rooms.values()].map((room) => ({
      roomId: room.roomId,
      members: room.memberCount(),
      revision: room.snapshot().revision,
    }));
  }

  /** Drop empty rooms so the registry does not grow unbounded. */
  pruneEmpty(): void {
    for (const [id, room] of this.rooms) {
      if (room.memberCount() === 0) this.rooms.delete(id);
    }
  }
}
