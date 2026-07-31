import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-col-collaboration";
const ROOM_CODE = "RACE24";
const ROOM_PATH = `rooms/${ROOM_CODE}`;
const CREATED_AT = 1_720_000_000_000;
const GENERATION = String(CREATED_AT);
const ACTIVITY_PATH = `raceActivity/${ROOM_CODE}/${GENERATION}`;
const SUBMISSION_PATH = `raceSubmissions/${ROOM_CODE}/${GENERATION}`;

let testEnvironment: RulesTestEnvironment;

interface RaceActivity {
  problemId: string;
  phase: "pending" | "active";
  source: string;
  updatedAt: number;
}

interface RaceAcceptedSubmission {
  problemId: string;
  source: string;
  acceptedAt: number;
}

function anonymousDatabase(uid: string) {
  return testEnvironment.authenticatedContext(uid, {
    firebase: { sign_in_provider: "anonymous" },
    provider_id: "anonymous",
  }).database();
}

function googleDatabase(uid: string) {
  return testEnvironment.authenticatedContext(uid, {
    firebase: { sign_in_provider: "google.com" },
  }).database();
}

function contestant(uid: string, nickname = uid) {
  return {
    uid,
    nickname,
    normalizedNickname: nickname.toLowerCase(),
    score: 0,
    correctCount: 0,
    joinedAt: CREATED_AT,
    lastAcceptedAt: null,
    online: true,
    ready: true,
  };
}

function spectator(uid: string, nickname = uid) {
  return {
    uid,
    nickname,
    normalizedNickname: nickname.toLowerCase(),
    joinedAt: CREATED_AT,
    assignedAt: CREATED_AT + 1_000,
    online: true,
  };
}

function progress(currentStreak = 0) {
  return {
    score: 0,
    solvedCount: 0,
    currentStreak,
    solved: {},
  };
}

function activity(overrides: Partial<RaceActivity> = {}): RaceActivity {
  return {
    problemId: "v5-example",
    phase: "active",
    source: "print('hello')",
    updatedAt: CREATED_AT + 2_000,
    ...overrides,
  };
}

function submission(
  overrides: Partial<RaceAcceptedSubmission> = {},
): RaceAcceptedSubmission {
  return {
    problemId: "v5-example",
    source: "print('accepted')",
    acceptedAt: CREATED_AT + 2_500,
    ...overrides,
  };
}

function challenge(status: "waiting" | "active" | "finished" = "active") {
  return {
    id: "challenge-1",
    status,
    challengerUid: "player",
    challengerName: "Player",
    championUid: "peer",
    championName: "Peer",
    difficulty: "easy",
    problemId: "v5-example",
    problemReward: 100,
    createdAt: CREATED_AT + 3_000,
    startedAt: status === "waiting" ? null : CREATED_AT + 4_000,
    finishedAt: status === "finished" ? CREATED_AT + 5_000 : null,
    winnerUid: status === "finished" ? "peer" : null,
  };
}

function room(options: {
  status?: "lobby" | "active" | "finished";
  unlimited?: boolean;
  startedAt?: number;
  includePlayer?: boolean;
  includeSpectator?: boolean;
  activeChallenge?: boolean;
} = {}) {
  const status = options.status ?? "active";
  const leaderboard: Record<string, ReturnType<typeof contestant>> = {
    peer: contestant("peer", "Peer"),
  };
  const playerProgress: Record<string, ReturnType<typeof progress>> = {
    peer: progress(5),
  };
  if (options.includePlayer !== false) {
    leaderboard.player = contestant("player", "Player");
    playerProgress.player = progress(5);
  }

  return {
    meta: {
      hostUid: "host",
      hostOnline: true,
      status,
      bankVersion: "v5",
      problemCount: 10,
      durationSeconds: 1_800,
      unlimited: options.unlimited ?? false,
      createdAt: CREATED_AT,
      startedAt: status === "lobby" ? null : options.startedAt ?? CREATED_AT,
      endsAt: status === "active" ? Date.now() - 1_000 : null,
      endedAt: status === "finished" ? CREATED_AT + 10_000 : null,
      endReason: status === "finished" ? "host" : null,
    },
    leaderboard,
    progress: playerProgress,
    ...(options.includeSpectator
      ? {
          spectators: {
            spectator: spectator("spectator", "Spectator"),
          } as Record<string, ReturnType<typeof spectator>>,
        }
      : {}),
    ...(options.activeChallenge ? { challenge: challenge("active") } : {}),
  };
}

