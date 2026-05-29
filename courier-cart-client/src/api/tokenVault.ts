// src/api/tokenVault.ts
let access = "";
let refresh = "";

/** Read the latest tokens (kept in‑memory + localStorage) */
export const getAuthTokens = () => ({
  accessToken: access || localStorage.getItem("cc_access") || "",
  refreshToken: refresh || localStorage.getItem("cc_refresh") || "",
});

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
