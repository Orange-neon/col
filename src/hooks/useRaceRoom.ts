import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAdaptiveProfiles,
  normalizeAdaptiveProfile,
  updateAdaptiveProfile,
} from "../data/adaptiveLearning";
import {
  filterProblemBankByTopics,
  parseTopicSelection,
  serializeTopicSelection,
  type CurriculumTopicId,
} from "../data/curriculum";
import { DIFFICULTY_CONFIG } from "../data/difficulty";
import { loadProblemBank } from "../data/problemBank";
import { getProblemReward } from "../data/problemProgression";
import type { Problem, ProblemBank } from "../data/problemTypes";
import { BOMB_PENALTY, DOUBLE_MULTIPLIER } from "../data/timedProblems";
import {
  getFirebaseContext,
  isFirebaseConfigured,
  observeGoogleUser,
  signInWithGoogle,
  signOutFirebase,
  type GoogleUserProfile,
} from "../lib/firebase";
import { sortRoomPlayers } from "../lib/raceLogic";
import { CHALLENGER_WIN_PRIZE, getChallengeScoreDelta } from "../lib/challengeLogic";
import { generateRoomCode, isRoomCode, normalizeRoomCode } from "../lib/roomCode";
import {
  clearActiveRoomSession,
  getRaceRoomSession,
  readActiveRoomSession,
  subscribeActiveRoomSession,
  writeRaceRoomSession,
} from "../lib/roomSession";
import type {
  PlayerProgress,
  RaceActivity,
  RoomChallenge,
  RoomMeta,
  RoomPlayer,
  RoomSpectator,
  RoomSession,
} from "../types/multiplayer";
import type { RaceEvent } from "../types/race";

const EMPTY_PROGRESS: PlayerProgress = {
  score: 0,
  solvedCount: 0,
  currentStreak: 0,
  solved: {},
  adaptive: createAdaptiveProfiles(),
  challengeAwards: {},
};

function normalizeProgress(value: PlayerProgress | null): PlayerProgress {
  const progress = value ?? EMPTY_PROGRESS;
  return {
    ...progress,
    currentStreak: Math.max(0, Number(progress.currentStreak) || 0),
    solved: progress.solved ?? {},
    challengeAwards: progress.challengeAwards ?? {},
    adaptive: {
      easy: normalizeAdaptiveProfile(progress.adaptive?.easy),
      medium: normalizeAdaptiveProfile(progress.adaptive?.medium),
      hard: normalizeAdaptiveProfile(progress.adaptive?.hard),
    },
  };
}

function readSession(): RoomSession | null {
  return getRaceRoomSession(readActiveRoomSession());
}

function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hasGoogleProvider(user: { providerData: Array<{ providerId: string }> }): boolean {
  return user.providerData.some((provider) => provider.providerId === "google.com");
}

