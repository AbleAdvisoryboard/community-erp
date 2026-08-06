import {
  fetchPublicSettings,
  updateOrganizationSettings,
  fetchManagedUsers,
  fetchAuthSecuritySettings,
  updateAuthSecuritySettings,
  fetchFinanceControls,
  updateFinanceControls,
  createManagedUser,
  deleteManagedUser,
  unlockManagedUser,
  fetchAccessCatalog,
  fetchAccessProfiles,
  saveAccessProfiles,
  updateManagedUserAccess,
} from "./api.js";

const state = {
  companyLogo: "",
  authSecurity: null,
  financeControls: null,
  users: [],
  accessCatalog: [],
  accessProfiles: [],
  editingAccessProfileId: null,
  canManageSettings: false,
  canManageUsers: false,
};

const MAX_SOURCE_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_STORED_LOGO_CHARS = 1500000;

const elements = {
  organizationForm: document.getElementById("organization-settings-form"),
  companyName: document.getElementById("company-name"),
  companyLogoUrl: document.getElementById("company-logo-url"),
  companyLogoFile: document.getElementById("company-logo-file"),
  companyLogoPreview: document.getElementById("company-logo-preview"),
  clearLogo: document.getElementById("clear-company-logo"),
  organizationStatus: document.getElementById("organization-settings-status"),
  authSecurityForm: document.getElementById("auth-security-form"),
  accessTimeoutMinutes: document.getElementById("access-timeout-minutes"),
  failedLoginLimit: document.getElementById("failed-login-limit"),
  lockoutMinutes: document.getElementById("lockout-minutes"),
  authSecurityStatus: document.getElementById("auth-security-status"),
  financeControlsForm: document.getElementById("finance-controls-form"),
  manualJournalApproval: document.getElementById("manual-journal-approval"),
  manualJournalApprover: document.getElementById("manual-journal-approver"),
  bankDepositApproval: document.getElementById("bank-deposit-approval"),
  bankDepositApprover: document.getElementById("bank-deposit-approver"),
  billApproval: document.getElementById("bill-approval"),
  billApprover: document.getElementById("bill-approver"),
  paymentApproval: document.getElementById("payment-approval"),
  paymentApprover: document.getElementById("payment-approver"),
  financeControlsStatus: document.getElementById("finance-controls-status"),
  createUserForm: document.getElementById("create-user-form"),
  userAccessChoice: document.getElementById("user-access-choice"),
  createUserStatus: document.getElementById("create-user-status"),
  usersList: document.getElementById("managed-users-list"),
  accessProfileList: document.getElementById("access-profile-list"),
  accessPanel: document.getElementById("access-editor-panel"),
  accessTitle: document.getElementById("access-editor-title"),
  accessForm: document.getElementById("access-editor-form"),
  accessStatus: document.getElementById("access-editor-status"),
  closeAccess: document.getElementById("close-access-editor"),
};

function init() {
  bindEvents();
  loadPublicProfile();
  if (window.__ERP_USER__) {
    onAuthReady(window.__ERP_USER__);
  }
  document.addEventListener("auth:ready", (event) => onAuthReady(event.detail?.user || null));
}

function bindEvents() {
  elements.organizationForm?.addEventListener("submit", handleOrganizationSave);
  elements.authSecurityForm?.addEventListener("submit", handleAuthSecuritySave);
  elements.financeControlsForm?.addEventListener("submit", handleFinanceControlsSave);
  elements.createUserForm?.addEventListener("submit", handleCreateUser);
  elements.companyLogoUrl?.addEventListener("input", () => {
    state.companyLogo = elements.companyLogoUrl.value.trim();
    renderLogoPreview();
  });
  elements.companyLogoFile?.addEventListener("change", handleLogoFile);
  elements.accessForm?.addEventListener("submit", handleSaveAccessProfile);
  elements.closeAccess?.addEventListener("click", closeAccessEditor);
  elements.clearLogo?.addEventListener("click", () => {
    state.companyLogo = "";
    if (elements.companyLogoUrl) elements.companyLogoUrl.value = "";
    if (elements.companyLogoFile) elements.companyLogoFile.value = "";
    renderLogoPreview();
  });
}

