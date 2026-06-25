const stripTrailingSlash = (url = "") => String(url).replace(/\/+$/, "");

const inferHostUrl = (port) => {
  if (typeof window === "undefined" || !window.location?.hostname) {
    return "";
  }

  return `${window.location.protocol}//${window.location.hostname}:${port}`;
};

export const CLIENT_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_CLIENT_APP_URL ||
    inferHostUrl(import.meta.env.VITE_CLIENT_APP_PORT || "8089") ||
    "http://localhost:8089",
);

export const AUTH_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_AUTH_APP_URL || `${CLIENT_APP_URL}/login`,
);

export const ADMIN_APP_URL = stripTrailingSlash(
  import.meta.env.VITE_ADMIN_APP_URL ||
    inferHostUrl(import.meta.env.VITE_ADMIN_APP_PORT || "8090") ||
    "http://localhost:8090",
);

export const ADMIN_AUTH_URL = stripTrailingSlash(
  import.meta.env.VITE_ADMIN_AUTH_URL || `${ADMIN_APP_URL}/auth/signin`,
);

export const API_BASE_URL = stripTrailingSlash(
  import.meta.env.VITE_API_URL ||
    `${inferHostUrl(import.meta.env.VITE_API_PORT || "8092")}/api` ||
    "http://localhost:8092/api",
);

export const CLIENT_RATE_CALCULATOR_URL = `${CLIENT_APP_URL}/tools/rate_calculator`;

export const launchDestinations = [
  {
    label: "Client App",
    description: "Merchant dashboard, orders, billing, and shipping tools.",
    url: CLIENT_APP_URL,
  },
  {
    label: "Merchant Login",
    description: "Open the auth flow for merchants, onboarding, and account access.",
    url: AUTH_APP_URL,
  },
  {
    label: "Admin Panel",
    description: "Open the operations control layer and admin workspace.",
    url: ADMIN_AUTH_URL,
  },
];

export function openExternal(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openClientApp() {
  openExternal(CLIENT_APP_URL);
}

export function openAuthPortal() {
  openExternal(AUTH_APP_URL);
}

export function openAdminPortal() {
  openExternal(ADMIN_AUTH_URL);
}
