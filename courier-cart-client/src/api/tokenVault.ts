// src/api/tokenVault.ts
let access = "";
let refresh = "";
const SESSION_USER_KEY = "cc_session_user";

const readStoredTokens = () => {
  if (typeof window === "undefined") {
    return { accessToken: access, refreshToken: refresh };
  }

  return {
    accessToken: localStorage.getItem("cc_access") || "",
    refreshToken: localStorage.getItem("cc_refresh") || "",
  };
};

/** Read the latest tokens (kept in‑memory + localStorage) */
export const getAuthTokens = () => {
  const stored = readStoredTokens();
  access = stored.accessToken;
  refresh = stored.refreshToken;
  return stored;
};

/** Save (and persist) a new token pair */
export const setAuthTokens = (a: string, r: string) => {
  access = a;
  refresh = r;
  localStorage.setItem("cc_access", a);
  localStorage.setItem("cc_refresh", r);
};

export const getStoredSessionUser = <T>() => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = localStorage.getItem(SESSION_USER_KEY);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch (error) {
    console.warn("Failed to parse stored session user", error);
    localStorage.removeItem(SESSION_USER_KEY);
    return null;
  }
};

export const setStoredSessionUser = <T>(user: T) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
};

/** Wipe everything */
export const clearAuthTokens = () => {
  access = "";
  refresh = "";
  localStorage.removeItem("cc_access");
  localStorage.removeItem("cc_refresh");
  localStorage.removeItem(SESSION_USER_KEY);
};