function onAuthReady(user) {
  const permissions = new Set(user?.permissions || []);
  state.canManageSettings = permissions.has("admin.manage_settings");
  state.canManageUsers = permissions.has("auth.manage_users");
  if (!state.canManageSettings) {
    setStatus(elements.organizationStatus, "Only administrators can change organization settings.", true);
    setFormDisabled(elements.organizationForm, true);
    setStatus(elements.financeControlsStatus, "Only administrators can change finance controls.", true);
    setFormDisabled(elements.financeControlsForm, true);
  } else {
    loadFinanceControls().catch((error) => {
      setStatus(elements.financeControlsStatus, error.message || "Unable to load finance controls.", true);
    });
  }
  if (!state.canManageUsers) {
    setStatus(elements.createUserStatus, "Only administrators can manage users.", true);
    setFormDisabled(elements.createUserForm, true);
    setStatus(elements.authSecurityStatus, "Only administrators can change sign-in security.", true);
    setFormDisabled(elements.authSecurityForm, true);
  } else {
    Promise.all([loadAccessCatalog(), loadAccessProfiles(), loadUsers(), loadAuthSecuritySettings()]).catch((error) => {
      setStatus(elements.createUserStatus, error.message || "Unable to load user access.", true);
    });
  }
}

async function loadFinanceControls() {
  if (!state.canManageSettings) return;
  const { data } = await fetchFinanceControls();
  state.financeControls = data;
  if (elements.manualJournalApproval) elements.manualJournalApproval.value = String(Boolean(data.manualJournalApproval));
  if (elements.manualJournalApprover) elements.manualJournalApprover.value = data.manualJournalApprover || "";
  if (elements.bankDepositApproval) elements.bankDepositApproval.value = String(Boolean(data.bankDepositApproval));
  if (elements.bankDepositApprover) elements.bankDepositApprover.value = data.bankDepositApprover || "";
  if (elements.billApproval) elements.billApproval.value = String(Boolean(data.billApproval));
  if (elements.billApprover) elements.billApprover.value = data.billApprover || "";
  if (elements.paymentApproval) elements.paymentApproval.value = String(Boolean(data.paymentApproval));
  if (elements.paymentApprover) elements.paymentApprover.value = data.paymentApprover || "";
}

async function loadAuthSecuritySettings() {
  try {
    const { data } = await fetchAuthSecuritySettings();
    state.authSecurity = data;
    if (elements.accessTimeoutMinutes) elements.accessTimeoutMinutes.value = data.accessTimeoutMinutes ?? "";
    if (elements.failedLoginLimit) elements.failedLoginLimit.value = data.failedLoginLimit ?? "";
    if (elements.lockoutMinutes) elements.lockoutMinutes.value = data.lockoutMinutes ?? "";
  } catch (error) {
    setStatus(elements.authSecurityStatus, error.message || "Unable to load sign-in security.", true);
  }
}

async function loadAccessCatalog() {
  const { data } = await fetchAccessCatalog();
  state.accessCatalog = data || [];
}

async function loadAccessProfiles() {
  const { data } = await fetchAccessProfiles();
  state.accessProfiles = data || [];
  renderAccessChoiceOptions();
  renderAccessProfiles();
  renderUsers();
}

async function loadPublicProfile() {
  try {
    const { data } = await fetchPublicSettings();
    if (elements.companyName) elements.companyName.value = data.companyName || "";
    if (elements.companyLogoUrl) elements.companyLogoUrl.value = data.companyLogo || "";
    state.companyLogo = data.companyLogo || "";
    renderLogoPreview();
  } catch (error) {
    setStatus(elements.organizationStatus, error.message || "Unable to load organization settings.", true);
  }
}

async function loadUsers() {
  if (!state.canManageUsers) return;
  try {
    const { data } = await fetchManagedUsers();
    state.users = data || [];
    renderUsers();
  } catch (error) {
    if (elements.usersList) {
      elements.usersList.innerHTML = `<p class="page-subtitle">${escapeHtml(error.message || "Unable to load users.")}</p>`;
    }
  }
}

async function handleOrganizationSave(event) {
  event.preventDefault();
  if (!state.canManageSettings) return;
  const companyName = elements.companyName?.value?.trim();
  try {
    setStatus(elements.organizationStatus, "Saving organization settings...", false);
    const { data } = await updateOrganizationSettings({
      companyName,
      companyLogo: state.companyLogo,
    });
    state.companyLogo = data.companyLogo || "";
    setStatus(elements.organizationStatus, "Organization settings saved.", false);
    applyBrand(data);
  } catch (error) {
    setStatus(elements.organizationStatus, error.message || "Unable to save organization settings.", true);
  }
}

