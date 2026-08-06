import { fetchContacts, fetchAccounts, createContact } from "./api.js";
import { showToast } from "./ui.js";

const TABLE_LIMIT = 50;
const TYPEAHEAD_LIMIT = 5;

const state = {
  contacts: [],
  accounts: [],
  tags: [],
  query: "",
  isLoading: false,
  typeahead: {
    open: false,
    items: [],
    highlighted: -1,
    loading: false,
    error: "",
  },
};

const elements = {
  contactsBody: document.querySelector("[data-contacts-body]"),
  contactsCount: document.getElementById("contacts-count"),
  contactsFilter: document.getElementById("contacts-filter"),
  contactsFilterInput: document.querySelector("#contacts-filter input[name='query']"),
  contactsFilterAccount: document.getElementById("filter-account"),
  contactsFilterTag: document.getElementById("filter-tag"),
  contactsFilterPrimary: document.getElementById("filter-primary"),
  contactsFilterClear: document.getElementById("contacts-clear"),
  contactForm: document.getElementById("contact-form"),
  contactFormMessage: document.getElementById("contact-form-message"),
  accountSelect: document.getElementById("contact-account"),
  tagsSelect: document.getElementById("contact-tags"),
  newAffiliationBtn: document.getElementById("affiliation-new-btn"),
  deleteAffiliationBtn: document.getElementById("affiliation-delete-btn"),
  affiliationModal: document.getElementById("affiliation-modal"),
  affiliationForm: document.getElementById("affiliation-form"),
  affiliationType: document.getElementById("affiliation-type"),
  affiliationName: document.getElementById("affiliation-name"),
  affiliationDisplayName: document.getElementById("affiliation-displayName"),
  affiliationError: document.getElementById("affiliation-error"),
  affiliationCancel: document.getElementById("affiliation-cancel"),
  affiliationCancel2: document.getElementById("affiliation-cancel-2"),
  affiliationBackdrop: document.querySelector("[data-affiliation-backdrop]"),
  searchInput: document.getElementById("contact-search"),
  typeaheadPanel: document.getElementById("contact-typeahead"),
  deleteTagBtn: document.getElementById("tag-delete-btn"),
};

function formatName(contact) {
  if (!contact) return "";
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : contact.preferredName || contact.email || "Unknown";
}

function formatTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "--";
  return tags.join(", ");
}

function renderContacts() {
  if (!elements.contactsBody) return;
  if (state.isLoading) {
    elements.contactsBody.innerHTML = '<tr><td colspan="7">Loading contacts...</td></tr>';
    return;
  }
  if (!state.contacts.length) {
    elements.contactsBody.innerHTML = '<tr><td colspan="7">No contacts found.</td></tr>';
    return;
  }
  const rows = state.contacts.map((contact) => {
    const tags = formatTags(contact.tags);
    const primary = contact.isPrimary ? "Yes" : "No";
    return `<tr>
      <td>${formatName(contact)}</td>
      <td>${contact.accountName || "--"}</td>
      <td>${contact.email || "--"}</td>
      <td>${contact.phone || contact.mobile || "--"}</td>
      <td>${tags}</td>
      <td>${primary}</td>
      <td><button class="button danger" type="button" data-delete-contact="${contact.id}">Delete</button></td>
    </tr>`;
  });
  elements.contactsBody.innerHTML = rows.join("");
}

function renderContactsCount() {
  if (!elements.contactsCount) return;
  if (state.isLoading) {
    elements.contactsCount.textContent = "Loading contacts...";
    return;
  }
  elements.contactsCount.textContent = `${state.contacts.length} contact${state.contacts.length === 1 ? "" : "s"}`;
}

function renderAccountOptions() {
  if (!elements.accountSelect) return;
  const options = ['<option value="">(None)</option>'];
  for (const account of state.accounts) {
    options.push(`<option value="${account.id}">${account.displayName || account.name}</option>`);
  }
  elements.accountSelect.innerHTML = options.join("");
  // Filter dropdown
  if (elements.contactsFilterAccount) {
    const filterOptions = ['<option value="">All affiliations</option>'];
    for (const account of state.accounts) {
      filterOptions.push(`<option value="${account.id}">${account.displayName || account.name}</option>`);
    }
    elements.contactsFilterAccount.innerHTML = filterOptions.join("");
  }
}

