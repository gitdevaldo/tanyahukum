const ACCESS_TOKEN_KEY = "th_access_token";
const REFRESH_TOKEN_KEY = "th_refresh_token";

function hasWindow() {
  return typeof window !== "undefined";
}

export function getAccessToken(): string | null {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setSession(accessToken: string, refreshToken?: string | null) {
  if (!hasWindow()) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearSession() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

/** Check if a JWT is expired (with 60s buffer). */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp;
    if (!exp) return false;
    return Date.now() >= (exp - 60) * 1000; // 60s buffer
  } catch {
    return true;
  }
}

let refreshPromise: Promise<string | null> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the new access token or null on failure.
 * Deduplicates concurrent calls.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.access_token) {
        setSession(data.access_token, data.refresh_token || rt);
        return data.access_token as string;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Get a valid access token, auto-refreshing if needed.
 * Returns null if both tokens are invalid.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;
  if (!isTokenExpired(token)) return token;

  // Token expired; try refresh
  const newToken = await refreshAccessToken();
  return newToken;
}
