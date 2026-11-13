"use client";

import { useLayoutEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { forgetOtherUsersLookups, lookupPersisterFor, persistedLookupQuery } from "@/lib/lookup-persistence";
import { getQueryClient } from "@/lib/query-client";
import { lookupGcTime } from "@/lib/queries";

let cacheOwner: string | null = null;

/** Restores and saves the signed-in user's lookups. Switching users drops the previous user's cache. */
export function UserQueryCache({ userId, children }: { userId: string; children: React.ReactNode }) {
  // Runs before PersistQueryClientProvider's restore effect, so the new user never sees stale queries.
  useLayoutEffect(() => {
    if (cacheOwner !== userId) {
      if (cacheOwner !== null) getQueryClient().clear();
      cacheOwner = userId;
      void forgetOtherUsersLookups(userId);
    }
  }, [userId]);

  return (
    <PersistQueryClientProvider
      key={userId}
      client={getQueryClient()}
      persistOptions={{
        persister: lookupPersisterFor(userId),
        maxAge: lookupGcTime,
        dehydrateOptions: { shouldDehydrateQuery: persistedLookupQuery },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