function renderTagOptions() {
  const select = elements.tagsSelect;
  if (!select) return;
  const options = [];
  for (const tag of state.tags || []) {
    options.push(`<option value="${tag.name}">${tag.name}</option>`);
  }
  select.innerHTML = options.join("");
  // Filter dropdown
  if (elements.contactsFilterTag) {
    const filterOptions = ['<option value="">All tags</option>'];
    for (const tag of state.tags || []) {
      filterOptions.push(`<option value="${tag.name}">${tag.name}</option>`);
    }
    elements.contactsFilterTag.innerHTML = filterOptions.join("");
  }
}

function selectedTag() {
  const option = elements.tagsSelect ? Array.from(elements.tagsSelect.selectedOptions)[0] : null;
  if (!option) return null;
  return state.tags.find((tag) => tag.name === option.value) || null;
}

function openAffiliationModal() {
  if (!elements.affiliationModal) return;
  if (elements.affiliationError) {
    elements.affiliationError.textContent = "";
    elements.affiliationError.style.display = "none";
  }
  if (elements.affiliationForm) elements.affiliationForm.reset();
  if (elements.affiliationType) elements.affiliationType.value = "Organization";
  elements.affiliationModal.style.display = "block";
  setTimeout(() => elements.affiliationName && elements.affiliationName.focus(), 0);
}

function closeAffiliationModal() {
  if (!elements.affiliationModal) return;
  elements.affiliationModal.style.display = "none";
}

function showFormMessage(message, isError = false) {
  if (!elements.contactFormMessage) return;
  if (!message) {
    elements.contactFormMessage.style.display = "none";
    return;
  }
  elements.contactFormMessage.textContent = message;
  elements.contactFormMessage.style.display = "block";
  elements.contactFormMessage.style.color = isError ? "var(--color-danger)" : "var(--color-success)";
}

async function loadAccounts() {
  try {
    const response = await fetchAccounts();
    state.accounts = response.data || [];
    renderAccountOptions();
  } catch (error) {
    console.error("Failed to load accounts", error);
    showFormMessage("Failed to load accounts", true);
  }
}

async function loadTags() {
  try {
    const api = await import("./api.js");
    const response = await api.fetchContactTags();
    state.tags = response.data || [];
    renderTagOptions();
  } catch (error) {
    console.error("Failed to load tags", error);
    showFormMessage("Failed to load tags", true);
  }
}

async function loadContacts() {
  if (!elements.contactsBody) return;
  state.isLoading = true;
  renderContacts();
  renderContactsCount();
  try {
    const params = { q: state.query || undefined, limit: TABLE_LIMIT };
    const accVal = elements.contactsFilterAccount?.value || "";
    if (accVal) params.accountId = accVal;
    const tagVal = elements.contactsFilterTag?.value || "";
    if (tagVal) params.tag = tagVal;
    const primaryVal = elements.contactsFilterPrimary?.value || "";
    if (primaryVal === "true" || primaryVal === "false") {
      params.primary = primaryVal;
    }
    const response = await fetchContacts(params);
    state.contacts = response.data || [];
  } catch (error) {
    console.error("Failed to load contacts", error);
    state.contacts = [];
    showFormMessage("Failed to load contacts", true);
  } finally {
    state.isLoading = false;
    renderContacts();
    renderContactsCount();
  }
}

function handleFilterSubmit(event) {
  event.preventDefault();
  if (!elements.contactsFilterInput) return;
  state.query = elements.contactsFilterInput.value.trim();
  loadContacts();
}

function handleFilterClear() {
  state.query = "";
  if (elements.contactsFilterInput) elements.contactsFilterInput.value = "";
  if (elements.contactsFilterAccount) elements.contactsFilterAccount.value = "";
  if (elements.contactsFilterTag) elements.contactsFilterTag.value = "";
  if (elements.contactsFilterPrimary) elements.contactsFilterPrimary.value = "";
  loadContacts();
}

function getSelectedTags() {
  const select = elements.tagsSelect;
  if (!select) return [];
  return Array.from(select.selectedOptions).map((o) => o.value).filter(Boolean);
}

