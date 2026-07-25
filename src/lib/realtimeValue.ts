export type RealtimeValueSubscription = (
  onLoaded: () => void,
  onError: (error: Error) => void,
) => () => void;

/**
 * Keeps a realtime listener alive while an operation reads from the SDK cache.
 *
 * Firebase transactions run their update callback synchronously, before the
 * transaction's own listener has received its first server value. A one-time
 * get does not help because Firebase removes that value from its cache as soon
 * as the get resolves. Pinning a value listener prevents an existing remote
 * value from being presented to the transaction callback as a false null.
 */
export async function runWithRealtimeValueLoaded<T>(
  subscribe: RealtimeValueSubscription,
  operation: () => Promise<T>,
): Promise<T> {
  let unsubscribe: () => void = () => undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      unsubscribe = subscribe(resolve, reject);
    });
    return await operation();
  } finally {
    unsubscribe();
  }
}
