// src/api/tokenVault.ts
let access = "";
let refresh = "";

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

/** Wipe everything */
export const clearAuthTokens = () => {
  access = "";
  refresh = "";
  localStorage.removeItem("cc_access");
  localStorage.removeItem("cc_refresh");
};