async function handleContactSubmit(event) {
  event.preventDefault();
  const form = elements.contactForm;
  if (!form) return;
  const data = new FormData(form);
  const payload = {
    accountId: data.get("accountId") ? Number(data.get("accountId")) : null,
    firstName: data.get("firstName")?.trim() || "",
    lastName: data.get("lastName")?.trim() || "",
    email: data.get("email")?.trim() || null,
    phone: data.get("phone")?.trim() || null,
    mobile: data.get("mobile")?.trim() || null,
    tags: getSelectedTags(),
    isPrimary: data.get("isPrimary") === "on",
  };

  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;
  showFormMessage("Creating contact...", false);

  try {
    await createContact(payload);
    showToast("Contact saved", "ok");
    showFormMessage("Contact saved.", false);
    state.query = "";
    if (elements.contactsFilterInput) {
      elements.contactsFilterInput.value = "";
    }
    if (elements.searchInput) {
      elements.searchInput.value = "";
    }
    form.reset();
    closeTypeahead();
    loadContacts();
  } catch (error) {
    showFormMessage(error.message || "Failed to create contact", true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function attachListeners() {
  if (elements.contactsFilter) {
    elements.contactsFilter.addEventListener("submit", handleFilterSubmit);
  }
  if (elements.contactForm) {
    elements.contactForm.addEventListener("submit", handleContactSubmit);
  }
  if (elements.contactsBody) {
    elements.contactsBody.addEventListener("click", handleContactsTableClick);
  }
  if (elements.contactsFilterClear) {
    elements.contactsFilterClear.addEventListener("click", handleFilterClear);
  }
  // Affiliation quick-create wiring
  if (elements.newAffiliationBtn) {
    elements.newAffiliationBtn.addEventListener("click", openAffiliationModal);
  }
  if (elements.deleteAffiliationBtn) {
    elements.deleteAffiliationBtn.addEventListener("click", async () => {
      const accountId = Number(elements.accountSelect?.value || 0);
      const account = state.accounts.find((item) => Number(item.id) === accountId);
      if (!account) {
        showFormMessage("Choose an affiliation to delete.", true);
        return;
      }
      if (!window.confirm(`Remove affiliation ${account.displayName || account.name} from the picker? Existing contacts keep their history.`)) {
        return;
      }
      try {
        const api = await import("./api.js");
        await api.deleteAccount(accountId);
        showToast("Affiliation removed", "ok");
        await loadAccounts();
        await loadContacts();
      } catch (error) {
        showFormMessage(error.message || "Failed to remove affiliation", true);
      }
    });
  }
  if (elements.affiliationCancel) {
    elements.affiliationCancel.addEventListener("click", closeAffiliationModal);
  }
  if (elements.affiliationCancel2) {
    elements.affiliationCancel2.addEventListener("click", closeAffiliationModal);
  }
  if (elements.affiliationBackdrop) {
    elements.affiliationBackdrop.addEventListener("click", closeAffiliationModal);
  }
  if (elements.affiliationForm) {
    elements.affiliationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = elements.affiliationName?.value?.trim();
      const type = elements.affiliationType?.value || "Organization";
      const displayName = elements.affiliationDisplayName?.value?.trim();
      const submitButton = document.getElementById("affiliation-submit");
      const fail = (msg) => {
        if (elements.affiliationError) {
          elements.affiliationError.textContent = msg || "";
          elements.affiliationError.style.display = msg ? "block" : "none";
        }
      };
      fail("");
      if (!name) {
        fail("Name is required");
        elements.affiliationName?.focus();
        return;
      }
      try {
        if (submitButton) submitButton.disabled = true;
        // Lazy import to avoid modifying top-level imports if not needed
        const api = await import("./api.js");
        const { data } = await api.createAccount({ type, name, displayName: displayName || null });
        showToast("Affiliation created", "ok");
        closeAffiliationModal();
        await loadAccounts();
        if (elements.accountSelect && data?.id) {
          elements.accountSelect.value = String(data.id);
        }
      } catch (error) {
        fail(error.message || "Failed to create affiliation");
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }
  // Tag quick-create wiring
  const tagModal = document.getElementById("tag-modal");
  const tagBtn = document.getElementById("tag-new-btn");
  const tagForm = document.getElementById("tag-form");
  const tagCancel = document.getElementById("tag-cancel");
  const tagCancel2 = document.getElementById("tag-cancel-2");
  const tagBackdrop = document.querySelector("[data-tag-backdrop]");
  const tagName = document.getElementById("tag-name");
  const tagError = document.getElementById("tag-error");
  const tagSubmit = document.getElementById("tag-submit");

  function openTagModal() {
    if (!tagModal) return;
    if (tagError) { tagError.textContent = ""; tagError.style.display = "none"; }
    if (tagForm) tagForm.reset();
    tagModal.style.display = "block";
    setTimeout(() => tagName && tagName.focus(), 0);
  }
  function closeTagModal() {
    if (!tagModal) return;
    tagModal.style.display = "none";
  }
  if (tagBtn) tagBtn.addEventListener("click", openTagModal);
  if (elements.deleteTagBtn) {
    elements.deleteTagBtn.addEventListener("click", async () => {
      const tag = selectedTag();
      if (!tag) {
        showFormMessage("Choose a tag to delete.", true);
        return;
      }
      if (!window.confirm(`Delete tag ${tag.name}? This removes it from contacts too.`)) {
        return;
      }
      try {
        const api = await import("./api.js");
        await api.deleteContactTag(tag.id);
        showToast("Tag deleted", "ok");
        await loadTags();
        await loadContacts();
      } catch (error) {
        showFormMessage(error.message || "Failed to delete tag", true);
      }
    });
  }
  if (tagCancel) tagCancel.addEventListener("click", closeTagModal);
  if (tagCancel2) tagCancel2.addEventListener("click", closeTagModal);
  if (tagBackdrop) tagBackdrop.addEventListener("click", closeTagModal);
  if (tagForm) {
    tagForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = tagName?.value?.trim();
      const fail = (msg) => {
        if (tagError) { tagError.textContent = msg || ""; tagError.style.display = msg ? "block" : "none"; }
      };
      fail("");
      if (!name) { fail("Name is required"); tagName?.focus(); return; }
      try {
        if (tagSubmit) tagSubmit.disabled = true;
        const api = await import("./api.js");
        const { data } = await api.createContactTag({ name });
        showToast("Tag created", "ok");
        closeTagModal();
        await loadTags();
        // Auto-select the new tag
        if (elements.tagsSelect && data?.name) {
          const option = Array.from(elements.tagsSelect.options).find((o) => o.value === data.name);
          if (option) option.selected = true;
        }
      } catch (error) {
        fail(error.message || "Failed to create tag");
      } finally {
        if (tagSubmit) tagSubmit.disabled = false;
      }
    });
  }
}

async function handleContactsTableClick(event) {
  const button = event.target.closest("[data-delete-contact]");
  if (!button) return;

  const id = Number(button.getAttribute("data-delete-contact"));
  const contact = state.contacts.find((item) => item.id === id);
  const name = formatName(contact);
  const ok = window.confirm(`Delete contact ${name}? This removes the contact from CRM lists.`);
  if (!ok) return;

  try {
    button.disabled = true;
    const api = await import("./api.js");
    await api.deleteContact(id);
    showToast("Contact deleted", "ok");
    showFormMessage("Contact deleted.", false);
    await loadContacts();
  } catch (error) {
    button.disabled = false;
    showFormMessage(error.message || "Failed to delete contact", true);
  }
}

// --- Typeahead search wiring ---
let typeaheadTimer = null;
let lastTypeaheadQuery = "";

function renderTypeahead() {
  const panel = elements.typeaheadPanel;
  if (!panel) return;

  panel.innerHTML = "";
  if (!state.typeahead.open) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  panel.setAttribute("role", "listbox");

  if (state.typeahead.loading) {
    panel.innerHTML = '<div class="typeahead__item" aria-hidden="true">Searching...</div>';
    return;
  }

  if (state.typeahead.error) {
    panel.innerHTML = '<div class="typeahead__item" aria-hidden="true" style="color: var(--color-danger);">Couldn\'t search right now</div>';
    return;
  }

  const items = (state.typeahead.items || []).slice(0, TYPEAHEAD_LIMIT);
  if (!items.length) {
    panel.innerHTML = '<div class="typeahead__item" aria-hidden="true" style="color: var(--color-muted);">No results</div>';
    return;
  }

  items.forEach((contact, idx) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "typeahead__item";
    button.setAttribute("role", "option");
    button.setAttribute("data-index", String(idx));
    button.setAttribute("aria-selected", state.typeahead.highlighted === idx ? "true" : "false");
    button.innerHTML = `
      <span>${formatName(contact)}</span>
      <span style="font-size:12px;color:var(--color-muted);">${contact.email || "No email"}</span>
    `;

    button.addEventListener("mouseenter", () => {
      state.typeahead.highlighted = idx;
      updateHighlightedItem();
    });
    button.addEventListener("mouseleave", () => {
      state.typeahead.highlighted = -1;
      updateHighlightedItem();
    });
    button.addEventListener("click", () => selectTypeahead(idx));

    panel.appendChild(button);
  });
}

function updateHighlightedItem() {
  const panel = elements.typeaheadPanel;
  if (!panel) return;
  panel.querySelectorAll(".typeahead__item").forEach((node, idx) => {
    node.setAttribute("aria-selected", state.typeahead.highlighted === idx ? "true" : "false");
  });
}

function openTypeahead() {
  state.typeahead.open = true;
  state.typeahead.highlighted = -1;
  renderTypeahead();
}

function closeTypeahead() {
  state.typeahead.open = false;
  state.typeahead.loading = false;
  state.typeahead.error = "";
  state.typeahead.items = [];
  state.typeahead.highlighted = -1;
  lastTypeaheadQuery = "";
  if (typeaheadTimer) {
    clearTimeout(typeaheadTimer);
    typeaheadTimer = null;
  }
  const panel = elements.typeaheadPanel;
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = "";
  }
}

