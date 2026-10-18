/**
 * Central API client.
 *
 * Everything the frontend sends goes through here. Two problems this fixes:
 *
 *  1. Components previously built URLs by hand — `${window.location.hostname}:5000`
 *     in some places, `http://localhost:5000` hardcoded in others, and `/api/...`
 *     relative in others. That made login fail whenever the dev host was not
 *     localhost. Requests are now relative and proxied, so the browser always
 *     talks to the origin it was served from.
 *
 *  2. No component attached the session token, so every request was anonymous
 *     and the backend had no way to authorize anything.
 */

const TOKEN_KEY = "nabhacare.token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — the session simply won't persist */
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
};

/**
 * Performs an API request and unwraps the JSON envelope.
 * Non-2xx responses become {@link ApiError} so callers never have to inspect
 * `res.ok` and a JSON body at the same time.
 */
export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { method = "GET", body, token = getToken(), signal } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      0,
      "NETWORK"
    );
  }

  // Parsed as `unknown` rather than `any`: the envelope is server-controlled, and
  // `any` here let a typo reach the UI as a runtime `undefined` without a warning.
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const envelope = (payload ?? {}) as { error?: unknown; code?: unknown };

  if (!response.ok) {
    throw new ApiError(
      typeof envelope.error === "string"
        ? envelope.error
        : `Request failed with status ${response.status}`,
      response.status,
      typeof envelope.code === "string" ? envelope.code : undefined
    );
  }

  return payload as T;
}

/** Builds `/api/{role}/...` paths so the panel is explicit at every call site. */
export const apiPath = (role: "patient" | "doctor", suffix: string) =>
  `/api/${role}${suffix}`;

export default { api, apiPath, getToken, setToken, ApiError };