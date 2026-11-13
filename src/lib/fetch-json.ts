export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status === 401 && typeof window !== "undefined") {
    const { clearPersistedLookups } = await import("@/lib/lookup-persistence");
    await clearPersistedLookups();
    // The helper runs outside React, so a full navigation is the only way off an expired session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }

  if (!response.ok) {
    throw new HttpError(response.status, body?.message ?? "Request failed.");
  }

  return body as T;
}

export async function sendJson<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new HttpError(response.status, payload?.message ?? "Request failed.");
  }

  return payload as T;
}