async function handleAuthSecuritySave(event) {
  event.preventDefault();
  if (!state.canManageUsers) return;
  const form = new FormData(elements.authSecurityForm);
  const payload = {
    accessTimeoutMinutes: Number(form.get("accessTimeoutMinutes")),
    failedLoginLimit: Number(form.get("failedLoginLimit")),
    lockoutMinutes: Number(form.get("lockoutMinutes")),
  };
  try {
    setStatus(elements.authSecurityStatus, "Saving sign-in security...", false);
    const { data } = await updateAuthSecuritySettings(payload);
    state.authSecurity = data;
    setStatus(elements.authSecurityStatus, "Sign-in security saved.", false);
  } catch (error) {
    setStatus(elements.authSecurityStatus, error.message || "Unable to save sign-in security.", true);
  }
}

async function handleFinanceControlsSave(event) {
  event.preventDefault();
  if (!state.canManageSettings) return;
  const form = new FormData(elements.financeControlsForm);
  const payload = {
    manualJournalApproval: form.get("manualJournalApproval") === "true",
    manualJournalApprover: String(form.get("manualJournalApprover") || "").trim(),
    bankDepositApproval: form.get("bankDepositApproval") === "true",
    bankDepositApprover: String(form.get("bankDepositApprover") || "").trim(),
    billApproval: form.get("billApproval") === "true",
    billApprover: String(form.get("billApprover") || "").trim(),
    paymentApproval: form.get("paymentApproval") === "true",
    paymentApprover: String(form.get("paymentApprover") || "").trim(),
  };
  try {
    setStatus(elements.financeControlsStatus, "Saving finance controls...", false);
    const { data } = await updateFinanceControls(payload);
    state.financeControls = data;
    setStatus(elements.financeControlsStatus, "Finance controls saved.", false);
  } catch (error) {
    setStatus(elements.financeControlsStatus, error.message || "Unable to save finance controls.", true);
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  if (!state.canManageUsers) return;
  const form = new FormData(elements.createUserForm);
  const accessChoice = String(form.get("accessChoice") || "associate_1");
  const isAdmin = accessChoice === "admin";
  const payload = {
    displayName: String(form.get("displayName") || "").trim(),
    email: String(form.get("email") || "").trim(),
    accessType: isAdmin ? "admin" : "associate",
    accessProfileId: isAdmin ? undefined : accessChoice,
    password: String(form.get("password") || ""),
  };
  try {
    setStatus(elements.createUserStatus, "Creating user...", false);
    await createManagedUser(payload);
    elements.createUserForm.reset();
    setStatus(elements.createUserStatus, "User created.", false);
    await loadUsers();
  } catch (error) {
    setStatus(elements.createUserStatus, error.message || "Unable to create user.", true);
  }
}

async function handleLogoFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_SOURCE_LOGO_BYTES) {
    setStatus(elements.organizationStatus, "Choose a logo smaller than 8 MB.", true);
    event.target.value = "";
    return;
  }
  try {
    setStatus(elements.organizationStatus, "Preparing logo...", false);
    state.companyLogo = await prepareLogoFile(file);
    if (elements.companyLogoUrl) elements.companyLogoUrl.value = "";
    renderLogoPreview();
    setStatus(elements.organizationStatus, "Logo ready. Save organization settings to keep it.", false);
  } catch (error) {
    event.target.value = "";
    setStatus(elements.organizationStatus, error.message || "Unable to prepare logo.", true);
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
    image.addEventListener("error", () => {
      reject(new Error("Choose a valid image file."));
    });
    readFileAsDataUrl(file)
      .then((dataUrl) => {
        image.src = dataUrl;
        return null;
      })
      .catch(reject);
  });
}

function renderLogoPreview() {
  if (!elements.companyLogoPreview) return;
  if (!state.companyLogo) {
    elements.companyLogoPreview.textContent = "No logo";
    return;
  }
  elements.companyLogoPreview.innerHTML = `<img src="${escapeAttribute(state.companyLogo)}" alt="Company logo preview" />`;
}