export function useRaceRoom(bank: ProblemBank) {
  const [session, setSessionState] = useState<RoomSession | null>(readSession);
  const [authUser, setAuthUser] = useState<GoogleUserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [meta, setMeta] = useState<RoomMeta | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [spectators, setSpectators] = useState<RoomSpectator[]>([]);
  const [activities, setActivities] = useState<Record<string, RaceActivity>>({});
  const [activityError, setActivityError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PlayerProgress>(EMPTY_PROGRESS);
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [challenge, setChallenge] = useState<RoomChallenge | null>(null);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const serverOffsetRef = useRef(0);

  const saveSession = useCallback((next: RoomSession | null) => {
    setSessionState(next);
    if (next) writeRaceRoomSession(next);
    else clearActiveRoomSession("race");
  }, []);

  useEffect(
    () =>
      subscribeActiveRoomSession((activeSession) => {
        setSessionState(getRaceRoomSession(activeSession));
      }),
    [],
  );

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAuthLoading(false);
      return;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const fallbackId = window.setTimeout(() => {
      if (!cancelled) setAuthLoading(false);
    }, 2_000);
    observeGoogleUser((user) => {
      if (cancelled) return;
      window.clearTimeout(fallbackId);
      setAuthUser(user);
      setAuthLoading(false);
    })
      .then((cleanup) => {
        if (cancelled) cleanup();
        else unsubscribe = cleanup;
      })
      .catch(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallbackId);
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async () => {
    const user = await signInWithGoogle();
    setAuthUser(user);
  }, []);

  const signOut = useCallback(async () => {
    saveSession(null);
    await signOutFirebase();
    setAuthUser(null);
  }, [saveSession]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      if (session) saveSession(null);
      setLoading(false);
      return;
    }
    if (!session) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let cleanups: Array<() => void> = [];
    setLoading(true);
    setProgressLoaded(false);
    setError(null);

    getFirebaseContext()
      .then(({ database, user, db }) => {
        if (cancelled) return;
        const { limitToLast, off, onValue, orderByChild, query, ref } = db;
        if (user.uid !== session.uid) {
          saveSession(null);
          throw new Error("This room session belongs to a different browser identity.");
        }

        const roomRef = ref(database, `rooms/${session.code}`);
        const metaRef = ref(database, `rooms/${session.code}/meta`);
        const leaderboardRef = ref(database, `rooms/${session.code}/leaderboard`);
        const spectatorsRef = ref(database, `rooms/${session.code}/spectators`);
        const progressRef = ref(database, `rooms/${session.code}/progress/${session.uid}`);
        const challengeRef = ref(database, `rooms/${session.code}/challenge`);
        const eventsRef = query(
          ref(database, `rooms/${session.code}/events`),
          orderByChild("createdAt"),
          limitToLast(25),
        );
        const offsetRef = ref(database, ".info/serverTimeOffset");
        const connectedRef = ref(database, ".info/connected");
        let initialMeta: RoomMeta | null | undefined;
        let initialLeaderboard: Record<string, RoomPlayer> | undefined;
        let initialSpectators: Record<string, RoomSpectator> | undefined;
        let initialProgressReady = false;
        let initialResolved = false;
        const resolveInitialSession = () => {
          if (
            initialResolved ||
            initialMeta === undefined ||
            initialLeaderboard === undefined ||
            initialSpectators === undefined
          ) {
            return;
          }
          initialResolved = true;
          if (!initialMeta) {
            saveSession(null);
            return;
          }
          if (session.role === "host") {
            if (initialMeta.hostUid !== session.uid) {
              saveSession(null);
              return;
            }
            setLoading(false);
            return;
          }
          const spectator = initialSpectators[session.uid];
          if (spectator) {
            if (session.role !== "spectator") {
              saveSession({
                code: session.code,
                uid: session.uid,
                role: "spectator",
                nickname: spectator.nickname,
              });
            } else {
              setLoading(false);
            }
            return;
          }
          const player = initialLeaderboard[session.uid];
          if (player) {
            if (!initialProgressReady) {
              initialResolved = false;
              return;
            }
            if (session.role !== "player") {
              saveSession({
                code: session.code,
                uid: session.uid,
                role: "player",
                nickname: player.nickname,
              });
            } else {
              setLoading(false);
            }
            return;
          }
          saveSession(null);
        };

        cleanups = [
          onValue(metaRef, (snapshot) => {
            if (!snapshot.exists()) {
              initialMeta = null;
              saveSession(null);
              setError("This room has been closed.");
              return;
            }
            const value = snapshot.val() as RoomMeta;
            initialMeta = value;
            setMeta(value);
            resolveInitialSession();
          }),
          onValue(leaderboardRef, (snapshot) => {
            const value = (snapshot.val() ?? {}) as Record<string, RoomPlayer>;
            initialLeaderboard = value;
            setPlayers(Object.values(value));
            resolveInitialSession();
          }),
          onValue(spectatorsRef, (snapshot) => {
            const value = (snapshot.val() ?? {}) as Record<string, RoomSpectator>;
            initialSpectators = value;
            const nextSpectators = Object.values(value);
            setSpectators(nextSpectators);
            const self = value[session.uid];
            if (initialResolved) {
              if (session.role === "player" && self) {
                saveSession({
                  code: session.code,
                  uid: session.uid,
                  role: "spectator",
                  nickname: self.nickname,
                });
              } else if (session.role === "spectator" && !self) {
                const player = initialLeaderboard?.[session.uid];
                saveSession(
                  player
                    ? {
                        code: session.code,
                        uid: session.uid,
                        role: "player",
                        nickname: player.nickname,
                      }
                    : null,
                );
              }
            }
            resolveInitialSession();
          }),
          onValue(progressRef, (snapshot) => {
            initialProgressReady = true;
            if (session.role === "player") {
              setProgress(normalizeProgress(snapshot.val() as PlayerProgress | null));
              setProgressLoaded(true);
            }
            resolveInitialSession();
          }),
          onValue(challengeRef, (snapshot) => {
            setChallenge(snapshot.exists() ? (snapshot.val() as RoomChallenge) : null);
          }),
          onValue(eventsRef, (snapshot) => {
            const value = (snapshot.val() ?? {}) as Record<string, Omit<RaceEvent, "id">>;
            setEvents(
              Object.entries(value)
                .map(([id, item]) => ({ id, ...item }))
                .sort((a, b) => b.createdAt - a.createdAt),
            );
          }),
          onValue(offsetRef, (snapshot) => {
            serverOffsetRef.current = snapshot.val() ?? 0;
          }),
          onValue(connectedRef, (snapshot) => {
            setConnected(snapshot.val() === true);
          }),
        ];

        cleanups.push(() => off(roomRef));
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [saveSession, session]);

  useEffect(() => {
    if (!connected || !session || !meta) return;
    let cancelled = false;
    let disconnect:
      | {
          cancel: () => Promise<void>;
          set: (value: unknown) => Promise<void>;
        }
      | undefined;
    getFirebaseContext()
      .then(async ({ database, db }) => {
        if (cancelled) return;
        const presenceRef =
          session.role === "host"
            ? db.ref(database, `rooms/${session.code}/meta/hostOnline`)
            : session.role === "spectator"
              ? db.ref(database, `rooms/${session.code}/spectators/${session.uid}/online`)
              : db.ref(database, `rooms/${session.code}/leaderboard/${session.uid}/online`);
        await db.set(presenceRef, true);
        if (cancelled) return;
        disconnect = db.onDisconnect(presenceRef);
        await disconnect.set(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void disconnect?.cancel().catch(() => undefined);
    };
  }, [connected, meta?.createdAt, session]);

  useEffect(() => {
    if (
      !session ||
      !meta ||
      meta.status !== "active" ||
      (session.role !== "host" && session.role !== "spectator")
    ) {
      setActivities({});
      setActivityError(null);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    getFirebaseContext()
      .then(({ database, db }) => {
        if (cancelled) return;
        setActivityError(null);
        const activityRef = db.ref(
          database,
          `raceActivity/${session.code}/${meta.createdAt}`,
        );
        unsubscribe = db.onValue(
          activityRef,
          (snapshot) => {
            setActivities((snapshot.val() ?? {}) as Record<string, RaceActivity>);
            setActivityError(null);
          },
          () => {
            setActivities({});
            setActivityError(
              "Live code monitoring is unavailable. Publish the included Firebase database rules, then reconnect.",
            );
          },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setActivities({});
          setActivityError("Live code monitoring could not connect.");
        }
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [meta?.createdAt, meta?.status, session]);

  useEffect(() => {
    if (!connected || !session || session.role !== "player" || !meta) return;
    let cancelled = false;
    let disconnect:
      | {
          cancel: () => Promise<void>;
          remove: () => Promise<void>;
        }
      | undefined;
    getFirebaseContext()
      .then(({ database, db }) => {
        if (cancelled) return;
        const activityRef = db.ref(
          database,
          `raceActivity/${session.code}/${meta.createdAt}/${session.uid}`,
        );
        disconnect = db.onDisconnect(activityRef);
        void disconnect.remove().catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      void disconnect?.cancel().catch(() => undefined);
    };
  }, [connected, meta?.createdAt, session]);

  useEffect(() => {
    if (!session || session.role !== "player" || !progressLoaded || !meta) return;
    const player = players.find((item) => item.uid === session.uid);
    if (
      !player ||
      (player.score === progress.score && player.correctCount === progress.solvedCount)
    ) {
      return;
    }

    let cancelled = false;
    getFirebaseContext()
      .then(({ database, db }) =>
        db.update(db.ref(database, `rooms/${session.code}/leaderboard/${session.uid}`), {
          score: progress.score,
          correctCount: progress.solvedCount,
        }),
      )
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [meta, players, progress.score, progress.solvedCount, progressLoaded, session]);

  const addEvent = useCallback(
    async (message: string, tone: RaceEvent["tone"] = "neutral") => {
      if (!session) return;
      const { database, user, db } = await getFirebaseContext();
      const { push, ref, set } = db;
      await set(push(ref(database, `rooms/${session.code}/events`)), {
        uid: user.uid,
        message,
        tone,
        createdAt: Date.now() + serverOffsetRef.current,
      });
    },
    [session],
  );

  const createRoom = useCallback(
    async (topicIds: CurriculumTopicId[], durationMinutes = 30): Promise<RoomSession> => {
      const scopedBank = filterProblemBankByTopics(bank, topicIds);
      if (!scopedBank.problems.length) {
        throw new Error("Choose at least one topic that has available challenges.");
      }
      const { database, user, db } = await getFirebaseContext();
      const { ref, runTransaction } = db;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const code = generateRoomCode();
        const roomRef = ref(database, `rooms/${code}`);
        const now = Date.now() + serverOffsetRef.current;
        const result = await runTransaction(
          roomRef,
          (current) =>
            current === null
              ? {
                  meta: {
                    hostUid: user.uid,
                    hostOnline: true,
                    status: "lobby",
                    bankVersion: bank.version,
                    topicIds: serializeTopicSelection(topicIds),
                    problemCount: scopedBank.problems.length,
                    durationSeconds: durationMinutes * 60,
                    unlimited: false,
                    createdAt: now,
                    startedAt: null,
                    endsAt: null,
                    endedAt: null,
                    endReason: null,
                  },
                }
              : undefined,
          { applyLocally: false },
        );
        if (result.committed) {
          const next = { code, uid: user.uid, role: "host" as const };
          saveSession(next);
          return next;
        }
      }
      throw new Error("Could not reserve a room code. Please try again.");
    },
    [bank, saveSession],
  );

  const joinRoom = useCallback(
    async (rawCode: string, rawNickname: string): Promise<RoomSession> => {
      const code = normalizeRoomCode(rawCode);
      const nickname = rawNickname.trim().replace(/\s+/g, " ");
      if (!isRoomCode(code)) throw new Error("Enter a valid six-character room code.");

      const { database, user, db } = await getFirebaseContext();
      const { get, push, ref, set, update } = db;
      const roomRef = ref(database, `rooms/${code}`);
      const snapshot = await get(roomRef).catch((reason) => {
        if (!hasGoogleProvider(user)) {
          throw new Error("Sign in with Google to join an unlimited room, or check the room code.");
        }
        throw reason;
      });
      if (!snapshot.exists()) throw new Error("Room not found.");
      const room = snapshot.val() as {
        meta: RoomMeta;
        leaderboard?: Record<string, RoomPlayer>;
        spectators?: Record<string, RoomSpectator>;
      };
      if (room.meta.unlimited && !hasGoogleProvider(user)) {
        throw new Error("Sign in with Google to join unlimited rooms.");
      }
      const roomBank = await loadProblemBank(room.meta.bankVersion).catch(() => {
        throw new Error(`This build does not include problem bank ${room.meta.bankVersion}.`);
      });
      const selectedTopics = parseTopicSelection(room.meta.topicIds);
      const scopedBank = selectedTopics
        ? filterProblemBankByTopics(roomBank, selectedTopics)
        : roomBank;
      if (!scopedBank.problems.length || scopedBank.problems.length !== room.meta.problemCount) {
        throw new Error("This room's topic selection is not compatible with this build.");
      }
      const existingPlayers = Object.values(room.leaderboard ?? {});
      const existingSpectators = Object.values(room.spectators ?? {});
      if (room.meta.hostUid === user.uid) {
        const next = { code, uid: user.uid, role: "host" as const };
        saveSession(next);
        return next;
      }
      const returningSpectator = room.spectators?.[user.uid];
      if (returningSpectator) {
        await update(roomRef, { [`spectators/${user.uid}/online`]: true });
        const next = {
          code,
          uid: user.uid,
          role: "spectator" as const,
          nickname: returningSpectator.nickname,
        };
        saveSession(next);
        return next;
      }
      const returningPlayer = room.leaderboard?.[user.uid];
      if (returningPlayer) {
        await update(roomRef, { [`leaderboard/${user.uid}/online`]: true });
        const next = {
          code,
          uid: user.uid,
          role: "player" as const,
          nickname: returningPlayer.nickname,
        };
        saveSession(next);
        return next;
      }
      if (room.meta.status !== "lobby") {
        throw new Error("This race has already started. Only returning participants can resume it.");
      }
      if (nickname.length < 2 || nickname.length > 20) {
        throw new Error("Nickname must be between 2 and 20 characters.");
      }
      if (existingPlayers.length + existingSpectators.length >= 30) {
        throw new Error("That room is full.");
      }
      const normalizedNickname = normalizeNickname(nickname);
      if (
        [...existingPlayers, ...existingSpectators].some(
          (participant) =>
            participant.uid !== user.uid &&
            participant.normalizedNickname === normalizedNickname,
        )
      ) {
        throw new Error("That nickname is already in the room.");
      }

      const now = Date.now() + serverOffsetRef.current;
      const player: RoomPlayer = {
        uid: user.uid,
        nickname,
        normalizedNickname,
        score: 0,
        correctCount: 0,
        joinedAt: now,
        lastAcceptedAt: null,
        online: true,
        ready: false,
      };
      await update(roomRef, {
        [`leaderboard/${user.uid}`]: player,
        [`progress/${user.uid}`]: EMPTY_PROGRESS,
      });
      const next = { code, uid: user.uid, role: "player" as const, nickname };
      saveSession(next);
      await set(push(ref(database, `rooms/${code}/events`)), {
        uid: user.uid,
        message: `${nickname} joined the room`,
        tone: "neutral",
        createdAt: now,
      });
      return next;
    },
    [bank.version, saveSession],
  );

  const setReady = useCallback(
    async (ready: boolean) => {
      if (!session || session.role !== "player") return;
      const { database, db } = await getFirebaseContext();
      const { ref, set } = db;
      await set(ref(database, `rooms/${session.code}/leaderboard/${session.uid}/ready`), ready);
    },
    [session],
  );

  const publishActivity = useCallback(
    async (activity: Omit<RaceActivity, "updatedAt"> | null) => {
      if (!session || session.role !== "player" || !meta) return;
      const { database, db } = await getFirebaseContext();
      const activityRef = db.ref(
        database,
        `raceActivity/${session.code}/${meta.createdAt}/${session.uid}`,
      );
      if (!activity) {
        await db.remove(activityRef);
        return;
      }
      if (meta.status !== "active") return;
      await db.set(activityRef, {
        ...activity,
        source: activity.source.slice(0, 50_000),
        updatedAt: Date.now() + serverOffsetRef.current,
      } satisfies RaceActivity);
    },
    [meta?.createdAt, meta?.status, session],
  );

  const makeSpectator = useCallback(
    async (uid: string) => {
      if (!session || session.role !== "host" || !meta) return;
      const player = players.find((item) => item.uid === uid);
      if (!player) throw new Error("That contestant is no longer in the race.");
      const now = Date.now() + serverOffsetRef.current;
      const spectator: RoomSpectator = {
        uid: player.uid,
        nickname: player.nickname,
        normalizedNickname: player.normalizedNickname,
        joinedAt: player.joinedAt,
        assignedAt: now,
        online: player.online,
      };
      const roomPath = `rooms/${session.code}`;
      const updates: Record<string, unknown> = {
        [`${roomPath}/spectators/${uid}`]: spectator,
        [`${roomPath}/leaderboard/${uid}`]: null,
        [`${roomPath}/progress/${uid}`]: null,
        [`raceActivity/${session.code}/${meta.createdAt}/${uid}`]: null,
      };
      if (
        challenge &&
        (challenge.challengerUid === uid || challenge.championUid === uid)
      ) {
        updates[`${roomPath}/challenge/status`] = "finished";
        updates[`${roomPath}/challenge/finishedAt`] = now;
        updates[`${roomPath}/challenge/winnerUid`] = null;
      }
      if (meta.status === "active" && players.length === 1) {
        updates[`${roomPath}/meta/status`] = "finished";
        updates[`${roomPath}/meta/endedAt`] = now;
        updates[`${roomPath}/meta/endReason`] = "host";
      }
      const { database, db } = await getFirebaseContext();
      await db.update(db.ref(database), updates);
      await db.runTransaction(
        db.ref(database, `${roomPath}/challenge`),
        (current: RoomChallenge | null) => {
          if (
            !current ||
            current.status === "finished" ||
            (current.challengerUid !== uid && current.championUid !== uid)
          ) {
            return undefined;
          }
          return {
            ...current,
            status: "finished",
            finishedAt: now,
            winnerUid: null,
          };
        },
      );
      await addEvent(`${player.nickname} is now a spectator`, "neutral").catch(
        () => undefined,
      );
    },
    [addEvent, challenge, meta, players, session],
  );

  const setDuration = useCallback(
    async (minutes: number) => {
      if (!session || session.role !== "host") return;
      const { database, db } = await getFirebaseContext();
      const { ref, set } = db;
      await set(
        ref(database, `rooms/${session.code}/meta/durationSeconds`),
        Math.min(120, Math.max(1, Math.round(minutes))) * 60,
      );
    },
    [session],
  );

  const setUnlimited = useCallback(
    async (unlimited: boolean) => {
      if (!session || session.role !== "host" || meta?.status !== "lobby") return;
      if (unlimited && !authUser) {
        const user = await signInWithGoogle();
        setAuthUser(user);
      }
      const { database, user, db } = await getFirebaseContext({ requireGoogle: unlimited });
      if (unlimited && user.uid !== session.uid) {
        saveSession(null);
        throw new Error("This Google account cannot manage the current room. Create a new room after signing in.");
      }
      await db.set(db.ref(database, `rooms/${session.code}/meta/unlimited`), unlimited);
    },
    [authUser, meta?.status, saveSession, session],
  );

  const startRace = useCallback(async () => {
    if (!session || session.role !== "host" || !meta) return;
    const { database, user, db } = await getFirebaseContext({ requireGoogle: Boolean(meta.unlimited) });
    if (meta.unlimited && user.uid !== session.uid) {
      throw new Error("Sign in with the room host account to start an unlimited room.");
    }
    const { ref, update } = db;
    const now = Date.now() + serverOffsetRef.current;
    await update(ref(database, `rooms/${session.code}/meta`), {
      status: "active",
      startedAt: now,
      endsAt: meta.unlimited ? null : now + meta.durationSeconds * 1000,
      endedAt: null,
      endReason: null,
    });
    await addEvent("The host started the race", "good");
  }, [addEvent, meta, session]);

  const finishRace = useCallback(
    async (reason: "time" | "host" | "completed") => {
      if (
        !session ||
        session.role === "spectator" ||
        !meta ||
        meta.status !== "active"
      ) {
        return;
      }
      const { database, db } = await getFirebaseContext();
      const now = Date.now() + serverOffsetRef.current;
      if (session.role === "host") {
        await db.update(db.ref(database), {
          [`rooms/${session.code}/meta/status`]: "finished",
          [`rooms/${session.code}/meta/endedAt`]: now,
          [`rooms/${session.code}/meta/endReason`]: reason,
          [`raceActivity/${session.code}/${meta.createdAt}`]: null,
        });
      } else {
        await db
          .remove(
            db.ref(
              database,
              `raceActivity/${session.code}/${meta.createdAt}/${session.uid}`,
            ),
          )
          .catch(() => undefined);
        await db.update(db.ref(database, `rooms/${session.code}/meta`), {
          status: "finished",
          endedAt: now,
          endReason: reason,
        });
      }
    },
    [meta, session],
  );

  const recordSolve = useCallback(
    async (problem: Problem, multiplier = 1): Promise<number> => {
      if (!session || session.role !== "player" || meta?.status !== "active") {
        throw new Error("The race is not active.");
      }
      const { database, db } = await getFirebaseContext();
      const { ref, runTransaction, update } = db;
      const progressRef = ref(database, `rooms/${session.code}/progress/${session.uid}`);
      const points = getProblemReward(problem) * (multiplier === DOUBLE_MULTIPLIER ? DOUBLE_MULTIPLIER : 1);
      const now = Date.now() + serverOffsetRef.current;
      const result = await runTransaction(progressRef, (current: PlayerProgress | null) => {
        const value = normalizeProgress(current);
        if (value.solved?.[problem.id]) return undefined;
        return {
          ...value,
          score: value.score + points,
          solvedCount: value.solvedCount + 1,
          currentStreak: (value.currentStreak ?? 0) + 1,
          solved: { ...(value.solved ?? {}), [problem.id]: now },
          adaptive: {
            ...value.adaptive,
            [problem.difficulty]: updateAdaptiveProfile(
              value.adaptive?.[problem.difficulty],
              "solved",
            ),
          },
        };
      });
      if (!result.committed) return 0;
      const next = result.snapshot.val() as PlayerProgress;
      await update(ref(database, `rooms/${session.code}/leaderboard/${session.uid}`), {
        score: next.score,
        correctCount: next.solvedCount,
        lastAcceptedAt: now,
      });
      await addEvent(`${session.nickname} solved ${problem.title} (+${points})`, "good");
      const challengeRef = ref(database, `rooms/${session.code}/challenge`);
      await runTransaction(challengeRef, (current: RoomChallenge | null) => {
        if (
          !current ||
          current.status !== "waiting" ||
          current.championUid !== session.uid
        ) {
          return undefined;
        }
        return { ...current, status: "active", startedAt: now };
      });
      if (!meta.unlimited && next.solvedCount >= meta.problemCount) await finishRace("completed");
      return points;
    },
    [addEvent, finishRace, meta, session],
  );

  const recordForfeit = useCallback(
    async (problem: Problem) => {
      if (!session || session.role !== "player" || meta?.status !== "active") {
        throw new Error("The race is not active.");
      }
      const { database, db } = await getFirebaseContext();
      const { ref, runTransaction, update } = db;
      const progressRef = ref(database, `rooms/${session.code}/progress/${session.uid}`);
      const penalty = DIFFICULTY_CONFIG[problem.difficulty].penalty;
      const result = await runTransaction(progressRef, (current: PlayerProgress | null) => {
        const value = normalizeProgress(current);
        return {
          ...value,
          score: value.score - penalty,
          currentStreak: 0,
          adaptive: {
            ...value.adaptive,
            [problem.difficulty]: updateAdaptiveProfile(
              value.adaptive?.[problem.difficulty],
              "forfeited",
            ),
          },
        };
      });
      const next = result.snapshot.val() as PlayerProgress;
      await update(ref(database, `rooms/${session.code}/leaderboard/${session.uid}`), {
        score: next.score,
      });
      await addEvent(`${session.nickname} forfeited ${problem.title} (-${penalty})`, "bad");
    },
    [addEvent, meta, session],
  );

  const recordMiss = useCallback(
    async (problem: Problem) => {
      if (!session || session.role !== "player" || meta?.status !== "active") return;
      const { database, db } = await getFirebaseContext();
      const progressRef = db.ref(database, `rooms/${session.code}/progress/${session.uid}`);
      await db.runTransaction(progressRef, (current: PlayerProgress | null) => {
        const value = normalizeProgress(current);
        return {
          ...value,
          currentStreak: 0,
          adaptive: {
            ...value.adaptive,
            [problem.difficulty]: updateAdaptiveProfile(
              value.adaptive?.[problem.difficulty],
              "missed",
            ),
          },
        };
      });
    },
    [meta?.status, session],
  );

  const recordBombExpiry = useCallback(
    async (problem: Problem) => {
      if (!session || session.role !== "player" || meta?.status !== "active") return;
      const { database, db } = await getFirebaseContext();
      const progressRef = db.ref(database, `rooms/${session.code}/progress/${session.uid}`);
      const result = await db.runTransaction(progressRef, (current: PlayerProgress | null) => {
        const value = normalizeProgress(current);
        return {
          ...value,
          score: value.score - BOMB_PENALTY,
          currentStreak: 0,
          adaptive: {
            ...value.adaptive,
            [problem.difficulty]: updateAdaptiveProfile(
              value.adaptive?.[problem.difficulty],
              "forfeited",
            ),
          },
        };
      });
      const next = result.snapshot.val() as PlayerProgress;
      await db.update(db.ref(database, `rooms/${session.code}/leaderboard/${session.uid}`), {
        score: next.score,
      });
      await addEvent(`${session.nickname}'s ${problem.title} speed timer expired (-${BOMB_PENALTY})`, "bad");
    },
    [addEvent, meta?.status, session],
  );

  const requestChallenge = useCallback(
    async (difficulty: Problem["difficulty"]) => {
      if (!session || session.role !== "player" || !meta || meta.status !== "active") {
        throw new Error("Challenges are only available during an active room.");
      }
      if ((progress.currentStreak ?? 0) < 5) {
        throw new Error("Solve five problems in a row before issuing a challenge.");
      }
      const standings = sortRoomPlayers(players);
      const champion = standings[0];
      const challenger = standings.find((player) => player.uid === session.uid);
      if (!champion || !challenger || champion.uid === session.uid) {
        throw new Error("The first-place player cannot challenge themselves.");
      }

      const sourceBank = meta.bankVersion === bank.version ? bank : await loadProblemBank(meta.bankVersion);
      const selectedTopics = parseTopicSelection(meta.topicIds);
      const roomBank = selectedTopics
        ? filterProblemBankByTopics(sourceBank, selectedTopics)
        : sourceBank;
      const { database, db } = await getFirebaseContext();
      const championProgressSnapshot = await db.get(
        db.ref(database, `rooms/${session.code}/progress/${champion.uid}`),
      );
      const championProgress = normalizeProgress(
        championProgressSnapshot.val() as PlayerProgress | null,
      );
      const unavailable = new Set([
        ...Object.keys(progress.solved ?? {}),
        ...Object.keys(championProgress.solved ?? {}),
      ]);
      const candidates = roomBank.problems.filter(
        (problem) => problem.difficulty === difficulty && !unavailable.has(problem.id),
      );
      if (!candidates.length) throw new Error(`No shared unsolved ${difficulty} problem remains.`);
      const problem = candidates[Math.floor(Math.random() * candidates.length)];
      const now = Date.now() + serverOffsetRef.current;
      const nextChallenge: RoomChallenge = {
        id: crypto.randomUUID(),
        status: "waiting",
        challengerUid: challenger.uid,
        challengerName: challenger.nickname,
        championUid: champion.uid,
        championName: champion.nickname,
        difficulty,
        problemId: problem.id,
        problemReward: getProblemReward(problem),
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        winnerUid: null,
      };
      const result = await db.runTransaction(
        db.ref(database, `rooms/${session.code}/challenge`),
        (current: RoomChallenge | null) =>
          current === null || current.status === "finished" ? nextChallenge : undefined,
      );
      if (!result.committed) throw new Error("Another challenge is already pending.");
      await addEvent(
        `${challenger.nickname} challenged leader ${champion.nickname} to a ${difficulty} race`,
        "neutral",
      );
    },
    [addEvent, bank, meta, players, progress.currentStreak, progress.solved, session],
  );

  const recordChallengeSolve = useCallback(
    async (problem: Problem): Promise<number> => {
      if (
        !session ||
        session.role !== "player" ||
        !challenge ||
        challenge.status !== "active"
      ) {
        throw new Error("This challenge is no longer active.");
      }
      const { database, db } = await getFirebaseContext();
      const now = Date.now() + serverOffsetRef.current;
      const result = await db.runTransaction(
        db.ref(database, `rooms/${session.code}/challenge`),
        (current: RoomChallenge | null) => {
          if (
            !current ||
            current.status !== "active" ||
            current.problemId !== problem.id ||
            (current.challengerUid !== session.uid && current.championUid !== session.uid)
          ) {
            return undefined;
          }
          return { ...current, status: "finished", winnerUid: session.uid, finishedAt: now };
        },
      );
      if (!result.committed) throw new Error("The other racer finished first.");
      const prize =
        session.uid === challenge.challengerUid ? CHALLENGER_WIN_PRIZE : challenge.problemReward;
      await addEvent(`${session.nickname} won the head-to-head challenge (+${prize})`, "good");
      return prize;
    },
    [addEvent, challenge, session],
  );

  useEffect(() => {
    if (
      !session ||
      session.role !== "player" ||
      !challenge ||
      challenge.status !== "finished" ||
      !challenge.winnerUid ||
      (challenge.challengerUid !== session.uid && challenge.championUid !== session.uid) ||
      progress.challengeAwards?.[challenge.id] !== undefined
    ) {
      return;
    }
    const delta = getChallengeScoreDelta(challenge, session.uid, challenge.problemReward);
    let cancelled = false;
    getFirebaseContext()
      .then(async ({ database, db }) => {
        const progressRef = db.ref(database, `rooms/${session.code}/progress/${session.uid}`);
        const result = await db.runTransaction(progressRef, (current: PlayerProgress | null) => {
          const value = normalizeProgress(current);
          if (value.challengeAwards?.[challenge.id] !== undefined) return undefined;
          return {
            ...value,
            score: value.score + delta,
            challengeAwards: { ...(value.challengeAwards ?? {}), [challenge.id]: delta },
          };
        });
        if (!result.committed || cancelled) return;
        const next = result.snapshot.val() as PlayerProgress;
        await db.update(
          db.ref(database, `rooms/${session.code}/leaderboard/${session.uid}`),
          { score: next.score },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [challenge, progress.challengeAwards, session]);

  const rematch = useCallback(async () => {
    if (!session || session.role !== "host" || !meta) return;
    const { database, db } = await getFirebaseContext();
    const { ref, update } = db;
    const updates: Record<string, unknown> = {
      [`rooms/${session.code}/meta/status`]: "lobby",
      [`rooms/${session.code}/meta/startedAt`]: null,
      [`rooms/${session.code}/meta/endsAt`]: null,
      [`rooms/${session.code}/meta/endedAt`]: null,
      [`rooms/${session.code}/meta/endReason`]: null,
      [`rooms/${session.code}/challenge`]: null,
      [`rooms/${session.code}/events`]: null,
      [`raceActivity/${session.code}/${meta.createdAt}`]: null,
    };
    for (const player of players) {
      updates[`rooms/${session.code}/leaderboard/${player.uid}/score`] = 0;
      updates[`rooms/${session.code}/leaderboard/${player.uid}/correctCount`] = 0;
      updates[`rooms/${session.code}/leaderboard/${player.uid}/lastAcceptedAt`] = null;
      updates[`rooms/${session.code}/leaderboard/${player.uid}/ready`] = false;
      updates[`rooms/${session.code}/progress/${player.uid}`] = EMPTY_PROGRESS;
    }
    await update(ref(database), updates);
  }, [meta, players, session]);

  const leaveRoom = useCallback(async () => {
    const current = session;
    saveSession(null);
    setMeta(null);
    setPlayers([]);
    setSpectators([]);
    setActivities({});
    setActivityError(null);
    setProgress(EMPTY_PROGRESS);
    setProgressLoaded(false);
    setEvents([]);
    setChallenge(null);
    if (!current || !isFirebaseConfigured) return;
    const { database, db } = await getFirebaseContext();
    const { ref, remove, set } = db;
    if (current.role === "player") {
      if (meta?.status === "active" && meta.createdAt) {
        await remove(
          ref(
            database,
            `raceActivity/${current.code}/${meta.createdAt}/${current.uid}`,
          ),
        ).catch(() => undefined);
      }
      if (meta?.status === "lobby") {
        await remove(ref(database, `rooms/${current.code}/leaderboard/${current.uid}`));
        await remove(ref(database, `rooms/${current.code}/progress/${current.uid}`));
      } else {
        await set(ref(database, `rooms/${current.code}/leaderboard/${current.uid}/online`), false);
      }
    } else if (current.role === "spectator") {
      await remove(
        ref(database, `rooms/${current.code}/spectators/${current.uid}`),
      ).catch(() => undefined);
    }
  }, [meta, saveSession, session]);

  const closeRoom = useCallback(async () => {
    if (!session || session.role !== "host" || !meta) return;
    const { database, db } = await getFirebaseContext();
    await db.update(db.ref(database), {
      [`raceActivity/${session.code}/${meta.createdAt}`]: null,
      [`rooms/${session.code}`]: null,
    });
    saveSession(null);
  }, [meta, saveSession, session]);

  const sortedPlayers = useMemo(() => sortRoomPlayers(players), [players]);

  return {
    configured: isFirebaseConfigured,
    authUser,
    authLoading,
    signIn,
    signOut,
    connected,
    session,
    meta,
    players: sortedPlayers,
    spectators,
    activities,
    activityError,
    progress,
    challenge,
    events,
    loading,
    error,
    serverNow: () => Date.now() + serverOffsetRef.current,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    setReady,
    publishActivity,
    makeSpectator,
    setDuration,
    setUnlimited,
    startRace,
    finishRace,
    recordSolve,
    recordForfeit,
    recordMiss,
    recordBombExpiry,
    requestChallenge,
    recordChallengeSolve,
    rematch,
  };
}