function selectTypeahead(index) {
  const item = state.typeahead.items[index];
  if (!item) return;
  const q = item.email || `${item.firstName || ""} ${item.lastName || ""}`.trim();
  if (elements.searchInput) {
    elements.searchInput.value = q;
  }
  if (elements.contactsFilterInput) {
    elements.contactsFilterInput.value = q;
  }
  state.query = q;
  closeTypeahead();
  loadContacts();
}

async function performTypeahead(text) {
  const trimmed = text.trim();
  lastTypeaheadQuery = trimmed;
  if (!trimmed) {
    closeTypeahead();
    return;
  }

  state.typeahead.loading = true;
  state.typeahead.error = "";
  state.typeahead.items = [];
  openTypeahead();
  renderTypeahead();

  try {
    const { data } = await fetchContacts({ q: trimmed, limit: TYPEAHEAD_LIMIT });
    if (lastTypeaheadQuery !== trimmed) {
      return; // stale response
    }
    state.typeahead.items = Array.isArray(data) ? data.slice(0, TYPEAHEAD_LIMIT) : [];
    state.typeahead.loading = false;
    renderTypeahead();
  } catch (error) {
    if (lastTypeaheadQuery !== trimmed) {
      return;
    }
    console.error("Typeahead search failed", error);
    state.typeahead.loading = false;
    state.typeahead.error = "error";
    renderTypeahead();
  }
}

