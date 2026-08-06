import { login, logout, fetchMe } from "./api.js";
import { setUserBadge } from "./layout.js";

const authState = {
  user: null,
};

const WELCOME_PATH = "/html/index.html";
const SESSION_HINT_KEY = "communityErp.sessionHint";

function isWelcomePage() {
  const path = window.location.pathname || WELCOME_PATH;
  return path === "/" || path === WELCOME_PATH;
}

function showAuthenticatedContent(show) {
  document.querySelectorAll("[data-auth-required]").forEach((element) => {
    element.style.display = show ? "" : "none";
  });
}

function goToWelcomeBack() {
  if (!isWelcomePage()) {
    window.location.replace(WELCOME_PATH);
  }
}

function hasSessionHint() {
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "true";
  } catch (_error) {
    return true;
  }
}

function setSessionHint(hasSession) {
  try {
    if (hasSession) {
      window.localStorage.setItem(SESSION_HINT_KEY, "true");
    } else {
      window.localStorage.removeItem(SESSION_HINT_KEY);
    }
  } catch (_error) {
    // Local storage is only a speed hint; auth still uses secure cookies.
  }
}

function showAuthCard(show) {
  const card = document.querySelector("[data-auth-card]");
  if (card) {
    card.style.display = show ? "block" : "none";
  }
}

function setLoading(isLoading) {
  const button = document.querySelector("#login-form button[type='submit']");
  if (button) {
    button.disabled = isLoading;
    button.textContent = isLoading ? "Signing In…" : "Sign In";
  }
}

function showError(message) {
  const el = document.getElementById("login-error");
  if (el) {
    el.textContent = message;
    el.style.display = message ? "block" : "none";
  }
}

function setSession(user) {
  authState.user = user;
  window.__ERP_USER__ = user || null;
  document.body.dataset.authenticated = user ? "true" : "false";
  showAuthenticatedContent(Boolean(user));
  if (user) {
    setUserBadge(user.displayName || user.email);
    showAuthCard(false);
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) logoutButton.style.display = "inline-flex";
  } else {
    setUserBadge("Guest");
    showAuthCard(true);
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) logoutButton.style.display = "none";
  }
}

function attachLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    setLoading(true);
    showError("");
    try {
      const user = await login(email, password);
      setSessionHint(true);
      setSession(user);
      document.dispatchEvent(new CustomEvent("auth:ready", { detail: { user } }));
    } catch (error) {
      showError(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  });
}

function attachLogout() {
  const button = document.getElementById("logout-button");
  if (!button) return;
  button.addEventListener("click", () => {
    setSessionHint(false);
    setSession(null);
    goToWelcomeBack();
    logout().catch((error) => {
      console.warn("Logout error", error);
    });
  });
}

async function hydrateSession() {
  try {
    const { user } = await fetchMe();
    if (!user) throw new Error("No session");
    setSessionHint(true);
    setSession(user);
    document.dispatchEvent(new CustomEvent("auth:ready", { detail: { user } }));
  } catch (error) {
    setSessionHint(false);
    setSession(null);
    console.info("User must sign in", error.message);
    goToWelcomeBack();
  }
}

export function initAuth() {
  attachLoginForm();
  attachLogout();
  if (isWelcomePage()) {
    setSession(null);
    if (!hasSessionHint()) {
      return;
    }
  }
  document.addEventListener("auth:expired", () => {
    setSession(null);
    goToWelcomeBack();
  });
  hydrateSession();
}

initAuth();
