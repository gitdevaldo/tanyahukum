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
