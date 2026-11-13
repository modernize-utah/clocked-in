import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";
import { logOutAction } from "@/app/actions/auth";
import { getQueryClient } from "@/lib/query-client";

const storeName = "state";
const keyPrefix = "clocked-in.lookups";

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("clocked-in", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open lookup storage."));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read lookup storage."));
  });
}

const lookupStorage = {
  async getItem(key: string) {
    const db = await database();
    const value = await requestResult(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
    return typeof value === "string" ? value : null;
  },
  async setItem(key: string, value: string) {
    const db = await database();
    await requestResult(db.transaction(storeName, "readwrite").objectStore(storeName).put(value, key));
  },
  async removeItem(key: string) {
    const db = await database();
    await requestResult(db.transaction(storeName, "readwrite").objectStore(storeName).delete(key));
  },
};

function storageKey(userId: string) {
  return `${keyPrefix}.${userId}`;
}

const persisters = new Map<string, Persister>();

/** One persisted cache per signed-in user, so a shared browser never restores another person's lookups. */
export function lookupPersisterFor(userId: string) {
  let persister = persisters.get(userId);
  if (!persister) {
    persister = createAsyncStoragePersister({
      storage: typeof indexedDB === "undefined" ? undefined : lookupStorage,
      key: storageKey(userId),
    });
    persisters.set(userId, persister);
  }
  return persister;
}

async function removeLookupsExcept(keep: string | null) {
  if (typeof indexedDB === "undefined") return;
  const db = await database();
  const store = db.transaction(storeName, "readwrite").objectStore(storeName);
  const keys = await requestResult(store.getAllKeys());
  await Promise.all(
    keys
      .filter((key) => typeof key === "string" && key.startsWith(keyPrefix) && key !== keep)
      .map((key) => requestResult(store.delete(key))),
  );
}

export function forgetOtherUsersLookups(userId: string) {
  return removeLookupsExcept(storageKey(userId)).catch(() => {
    // Ignore a missing or unreadable persisted cache.
  });
}

/** Drops every user's persisted lookups and the in-memory cache. */
export async function clearPersistedLookups() {
  getQueryClient().clear();
  try {
    await removeLookupsExcept(null);
  } catch {
    // Ignore a missing or unreadable persisted cache.
  }
}

export function persistedLookupQuery(query: Query) {
  return query.state.status === "success" && query.queryKey[2] === "lookups";
}

export async function signOut() {
  await clearPersistedLookups();
  await logOutAction();
}