function attachTypeahead() {
  const input = elements.searchInput;
  const panel = elements.typeaheadPanel;
  if (!input || !panel) return;

  input.addEventListener("input", () => {
    const value = input.value;
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
    if (!value.trim()) {
      closeTypeahead();
      return;
    }
    typeaheadTimer = setTimeout(() => {
      performTypeahead(value);
    }, 250);
  });

  input.addEventListener("focus", () => {
    if (state.typeahead.items.length) {
      openTypeahead();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (!state.typeahead.open) return;
    const max = Math.min(state.typeahead.items.length, TYPEAHEAD_LIMIT);
    if (!max) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.typeahead.highlighted = (state.typeahead.highlighted + 1 + max) % max;
      updateHighlightedItem();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.typeahead.highlighted = (state.typeahead.highlighted - 1 + max) % max;
      updateHighlightedItem();
    } else if (event.key === "Enter") {
      if (state.typeahead.highlighted >= 0) {
        event.preventDefault();
        selectTypeahead(state.typeahead.highlighted);
      }
    } else if (event.key === "Escape") {
      closeTypeahead();
    }
  });

  document.addEventListener("click", (event) => {
    if (!panel) return;
    if (event.target === input || panel.contains(event.target)) {
      return;
    }
    closeTypeahead();
  });

  panel.addEventListener("mousedown", (event) => {
    // Prevent the input from losing focus before click handlers run.
    event.preventDefault();
  });
}

function onAuthReady(user) {
  if (!user) {
    state.contacts = [];
    renderContacts();
    renderContactsCount();
    return;
  }
  loadAccounts();
  loadTags();
  loadContacts();
}

function init() {
  attachListeners();
  attachTypeahead();
  if (window.__ERP_USER__) {
    onAuthReady(window.__ERP_USER__);
  }
  document.addEventListener("auth:ready", (event) => {
    onAuthReady(event.detail?.user || null);
  });
}

init();
