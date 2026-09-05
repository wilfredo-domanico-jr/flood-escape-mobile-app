/**
 * Wraps an async function so concurrent callers share one in-flight run. The slot is released
 * on every exit path (resolve, reject, early return), so a stale promise can never block later calls.
 */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (inflight) return inflight;
    inflight = run().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
