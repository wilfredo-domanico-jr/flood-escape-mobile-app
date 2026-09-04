import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import Storage from "expo-sqlite/kv-store";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Reports are re-fetched by viewport/realtime; 30 s keeps navigation snappy without spamming.
      staleTime: 30_000,
      // Keep cached data long enough to be useful offline; persisted cache uses the same window.
      gcTime: ONE_DAY_MS,
      retry: 2,
      // Serve cached data first when offline instead of erroring.
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
    },
  },
});

/** Persists the query cache to SQLite so the last-seen reports render on a cold start offline. */
export const queryPersister = createAsyncStoragePersister({
  storage: Storage,
  key: "flood-escape.query-cache.v1",
  throttleTime: 1_000,
});

export const QUERY_CACHE_MAX_AGE_MS = ONE_DAY_MS;