function renderUsers() {
  if (!elements.usersList) return;
  if (!state.users.length) {
    elements.usersList.innerHTML = `<p class="page-subtitle">No users found.</p>`;
    return;
  }
  elements.usersList.innerHTML = state.users.map(renderUserCard).join("");
  elements.usersList.querySelectorAll("button[data-assign-access-user]").forEach((button) => {
    button.addEventListener("click", handleAssignUserAccess);
  });
  elements.usersList.querySelectorAll("button[data-delete-user]").forEach((button) => {
    button.addEventListener("click", handleDeleteUser);
  });
  elements.usersList.querySelectorAll("button[data-unlock-user]").forEach((button) => {
    button.addEventListener("click", handleUnlockUser);
  });
}

function renderUserCard(user) {
  const accessLabel = user.accessType === "admin" ? "Administrator" : "Associate";
  const statusLabel = user.isActive ? "Active" : "Inactive";
  const lockLabel = user.isLocked ? `Locked until ${formatDateTime(user.lockedUntil)}` : "";
  const deleteDisabled = user.canDelete === false ? "disabled" : "";
  const deleteLabel = user.canDelete === false ? "Admin Required" : "Delete User";
  const matchedProfile = findMatchingAccessProfile(user.access);
  const accessControl = user.accessType === "admin"
    ? ""
    : `<select data-user-profile="${user.id}" aria-label="Access option for ${escapeAttribute(user.displayName || user.email)}">
        ${state.accessProfiles.map((profile) => `<option value="${escapeAttribute(profile.id)}" ${profile.id === matchedProfile?.id ? "selected" : ""}>${escapeHtml(profile.name)}</option>`).join("")}
      </select>
      <button class="button secondary" type="button" data-assign-access-user="${user.id}">Save Access</button>`;
  return `<article class="user-management-card">
    <header>
      <div>
        <strong>${escapeHtml(user.displayName)}</strong>
        <p class="page-subtitle" style="margin:4px 0 0;">${escapeHtml(user.email)}</p>
        <p class="page-subtitle" style="margin:4px 0 0;">Last login: ${escapeHtml(user.lastLoginAt || "Never")}</p>
      </div>
      <span class="user-access-badge">${escapeHtml(accessLabel)}</span>
    </header>
    <div class="user-management-actions">
      <span class="page-subtitle">${escapeHtml(lockLabel || statusLabel)}${user.canDelete === false ? " - at least one administrator must remain" : ""}</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${accessControl}
        ${user.isLocked ? `<button class="button secondary" type="button" data-unlock-user="${user.id}">Unblock</button>` : ""}
        <button class="button secondary danger-button" type="button" data-delete-user="${user.id}" ${deleteDisabled}>${escapeHtml(deleteLabel)}</button>
      </div>
    </div>
  </article>`;
}

function renderAccessPlaceholder(message) {
  if (elements.accessTitle) elements.accessTitle.textContent = "Access Options";
  if (elements.accessForm) {
    elements.accessForm.innerHTML = `<p class="page-subtitle">${escapeHtml(message)}</p>`;
  }
  if (elements.closeAccess) elements.closeAccess.style.display = "none";
  state.editingAccessProfileId = null;
}

function renderAccessChoiceOptions() {
  if (!elements.userAccessChoice) return;
  elements.userAccessChoice.innerHTML = [
    '<option value="admin">Administrator</option>',
    ...state.accessProfiles.map((profile) => `<option value="${escapeAttribute(profile.id)}">${escapeHtml(profile.name)}</option>`),
  ].join("");
}

function renderAccessProfiles() {
  if (!elements.accessProfileList) return;
  elements.accessProfileList.innerHTML = `<div class="access-profile-toolbar">
      <button class="button" type="button" data-new-access-profile>New Access Option</button>
    </div>
    <div class="access-profile-rows">
      ${state.accessProfiles.map((profile) => `
        <div class="access-profile-row">
          <div>
            <strong>${escapeHtml(profile.name)}</strong>
            <p class="page-subtitle" style="margin:4px 0 0;">${profile.builtIn ? "Built-in option" : "Custom option"}</p>
          </div>
          <div class="access-profile-actions">
            <button class="button secondary" type="button" data-edit-access-profile="${escapeAttribute(profile.id)}">Edit</button>
            ${
              profile.builtIn
                ? '<button class="button secondary" type="button" disabled>Protected</button>'
                : `<button class="button secondary danger-button" type="button" data-delete-access-profile="${escapeAttribute(profile.id)}">Delete</button>`
            }
          </div>
        </div>
      `).join("")}
    </div>`;
  elements.accessProfileList.querySelector("[data-new-access-profile]")?.addEventListener("click", openNewAccessProfile);
  elements.accessProfileList.querySelectorAll("[data-edit-access-profile]").forEach((button) => {
    button.addEventListener("click", openAccessProfileEditor);
  });
  elements.accessProfileList.querySelectorAll("[data-delete-access-profile]").forEach((button) => {
    button.addEventListener("click", handleDeleteAccessProfile);
  });
  if (!state.editingAccessProfileId) {
    renderAccessPlaceholder("Choose an access option above or create a new one.");
  }
}

