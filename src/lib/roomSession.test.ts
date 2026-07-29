import { describe, expect, it } from "vitest";
import {
  ACTIVE_ROOM_SESSION_KEY,
  RESUMABLE_RACE_ROOMS_KEY,
  LEGACY_PYCLIMB_SESSION_KEY,
  LEGACY_RACE_SESSION_KEY,
  clearActiveRoomSession,
  forgetResumableRaceRoom,
  getCollaborationRoomSession,
  getRaceRoomSession,
  readActiveRoomSession,
  readResumableRaceRooms,
  rememberResumableRaceRoom,
  writeActiveRoomSession,
  writeRaceRoomSession,
} from "./roomSession";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("active room sessions", () => {
  it("migrates a race v0 session without changing its consumer shape", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_RACE_SESSION_KEY,
      JSON.stringify({ code: "ABC234", uid: "host-1", role: "host" }),
    );

    const active = readActiveRoomSession(storage);

    expect(active).toEqual({ kind: "race", code: "ABC234", uid: "host-1", role: "host" });
    expect(getRaceRoomSession(active)).toEqual({ code: "ABC234", uid: "host-1", role: "host" });
    expect(storage.getItem(LEGACY_RACE_SESSION_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(ACTIVE_ROOM_SESSION_KEY)!)).toEqual(active);
  });

  it("also migrates the original PyClimb session key", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_PYCLIMB_SESSION_KEY,
      JSON.stringify({ code: "XYZ234", uid: "player-1", role: "player", nickname: "Ada" }),
    );

    expect(getRaceRoomSession(readActiveRoomSession(storage))).toEqual({
      code: "XYZ234",
      uid: "player-1",
      role: "player",
      nickname: "Ada",
    });
    expect(storage.getItem(LEGACY_PYCLIMB_SESSION_KEY)).toBeNull();
  });

  it("round-trips collaboration sessions and excludes them from race consumers", () => {
    const storage = new MemoryStorage();
    const session = {
      kind: "collaboration" as const,
      code: "RMM234",
      uid: "member-1",
      nickname: "Grace",
      roomInstanceId: "2fdab893-9d68-4d0f-8f93-d3c5c39b1284",
      memberSlot: "7",
    };

    writeActiveRoomSession(session, storage);
    const active = readActiveRoomSession(storage);

    expect(getCollaborationRoomSession(active)).toEqual(session);
    expect(getRaceRoomSession(active)).toBeNull();
  });

  it("round-trips a spectator race session", () => {
    const storage = new MemoryStorage();
    writeRaceRoomSession(
      { code: "ABC234", uid: "viewer-1", role: "spectator", nickname: "Grace" },
      storage,
    );

    expect(getRaceRoomSession(readActiveRoomSession(storage))).toEqual({
      code: "ABC234",
      uid: "viewer-1",
      role: "spectator",
      nickname: "Grace",
    });
  });

  it("only clears a session when its kind matches", () => {
    const storage = new MemoryStorage();
    writeRaceRoomSession({ code: "ABC234", uid: "host-1", role: "host" }, storage);

    clearActiveRoomSession("collaboration", storage);
    expect(readActiveRoomSession(storage)?.kind).toBe("race");

    clearActiveRoomSession("race", storage);
    expect(readActiveRoomSession(storage)).toBeNull();
  });

  it("ignores malformed stored sessions", () => {
    const storage = new MemoryStorage();
    storage.setItem(ACTIVE_ROOM_SESSION_KEY, JSON.stringify({ kind: "collaboration", code: 42 }));
    expect(readActiveRoomSession(storage)).toBeNull();
  });

  it("clears collaboration sessions from the pre-slot format", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      ACTIVE_ROOM_SESSION_KEY,
      JSON.stringify({
        kind: "collaboration",
        code: "RMM234",
        uid: "member-1",
        nickname: "Grace",
        roomInstanceId: "2fdab893-9d68-4d0f-8f93-d3c5c39b1284",
      }),
    );
    expect(readActiveRoomSession(storage)).toBeNull();
  });

  it("remembers unlimited rooms for later without making them active", () => {
    const storage = new MemoryStorage();
    writeRaceRoomSession(
      { code: "ABC234", uid: "player-1", role: "player", nickname: "Ada" },
      storage,
    );

    rememberResumableRaceRoom(
      { code: "ABC234", uid: "player-1", role: "player", nickname: "Ada" },
      storage,
      1_234,
    );
    clearActiveRoomSession("race", storage);

    expect(readActiveRoomSession(storage)).toBeNull();
    expect(readResumableRaceRooms(storage)).toEqual([
      {
        code: "ABC234",
        uid: "player-1",
        role: "player",
        nickname: "Ada",
        leftAt: 1_234,
      },
    ]);
  });

  it("keeps the latest room entry and forgets it after resuming", () => {
    const storage = new MemoryStorage();
    rememberResumableRaceRoom(
      { code: "ABC234", uid: "player-1", role: "player", nickname: "Ada" },
      storage,
      1_000,
    );
    rememberResumableRaceRoom(
      { code: "ABC234", uid: "player-1", role: "spectator", nickname: "Ada" },
      storage,
      2_000,
    );

    expect(readResumableRaceRooms(storage)).toHaveLength(1);
    expect(readResumableRaceRooms(storage)[0]).toMatchObject({
      code: "ABC234",
      role: "spectator",
      leftAt: 2_000,
    });

    expect(forgetResumableRaceRoom("ABC234", "player-1", storage)).toEqual([]);
    expect(storage.getItem(RESUMABLE_RACE_ROOMS_KEY)).toBeNull();
  });

  it("ignores malformed resumable room entries", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      RESUMABLE_RACE_ROOMS_KEY,
      JSON.stringify([
        { code: "ABC234", uid: "host-1", role: "host", leftAt: 500 },
        { code: 42, uid: "bad", role: "player", leftAt: 600 },
        { code: "XYZ234", uid: "bad", role: "owner", leftAt: 700 },
      ]),
    );

    expect(readResumableRaceRooms(storage)).toEqual([
      { code: "ABC234", uid: "host-1", role: "host", leftAt: 500 },
    ]);
  });
});
