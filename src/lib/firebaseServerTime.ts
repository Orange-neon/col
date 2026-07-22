import type { Database } from "firebase/database";

type DatabaseTimeApi = Pick<typeof import("firebase/database"), "onValue" | "ref">;

/**
 * Firebase exposes clock skew through a virtual `.info` location. On web,
 * that location is listener-backed and must not be read with `get()`.
 */
export function readFirebaseServerTimeOffset(
  database: Database,
  db: DatabaseTimeApi,
): Promise<number> {
  const offsetRef = db.ref(database, ".info/serverTimeOffset");
  return new Promise((resolve, reject) => {
    db.onValue(
      offsetRef,
      (snapshot) => resolve(Number(snapshot.val()) || 0),
      reject,
      { onlyOnce: true },
    );
  });
}