function openNewAccessProfile() {
  const profile = { id: `custom_${Date.now()}`, name: "Custom Access", builtIn: false, access: { sections: {} } };
  state.editingAccessProfileId = profile.id;
  if (elements.accessTitle) elements.accessTitle.textContent = "New Access Option";
  if (elements.accessForm) elements.accessForm.innerHTML = renderAccessEditor(profile);
  bindAccessEditorControls();
}

function openAccessProfileEditor(event) {
  const profileId = event.currentTarget.getAttribute("data-edit-access-profile");
  const profile = state.accessProfiles.find((item) => item.id === profileId);
  if (!profile) return;
  state.editingAccessProfileId = profile.id;
  if (elements.accessTitle) elements.accessTitle.textContent = `Edit ${profile.name}`;
  if (elements.accessForm) elements.accessForm.innerHTML = renderAccessEditor(profile);
  bindAccessEditorControls();
}

function bindAccessEditorControls() {
  if (elements.closeAccess) elements.closeAccess.style.display = "inline-flex";
  elements.accessForm?.querySelectorAll("input[data-section]").forEach((input) => {
    input.addEventListener("change", handleSectionToggle);
  });
  setStatus(elements.accessStatus, "", false);
}

function renderAccessEditor(profile) {
  const selected = profile.access?.sections || {};
  const sections = state.accessCatalog
    .filter((section) => !section.adminOnly)
    .map((section) => {
      const saved = selected[section.id] || {};
      const featureSet = new Set(saved.features || []);
      const checked = saved.enabled || featureSet.size ? "checked" : "";
      const featureOptions = (section.features || [])
        .map((feature) => {
          const featureChecked = featureSet.has(feature.id) || (saved.enabled && !(saved.features || []).length) ? "checked" : "";
          return `<label class="column-option">
            <input type="checkbox" data-feature="${escapeAttribute(section.id)}" value="${escapeAttribute(feature.id)}" ${featureChecked} />
            ${escapeHtml(feature.label)}
          </label>`;
        })
        .join("");
      return `<div class="access-section">
        <label class="access-section-heading">
          <input type="checkbox" data-section="${escapeAttribute(section.id)}" ${checked} />
          <span>${escapeHtml(section.label)}</span>
        </label>
        <div class="access-feature-grid">${featureOptions}</div>
      </div>`;
    })
    .join("");
  return `<input type="hidden" name="profileId" value="${escapeAttribute(profile.id)}" />
    <label class="filter-control">
      <span>Access Option Name</span>
      <input type="text" name="profileName" value="${escapeAttribute(profile.name)}" required />
    </label>
    <div class="access-section-list">${sections}</div>
    <button class="button" type="submit">Save Access Option</button>`;
}

function handleSectionToggle(event) {
  const sectionId = event.currentTarget.getAttribute("data-section");
  const checked = event.currentTarget.checked;
  elements.accessForm
    ?.querySelectorAll(`input[data-feature="${cssEscape(sectionId)}"]`)
    .forEach((input) => {
      input.checked = checked;
    });
}

async function handleSaveAccessProfile(event) {
  event.preventDefault();
  if (!state.editingAccessProfileId) return;
  const form = new FormData(elements.accessForm);
  const profileId = String(form.get("profileId") || state.editingAccessProfileId);
  const profileName = String(form.get("profileName") || "").trim();
  const access = collectAccessForm();
  const existing = state.accessProfiles.find((profile) => profile.id === profileId);
  const nextProfile = { id: profileId, name: profileName, builtIn: Boolean(existing?.builtIn), access };
  const profiles = state.accessProfiles.some((profile) => profile.id === profileId)
    ? state.accessProfiles.map((profile) => (profile.id === profileId ? nextProfile : profile))
    : [...state.accessProfiles, nextProfile];
  try {
    setStatus(elements.accessStatus, "Saving access option...", false);
    const { data } = await saveAccessProfiles({ profiles });
    state.accessProfiles = data || [];
    state.editingAccessProfileId = profileId;
    renderAccessChoiceOptions();
    renderAccessProfiles();
    renderUsers();
    setStatus(elements.accessStatus, "Access option saved.", false);
  } catch (error) {
    setStatus(elements.accessStatus, error.message || "Unable to save access option.", true);
  }
}

