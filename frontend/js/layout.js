const themeToggle = document.getElementById("toggle-theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  if (mode === "dark") {
    document.documentElement.style.setProperty("--color-background", "#1e2333");
    document.documentElement.style.setProperty("--color-surface", "#252c3f");
    document.documentElement.style.setProperty("--color-surface-alt", "#30384f");
    document.documentElement.style.setProperty("--color-text", "#eef3fb");
    document.documentElement.style.setProperty("--color-heading", "#ffffff");
    document.documentElement.style.setProperty("--color-border", "#343c52");
    document.documentElement.style.setProperty("--color-muted", "#b9c2d3");
    document.documentElement.style.setProperty("--color-field", "#1b2132");
    document.documentElement.style.setProperty("--color-field-hover", "#30384f");
    document.documentElement.style.setProperty("--color-primary", "#7db7ff");
    document.documentElement.style.setProperty("--color-primary-dark", "#a6ccff");
    document.documentElement.style.setProperty("--color-primary-ghost", "rgba(125, 183, 255, 0.16)");
    document.documentElement.style.setProperty("--color-highlight", "#4b4323");
  } else {
    document.documentElement.style.setProperty("--color-primary", "#0059b3");
    document.documentElement.style.setProperty("--color-primary-dark", "#004494");
    document.documentElement.style.setProperty("--color-background", "#f7f8fb");
    document.documentElement.style.setProperty("--color-surface", "#ffffff");
    document.documentElement.style.setProperty("--color-surface-alt", "#f0f4fb");
    document.documentElement.style.setProperty("--color-text", "#1f2a44");
    document.documentElement.style.setProperty("--color-heading", "#10234f");
    document.documentElement.style.setProperty("--color-border", "#d6dbe4");
    document.documentElement.style.setProperty("--color-muted", "#5f6a7a");
    document.documentElement.style.setProperty("--color-field", "#ffffff");
    document.documentElement.style.setProperty("--color-field-hover", "#eff6ff");
    document.documentElement.style.setProperty("--color-primary-ghost", "rgba(0, 89, 179, 0.12)");
    document.documentElement.style.setProperty("--color-highlight", "#fffbcc");
  }
}

function initTheme() {
  const saved = localStorage.getItem("erp-theme");
  const defaultMode = saved || (prefersDark.matches ? "dark" : "light");
  applyTheme(defaultMode);
  if (themeToggle) {
    themeToggle.textContent = defaultMode === "dark" ? "Light Mode" : "Dark Mode";
  }
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("erp-theme", next);
    themeToggle.textContent = next === "dark" ? "Light Mode" : "Dark Mode";
  });
}

prefersDark.addEventListener("change", (event) => {
  const saved = localStorage.getItem("erp-theme");
  if (!saved) {
    applyTheme(event.matches ? "dark" : "light");
  }
});

initTheme();

async function loadOrganizationBrand() {
  const logo = document.querySelector(".sidebar .logo");
  if (!logo) return;
  try {
    const response = await fetch("/api/v1/settings/public", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const payload = await response.json();
    const profile = payload.data || {};
    const companyName = profile.companyName || "";
    const companyLogo = profile.companyLogo || "";
    logo.textContent = "Community ERP";
    renderOrganizationBrand(logo, { companyName, companyLogo });
  } catch (error) {
    console.info("Using default organization brand", error.message);
  }
}

function renderOrganizationBrand(logo, profile) {
  let brand = document.querySelector(".sidebar .organization-brand");
  const shouldShowBrand = Boolean(profile.companyLogo || profile.companyName);
  if (!shouldShowBrand) {
    brand?.remove();
    return;
  }
  if (!brand) {
    brand = document.createElement("div");
    brand.className = "organization-brand";
    logo.insertAdjacentElement("afterend", brand);
  }
  const logoHtml = profile.companyLogo
    ? `<img src="${escapeAttribute(profile.companyLogo)}" alt="" class="organization-logo" />`
    : "";
  brand.innerHTML = `${logoHtml}<span>${escapeHtml(profile.companyName || "")}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

loadOrganizationBrand();

const sidebar = document.querySelector(".sidebar");
if (sidebar) {
  const links = sidebar.querySelectorAll(".nav-link");
  const { pathname } = window.location;
  links.forEach((link) => {
    if (link.getAttribute("href") === pathname) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

export function setUserBadge(name) {
  const badge = document.getElementById("user-display");
  if (badge) {
    badge.textContent = name;
  }
}

// Client-side redirects from legacy pages to consolidated Meeting Notes
function redirectLegacyMeetkitPages() {
  const legacy = new Set([
    "/html/map.html",
    "/html/meetings.html",
    "/html/whiteboard.html",
    "/html/meetkit-search.html",
    "/html/meetkit-admin.html",
  ]);
  const target = "/html/meeting-notes.html";
  try {
    const here = window.location && window.location.pathname;
    if (legacy.has(here)) window.location.replace(target);
  } catch (_error) {
    console.info("Legacy page redirect skipped.");
  }
}

redirectLegacyMeetkitPages();
