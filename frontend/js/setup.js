const API_BASE = "/api/v1";
const MAX_SOURCE_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_STORED_LOGO_CHARS = 1500000;

const state = {
  logo: "",
};

const elements = {
  form: document.getElementById("first-run-setup-form"),
  status: document.getElementById("setup-status"),
  logoFile: document.getElementById("setup-logo-file"),
  logoPreview: document.getElementById("setup-logo-preview"),
  clearLogo: document.getElementById("clear-setup-logo"),
};

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch (_error) {
      // ignore non-json errors
    }
    const details = Array.isArray(payload?.details) ? payload.details.filter(Boolean) : [];
    const message = details.length
      ? details.join(" ")
      : payload?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return response.json();
}

async function init() {
  bindEvents();
  try {
    const { data } = await request("/setup/status");
    if (!data?.setupRequired) {
      window.location.href = "/html/index.html";
    }
  } catch (error) {
    setStatus(error.message || "Unable to check setup status.", true);
  }
}

function bindEvents() {
  elements.form?.addEventListener("submit", handleSubmit);
  elements.logoFile?.addEventListener("change", handleLogoFile);
  elements.form?.organizationLogoUrl?.addEventListener("input", () => {
    state.logo = elements.form.organizationLogoUrl.value.trim();
    renderLogoPreview();
  });
  elements.clearLogo?.addEventListener("click", () => {
    state.logo = "";
    if (elements.form?.organizationLogoUrl) elements.form.organizationLogoUrl.value = "";
    if (elements.logoFile) elements.logoFile.value = "";
    renderLogoPreview();
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = new FormData(elements.form);
  const validationMessage = validateSetupForm(form);
  if (validationMessage) {
    setStatus(validationMessage, true);
    return;
  }
  const payload = {
    organizationName: String(form.get("organizationName") || "").trim(),
    organizationLogo: state.logo,
    adminName: String(form.get("adminName") || "").trim(),
    adminEmail: String(form.get("adminEmail") || "").trim(),
    adminPassword: String(form.get("adminPassword") || ""),
  };
  try {
    setStatus("Creating workspace...", false);
    await request("/setup", { method: "POST", body: payload });
    setStatus("Workspace created. Opening sign in...", false);
    window.location.href = "/html/index.html";
  } catch (error) {
    setStatus(error.message || "Unable to complete setup.", true);
  }
}

function validateSetupForm(form) {
  const organizationName = String(form.get("organizationName") || "").trim();
  const adminName = String(form.get("adminName") || "").trim();
  const adminEmail = String(form.get("adminEmail") || "").trim();
  const adminPassword = String(form.get("adminPassword") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  if (organizationName.length < 2) {
    return "Enter an organization name with at least 2 characters.";
  }
  if (adminName.length < 2) {
    return "Enter the administrator's name with at least 2 characters.";
  }
  if (!isValidEmail(adminEmail)) {
    return "Enter a complete email address, including the part after the dot, like jane@example.com.";
  }
  if (adminPassword.length < 10) {
    return "Password must be at least 10 characters.";
  }
  if (!/[A-Z]/.test(adminPassword)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(adminPassword)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/\d/.test(adminPassword)) {
    return "Password must include at least one number.";
  }
  if (!/[^A-Za-z\d]/.test(adminPassword)) {
    return "Password must include at least one symbol.";
  }
  if (adminPassword !== confirmPassword) {
    return "Passwords do not match. Re-enter the same password in Confirm Password.";
  }
  return "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

async function handleLogoFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_SOURCE_LOGO_BYTES) {
    setStatus("Choose a logo smaller than 8 MB.", true);
    event.target.value = "";
    return;
  }
  try {
    setStatus("Preparing logo...", false);
    state.logo = await prepareLogoFile(file);
    if (elements.form?.organizationLogoUrl) elements.form.organizationLogoUrl.value = "";
    renderLogoPreview();
    setStatus("Logo ready.", false);
  } catch (error) {
    event.target.value = "";
    setStatus(error.message || "Unable to prepare logo.", true);
  }
}

async function prepareLogoFile(file) {
  if (file.type === "image/svg+xml") {
    const svgLogo = await readFileAsDataUrl(file);
    if (svgLogo.length > MAX_STORED_LOGO_CHARS) {
      throw new Error("Choose a smaller SVG logo.");
    }
    return svgLogo;
  }
  const attempts = [
    { maxSize: 512, quality: 0.86 },
    { maxSize: 384, quality: 0.82 },
    { maxSize: 256, quality: 0.78 },
  ];
  for (const attempt of attempts) {
    const dataUrl = await resizeRasterLogo(file, attempt);
    if (dataUrl.length <= MAX_STORED_LOGO_CHARS) {
      return dataUrl;
    }
  }
  throw new Error("This logo is still too large after resizing. Try a simpler image.");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Unable to read logo file.")));
    reader.readAsDataURL(file);
  });
}

function resizeRasterLogo(file, { maxSize, quality }) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const webp = canvas.toDataURL("image/webp", quality);
        resolve(webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png"));
      } catch (_error) {
        reject(new Error("Unable to resize logo."));
      }
    });
    image.addEventListener("error", () => reject(new Error("Choose a valid image file.")));
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        image.src = dataUrl;
        return null;
      })
      .catch(reject);
  });
}

function renderLogoPreview() {
  if (!elements.logoPreview) return;
  if (!state.logo) {
    elements.logoPreview.textContent = "No logo";
    return;
  }
  elements.logoPreview.innerHTML = `<img src="${escapeAttribute(state.logo)}" alt="Organization logo preview" />`;
}

function setStatus(message, isError) {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.style.display = message ? "block" : "none";
  elements.status.style.color = isError ? "var(--color-danger)" : "var(--color-muted)";
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;");
}

init();