function collectAccessForm() {
  const sections = {};
  elements.accessForm?.querySelectorAll("input[data-section]").forEach((sectionInput) => {
    const sectionId = sectionInput.getAttribute("data-section");
    const features = Array.from(elements.accessForm.querySelectorAll(`input[data-feature="${cssEscape(sectionId)}"]:checked`)).map((input) => input.value);
    if (sectionInput.checked || features.length) {
      sections[sectionId] = { enabled: true, features };
    }
  });
  return { sections };
}

function closeAccessEditor() {
  renderAccessPlaceholder("Choose an access option above or create a new one.");
}

async function handleAssignUserAccess(event) {
  const userId = Number(event.currentTarget.getAttribute("data-assign-access-user"));
  const select = elements.usersList?.querySelector(`select[data-user-profile="${userId}"]`);
  const profileId = select?.value;
  if (!userId || !profileId) return;
  try {
    await updateManagedUserAccess(userId, { profileId });
    await loadUsers();
    setStatus(elements.createUserStatus, "User access saved.", false);
  } catch (error) {
    setStatus(elements.createUserStatus, error.message || "Unable to save user access.", true);
  }
}

async function handleDeleteAccessProfile(event) {
  const profileId = event.currentTarget.getAttribute("data-delete-access-profile");
  const profile = state.accessProfiles.find((item) => item.id === profileId);
  if (!profile || profile.builtIn) return;
  if (!confirm(`Delete access option ${profile.name}? Existing users keep their saved access until you change them.`)) return;
  try {
    const { data } = await saveAccessProfiles({ profiles: state.accessProfiles.filter((item) => item.id !== profileId) });
    state.accessProfiles = data || [];
    renderAccessChoiceOptions();
    renderAccessProfiles();
    renderUsers();
    setStatus(elements.accessStatus, "Access option deleted.", false);
  } catch (error) {
    setStatus(elements.accessStatus, error.message || "Unable to delete access option.", true);
  }
}

function findMatchingAccessProfile(access) {
  const normalized = JSON.stringify(access?.sections || {});
  return state.accessProfiles.find((profile) => JSON.stringify(profile.access?.sections || {}) === normalized);
}

async function handleDeleteUser(event) {
  const userId = Number(event.currentTarget.getAttribute("data-delete-user"));
  const user = state.users.find((item) => Number(item.id) === userId);
  if (!user) return;
  if (!confirm(`Delete ${user.displayName || user.email}? This removes their login access.`)) return;
  try {
    await deleteManagedUser(userId);
    await loadUsers();
    setStatus(elements.createUserStatus, "User deleted.", false);
  } catch (error) {
    setStatus(elements.createUserStatus, error.message || "Unable to delete user.", true);
  }
}

async function handleUnlockUser(event) {
  const userId = Number(event.currentTarget.getAttribute("data-unlock-user"));
  const user = state.users.find((item) => Number(item.id) === userId);
  if (!user) return;
  try {
    await unlockManagedUser(userId);
    await loadUsers();
    setStatus(elements.createUserStatus, `${user.displayName || user.email} unblocked.`, false);
  } catch (error) {
    setStatus(elements.createUserStatus, error.message || "Unable to unblock user.", true);
  }
}

function formatDateTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function applyBrand(profile) {
  const logo = document.querySelector(".sidebar .logo");
  if (!logo) return;
  logo.textContent = "Community ERP";
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

function setFormDisabled(form, disabled) {
  form?.querySelectorAll("input, select, textarea, button").forEach((input) => {
    input.disabled = disabled;
  });
}

function setStatus(element, message, isError) {
  if (!element) return;
  element.textContent = message;
  element.style.display = message ? "block" : "none";
  element.style.color = isError ? "var(--color-danger)" : "var(--color-muted)";
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

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}

init();