async function seedRoom(
  roomValue = room({ includeSpectator: true }),
  activities: Record<string, RaceActivity> = {
    player: activity(),
    peer: activity({ problemId: "v5-peer" }),
  },
) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context.database().ref(ROOM_PATH).set(roomValue);
    await context.database().ref(ACTIVITY_PATH).set(activities);
  });
}

beforeAll(async () => {
  const rules = await readFile(new URL("../../database.rules.json", import.meta.url), "utf8");
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules },
  });
});

beforeEach(async () => {
  await testEnvironment.clearDatabase();
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("competitive race Realtime Database rules", () => {
  it("lets only the host and current spectators read a generation of activity", async () => {
    await seedRoom();

    await assertSucceeds(anonymousDatabase("host").ref(ACTIVITY_PATH).once("value"));
    await assertSucceeds(anonymousDatabase("spectator").ref(ACTIVITY_PATH).once("value"));
    await assertFails(anonymousDatabase("player").ref(ACTIVITY_PATH).once("value"));
    await assertFails(anonymousDatabase("outsider").ref(ACTIVITY_PATH).once("value"));
    await assertFails(testEnvironment.unauthenticatedContext().database().ref(ACTIVITY_PATH).once("value"));
  });

  it("gates unlimited-room activity behind Google authentication", async () => {
    await seedRoom(room({ unlimited: true, includeSpectator: true }));

    await assertFails(anonymousDatabase("spectator").ref(ACTIVITY_PATH).once("value"));
    await assertSucceeds(googleDatabase("spectator").ref(ACTIVITY_PATH).once("value"));
    await assertFails(anonymousDatabase("player").ref(`${ACTIVITY_PATH}/player`).set(activity()));
    await assertSucceeds(googleDatabase("player").ref(`${ACTIVITY_PATH}/player`).set(activity()));
  });

  it("lets active contestants write and remove only their own current-generation activity", async () => {
    await seedRoom();
    const player = anonymousDatabase("player");
    const ownActivity = player.ref(`${ACTIVITY_PATH}/player`);

    await assertSucceeds(ownActivity.remove());
    await assertSucceeds(ownActivity.remove());
    await assertSucceeds(
      ownActivity.set(activity({ source: "print(2)" })),
    );
    await assertFails(
      player.ref(`${ACTIVITY_PATH}/peer`).set(activity({ source: "print(3)" })),
    );
    await assertFails(
      player
        .ref(`raceActivity/${ROOM_CODE}/${CREATED_AT + 1}/player`)
        .set(activity({ source: "print(4)" })),
    );
    await assertSucceeds(ownActivity.remove());
  });

  it("rejects activity outside an active contest or after spectator assignment", async () => {
    await seedRoom(room({ status: "lobby", includeSpectator: true }));
    await assertFails(
      anonymousDatabase("player").ref(`${ACTIVITY_PATH}/player`).set(activity()),
    );

    await seedRoom({
      ...room({ includePlayer: false, includeSpectator: true }),
      spectators: {
        spectator: spectator("spectator", "Spectator"),
        player: spectator("player", "Player"),
      },
      progress: {
        peer: progress(5),
        player: progress(5),
      },
    });
    await assertFails(
      anonymousDatabase("player").ref(`${ACTIVITY_PATH}/player`).set(activity()),
    );
  });

  it("hides activity after finish while allowing contestants to delete but not update their own record", async () => {
    await seedRoom(room({ status: "finished", includeSpectator: true }));
    const host = anonymousDatabase("host");
    const currentSpectator = anonymousDatabase("spectator");
    const playerActivity = anonymousDatabase("player").ref(`${ACTIVITY_PATH}/player`);

    await assertFails(host.ref(ACTIVITY_PATH).once("value"));
    await assertFails(currentSpectator.ref(ACTIVITY_PATH).once("value"));
    await assertFails(playerActivity.set(activity({ source: "print('changed')" })));
    await assertSucceeds(playerActivity.remove());
  });

  it("strictly validates activity payload shape and size", async () => {
    await seedRoom();
    const target = anonymousDatabase("player").ref(`${ACTIVITY_PATH}/player`);

    await assertFails(target.set(activity({ problemId: "" })));
    await assertFails(target.set(activity({ problemId: "x".repeat(101) })));
    await assertFails(target.set({ ...activity(), phase: "finished" }));
    await assertFails(target.set(activity({ source: "x".repeat(50_001) })));
    await assertFails(target.set({ ...activity(), extra: true }));
    await assertFails(target.set({ ...activity(), updatedAt: "later" }));
  });

  it("shows accepted submissions only to the host and current spectators", async () => {
    await seedRoom();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .database()
        .ref(`${SUBMISSION_PATH}/player/v5-example`)
        .set(submission());
    });

    await assertSucceeds(anonymousDatabase("host").ref(SUBMISSION_PATH).once("value"));
    await assertSucceeds(anonymousDatabase("spectator").ref(SUBMISSION_PATH).once("value"));
    await assertFails(anonymousDatabase("player").ref(SUBMISSION_PATH).once("value"));
    await assertFails(anonymousDatabase("outsider").ref(SUBMISSION_PATH).once("value"));
  });

  it("lets active contestants publish only their own immutable accepted submissions", async () => {
    await seedRoom();
    const player = anonymousDatabase("player");
    const target = player.ref(`${SUBMISSION_PATH}/player/v5-example`);

    await assertSucceeds(target.set(submission()));
    await assertFails(target.set(submission({ source: "print('changed')" })));
    await assertFails(
      player.ref(`${SUBMISSION_PATH}/peer/v5-example`).set(submission()),
    );
    await assertFails(
      player
        .ref(`raceSubmissions/${ROOM_CODE}/${CREATED_AT + 1}/player/v5-example`)
        .set(submission()),
    );
  });

  it("validates accepted submissions and keeps unlimited history Google-gated", async () => {
    await seedRoom(room({ unlimited: true, includeSpectator: true }));
    const anonymousTarget = anonymousDatabase("player").ref(
      `${SUBMISSION_PATH}/player/v5-example`,
    );
    const googleTarget = googleDatabase("player").ref(
      `${SUBMISSION_PATH}/player/v5-example`,
    );

    await assertFails(anonymousTarget.set(submission()));
    await assertFails(googleTarget.set(submission({ problemId: "other" })));
    await assertFails(googleTarget.set(submission({ source: "x".repeat(50_001) })));
    await assertFails(googleTarget.set({ ...submission(), extra: true }));
    await assertSucceeds(googleTarget.set(submission()));
    await assertFails(anonymousDatabase("spectator").ref(SUBMISSION_PATH).once("value"));
    await assertSucceeds(googleDatabase("spectator").ref(SUBMISSION_PATH).once("value"));
  });

  it("accepts a server-timestamped submission when a live room has a future start timestamp", async () => {
    const futureStartedAt = Date.now() + 60_000;
    await seedRoom(
      room({
        unlimited: true,
        startedAt: futureStartedAt,
      }),
    );
    const target = googleDatabase("player").ref(
      `raceSubmissions/${ROOM_CODE}/${futureStartedAt}/player/v5-example`,
    );

    await assertSucceeds(
      target.set({
        problemId: "v5-example",
        source: "print('accepted')",
        acceptedAt: { ".sv": "timestamp" },
      }),
    );
  });

  it("blocks accepted submissions outside an active race and lets the host clear history", async () => {
    await seedRoom(room({ status: "finished" }));
    await assertFails(
      anonymousDatabase("player")
        .ref(`${SUBMISSION_PATH}/player/v5-example`)
        .set(submission()),
    );

    await seedRoom();
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await context
        .database()
        .ref(`${SUBMISSION_PATH}/player/v5-example`)
        .set(submission());
    });
    await assertSucceeds(anonymousDatabase("host").ref(SUBMISSION_PATH).remove());
  });

  it("lets the host delete an activity generation or the whole room activity tree", async () => {
    await seedRoom();
    const host = anonymousDatabase("host");

    await assertSucceeds(host.ref(ACTIVITY_PATH).remove());
    await seedRoom();
    await assertSucceeds(host.ref(`raceActivity/${ROOM_CODE}`).remove());
  });

  it("lets the host delete one contestant's activity while preserving sibling activity", async () => {
    await seedRoom();
    const host = anonymousDatabase("host");

    await assertSucceeds(host.ref(`${ACTIVITY_PATH}/player`).remove());
    const remaining = await assertSucceeds(host.ref(ACTIVITY_PATH).once("value"));
    expect(remaining.child("player").exists()).toBe(false);
    expect(remaining.child("peer").val()).toEqual(activity({ problemId: "v5-peer" }));
  });

  it("supports atomic contestant joins in lobby and active rooms", async () => {
    await seedRoom(room({ status: "lobby", includePlayer: false }), {});
    const player = anonymousDatabase("player");

    await assertSucceeds(
      player.ref(ROOM_PATH).update({
        "leaderboard/player": contestant("player", "Player"),
        "progress/player": progress(),
      }),
    );

    await seedRoom(room({ status: "active", includePlayer: false }), {});
    await assertSucceeds(
      player.ref(ROOM_PATH).update({
        "leaderboard/player": contestant("player", "Player"),
        "progress/player": progress(),
      }),
    );
  });

  it("blocks fresh contestants from finished rooms", async () => {
    await seedRoom(room({ status: "finished", includePlayer: false }), {});
    const player = anonymousDatabase("player");

    await assertFails(
      player.ref(ROOM_PATH).update({
        "leaderboard/player": contestant("player", "Player"),
        "progress/player": progress(),
      }),
    );
  });

  it("requires Google authentication for late joins to active unlimited rooms", async () => {
    await seedRoom(room({ status: "active", unlimited: true, includePlayer: false }), {});
    const updates = {
      "leaderboard/player": contestant("player", "Player"),
      "progress/player": progress(),
    };

    await assertFails(anonymousDatabase("player").ref(ROOM_PATH).update(updates));
    await assertSucceeds(googleDatabase("player").ref(ROOM_PATH).update(updates));
  });

  it("lets unlimited room members go offline without deleting roles or progress", async () => {
    const savedProgress = {
      ...progress(4),
      score: 725,
      solvedCount: 2,
      solved: { "v5-one": CREATED_AT + 100, "v5-two": CREATED_AT + 200 },
    };
    const unlimitedRoom = room({ unlimited: true, includeSpectator: true });
    unlimitedRoom.progress.player = savedProgress;
    unlimitedRoom.leaderboard.player.score = savedProgress.score;
    unlimitedRoom.leaderboard.player.correctCount = savedProgress.solvedCount;
    await seedRoom(unlimitedRoom);

    await assertSucceeds(
      googleDatabase("player").ref(`${ROOM_PATH}/leaderboard/player/online`).set(false),
    );
    await assertSucceeds(
      googleDatabase("spectator").ref(`${ROOM_PATH}/spectators/spectator/online`).set(false),
    );
    await assertSucceeds(
      googleDatabase("host").ref(`${ROOM_PATH}/meta/hostOnline`).set(false),
    );

    const savedRoom = await assertSucceeds(
      googleDatabase("host").ref(ROOM_PATH).once("value"),
    );
    expect(savedRoom.child("leaderboard/player/online").val()).toBe(false);
    expect(savedRoom.child("spectators/spectator/online").val()).toBe(false);
    expect(savedRoom.child("meta/hostOnline").val()).toBe(false);
    expect(savedRoom.child("progress/player").val()).toEqual(savedProgress);

    await assertSucceeds(
      googleDatabase("player").ref(`${ROOM_PATH}/leaderboard/player/online`).set(true),
    );
    const resumedProgress = await assertSucceeds(
      googleDatabase("player").ref(`${ROOM_PATH}/progress/player`).once("value"),
    );
    expect(resumedProgress.val()).toEqual(savedProgress);
  });

  it("lets only the host assign spectators while spectators can only change online state", async () => {
    await seedRoom();
    const host = anonymousDatabase("host");
    const player = anonymousDatabase("player");

    await assertFails(
      player.ref(`${ROOM_PATH}/spectators/player`).set(spectator("player", "Player")),
    );
    await assertSucceeds(
      host.ref(ROOM_PATH).update({
        "spectators/player": spectator("player", "Player"),
        "leaderboard/player": null,
        "progress/player": null,
      }),
    );

    const currentSpectator = anonymousDatabase("spectator");
    await assertSucceeds(currentSpectator.ref(`${ROOM_PATH}/spectators/spectator/online`).set(false));
    await assertFails(
      currentSpectator.ref(`${ROOM_PATH}/spectators/spectator/nickname`).set("Changed"),
    );
    await assertFails(currentSpectator.ref(`${ROOM_PATH}/spectators/player`).remove());
    await assertSucceeds(currentSpectator.ref(`${ROOM_PATH}/spectators/spectator`).remove());
    await assertSucceeds(host.ref(`${ROOM_PATH}/spectators/player`).remove());
  });

  it("lets the host atomically return a spectator to the contestant roster", async () => {
    await seedRoom();
    const host = anonymousDatabase("host");
    const returningPlayer = {
      ...contestant("spectator", "Spectator"),
      ready: false,
    };
    const returningProgress = progress();

    await assertSucceeds(
      host.ref(ROOM_PATH).update({
        "leaderboard/spectator": returningPlayer,
        "progress/spectator": returningProgress,
        "spectators/spectator": null,
      }),
    );

    const updatedRoom = await assertSucceeds(host.ref(ROOM_PATH).once("value"));
    const { lastAcceptedAt, ...persistedReturningPlayer } = returningPlayer;
    const { solved, ...persistedReturningProgress } = returningProgress;
    expect(lastAcceptedAt).toBeNull();
    expect(solved).toEqual({});
    expect(updatedRoom.child("spectators/spectator").exists()).toBe(false);
    expect(updatedRoom.child("leaderboard/spectator").val()).toEqual(persistedReturningPlayer);
    expect(updatedRoom.child("progress/spectator").val()).toEqual(persistedReturningProgress);

    const promoted = anonymousDatabase("spectator");
    await assertSucceeds(
      promoted.ref(`${ROOM_PATH}/leaderboard/spectator/online`).set(false),
    );
    await assertSucceeds(
      promoted.ref(`${ACTIVITY_PATH}/spectator`).set(activity()),
    );
    await assertFails(promoted.ref(ACTIVITY_PATH).once("value"));
  });

  it("blocks stale contestant writes after spectator assignment", async () => {
    await seedRoom({
      ...room({ includeSpectator: true }),
      spectators: {
        spectator: spectator("spectator", "Spectator"),
        player: spectator("player", "Player"),
      },
    });
    const player = anonymousDatabase("player");

    await assertFails(player.ref(`${ROOM_PATH}/leaderboard/player/score`).set(50));
    await assertFails(player.ref(`${ROOM_PATH}/progress/player/score`).set(50));
    await assertFails(
      player.ref(`${ROOM_PATH}/events/stale-event`).set({
        uid: "player",
        message: "Still racing",
        tone: "good",
        createdAt: CREATED_AT + 9_000,
      }),
    );
    await assertFails(player.ref(`${ROOM_PATH}/meta/status`).set("finished"));
  });

  it("preserves normal contestant score, event, and timed-finish writes", async () => {
    await seedRoom();
    const player = anonymousDatabase("player");

    await assertSucceeds(player.ref(`${ROOM_PATH}/leaderboard/player/score`).set(50));
    await assertSucceeds(player.ref(`${ROOM_PATH}/progress/player/score`).set(50));
    await assertSucceeds(
      player.ref(`${ROOM_PATH}/events/player-event`).set({
        uid: "player",
        message: "Solved one",
        tone: "good",
        createdAt: CREATED_AT + 9_000,
      }),
    );
    await assertSucceeds(player.ref(`${ROOM_PATH}/meta/status`).set("finished"));
  });

  it("allows challenge completion only while both racers remain contestants", async () => {
    const finishedChallenge = {
      ...challenge("active"),
      status: "finished",
      finishedAt: CREATED_AT + 6_000,
      winnerUid: "peer",
    };

    await seedRoom(room({ activeChallenge: true }));
    await assertSucceeds(
      anonymousDatabase("peer").ref(`${ROOM_PATH}/challenge`).set(finishedChallenge),
    );

    await seedRoom({
      ...room({ activeChallenge: true }),
      spectators: { player: spectator("player", "Player") },
    });
    await assertFails(
      anonymousDatabase("peer").ref(`${ROOM_PATH}/challenge`).set(finishedChallenge),
    );
  });

  it("keeps a finished challenge reserved until the host retires it", async () => {
    const replacement = {
      ...challenge("waiting"),
      id: "challenge-2",
      createdAt: CREATED_AT + 7_000,
    };
    await seedRoom({
      ...room(),
      challenge: challenge("finished"),
    });

    await assertFails(
      anonymousDatabase("player")
        .ref(`${ROOM_PATH}/challenge`)
        .set(replacement),
    );
    await assertFails(
      anonymousDatabase("host")
        .ref(`${ROOM_PATH}/challenge`)
        .set(replacement),
    );
    await assertSucceeds(
      anonymousDatabase("host").ref(`${ROOM_PATH}/challenge`).remove(),
    );
    await assertSucceeds(
      anonymousDatabase("player")
        .ref(`${ROOM_PATH}/challenge`)
        .set(replacement),
    );
  });
});
