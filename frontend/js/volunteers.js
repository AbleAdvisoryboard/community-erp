import { fetchVolunteers, createVolunteer, fetchVolunteerShifts, createVolunteerShift, logVolunteerHours, fetchVolunteerHoursSummary, fetchContacts, fetchVolunteerVocab, createVolunteerVocab, deleteVolunteerVocab } from "./api.js";
const DEFAULT_SKILLS = [
  "Administrative Support",
  "Childcare",
  "Cooking",
  "Data Entry",
  "Driving",
  "Event Setup",
  "First Aid",
  "Food Prep",
  "Fundraising",
  "Grant Writing",
  "Inventory",
  "Logistics",
  "Mentoring",
  "Outreach",
  "Photography",
  "Technology Support",
  "Training",
  "Translation",
  "Tutoring",
];
const DEFAULT_INTERESTS = [
  "Administration",
  "Advocacy",
  "Communications",
  "Community Meals",
  "Cooking",
  "Education",
  "Emergency Response",
  "Events",
  "Food Pantry",
  "Fundraising",
  "Health and Wellness",
  "Housing Support",
  "Inventory",
  "Mentoring",
  "Outreach",
  "Senior Support",
  "Transportation",
  "Tutoring",
  "Youth Programs",
];

// Persist user-defined skills/interests locally so options stick across navigation
const LS_SKILLS = "erp.volunteers.skills";
const LS_INTERESTS = "erp.volunteers.interests";

function saveLocalList(key, values) {
  try {
    const unique = [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];
    localStorage.setItem(key, JSON.stringify(unique.slice(0, 500)));
  } catch (_e) {
    // ignore storage errors (e.g., private mode)
  }
}

const state = {
  volunteers: [],
  shifts: [],
  hoursSummary: [],
  contacts: [],
  filters: {},
  availableSkills: [],
  availableInterests: [],
  selectedSkills: [],
  selectedInterests: [],
  currentUser: window.__ERP_USER__ || null,
};

const volunteersBody = document.querySelector("[data-volunteers-body]");
const volunteerCount = document.getElementById("volunteer-count");
const volunteerForm = document.getElementById("volunteer-form");
const volunteerMessage = document.getElementById("volunteer-message");
const contactSelect = document.getElementById("volunteer-contact-select");
const skillSelect = document.getElementById("skill-select");
const removeSkillBtn = document.getElementById("remove-skill-btn");
const skillNewBtn = document.getElementById("skill-new-btn");
const skillModal = document.getElementById("skill-modal");
const skillForm = document.getElementById("skill-form");
const skillNameInput = document.getElementById("skill-name");
const skillCancel = document.getElementById("skill-cancel");
const skillCancel2 = document.getElementById("skill-cancel-2");
const skillBackdrop = document.querySelector("[data-skill-backdrop]");
const selectedSkillsWrap = document.getElementById("selected-skills");
const interestSelect = document.getElementById("interest-select");
const removeInterestBtn = document.getElementById("remove-interest-btn");
const interestNewBtn = document.getElementById("interest-new-btn");
const interestModal = document.getElementById("interest-modal");
const interestForm = document.getElementById("interest-form");
const interestNameInput = document.getElementById("interest-name");
const interestCancel = document.getElementById("interest-cancel");
const interestCancel2 = document.getElementById("interest-cancel-2");
const interestBackdrop = document.querySelector("[data-interest-backdrop]");
const selectedInterestsWrap = document.getElementById("selected-interests");
// Delete modals
const skillDeleteModal = document.getElementById("skill-delete-modal");
const skillDeleteForm = document.getElementById("skill-delete-form");
const skillDeleteSelect = document.getElementById("skill-delete-select");
const skillDeleteCancel = document.getElementById("skill-delete-cancel");
const skillDeleteCancel2 = document.getElementById("skill-delete-cancel-2");
const skillDeleteBackdrop = document.querySelector("[data-skill-delete-backdrop]");
const interestDeleteModal = document.getElementById("interest-delete-modal");
const interestDeleteForm = document.getElementById("interest-delete-form");
const interestDeleteSelect = document.getElementById("interest-delete-select");
const interestDeleteCancel = document.getElementById("interest-delete-cancel");
const interestDeleteCancel2 = document.getElementById("interest-delete-cancel-2");
const interestDeleteBackdrop = document.querySelector("[data-interest-delete-backdrop]");
const shiftForm = document.getElementById("shift-form");
const shiftMessage = document.getElementById("shift-message");
const shiftVolunteerSelect = document.getElementById("shift-volunteer-select");
const shiftEventSelect = document.getElementById("shift-event-select");
const shiftsBody = document.querySelector("[data-shifts-body]");
const hoursForm = document.getElementById("hours-form");
const hoursMessage = document.getElementById("hours-message");
const hoursVolunteerSelect = document.getElementById("hours-volunteer-select");
const hoursEventSelect = document.getElementById("hours-event-select");
const hoursSummaryBody = document.querySelector("[data-hours-summary]");
const volunteerSearch = document.getElementById("volunteer-search");

function setMessage(el, text, tone = "info") {
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = text;
  el.style.color = tone === "error" ? "var(--color-danger)" : tone === "success" ? "var(--color-success)" : "var(--color-muted)";
}

function userIsAdmin(user) {
  return (user?.roles || []).some((role) => role.name === "Admin");
}

function userCanSeeFeature(user, sectionId, featureId) {
  if (userIsAdmin(user)) return true;
  const accessSection = user?.access?.sections?.[sectionId];
  const features = accessSection?.features || [];
  return Boolean(accessSection?.enabled && (!features.length || features.includes(featureId)));
}

function applyFeatureAccess(user = state.currentUser) {
  state.currentUser = user || null;
  document.querySelectorAll("[data-access-section][data-access-feature]").forEach((section) => {
    const sectionId = section.getAttribute("data-access-section");
    const featureId = section.getAttribute("data-access-feature");
    section.style.display = userCanSeeFeature(state.currentUser, sectionId, featureId) ? "" : "none";
  });
}

function renderVolunteers(list) {
  if (!volunteersBody) return;
  let working = Array.isArray(list) ? list.slice() : [];
  const sortBy = (state.filters.sortBy || "").trim();
  const sortDir = (state.filters.sortDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const filterText = (state.filters.filterText || "").toLowerCase();
  if (filterText && sortBy) {
    const getter = (v) => {
      if (sortBy === "name") return (v.name || "").toLowerCase();
      if (sortBy === "email") return (v.email || "").toLowerCase();
      if (sortBy === "status") return (v.backgroundCheckStatus || "").toLowerCase();
      if (sortBy === "skills") return (v.skills || []).join(", ").toLowerCase();
      if (sortBy === "interests") return (v.interests || []).join(", ").toLowerCase();
      return "";
    };
    working = working.filter((v) => getter(v).includes(filterText));
  }
  if (sortBy) {
    const getter = (v) => {
      if (sortBy === "name") return v.name || "";
      if (sortBy === "email") return v.email || "";
      if (sortBy === "status") return v.backgroundCheckStatus || "";
      if (sortBy === "skills") return (v.skills || []).join(", ");
      if (sortBy === "interests") return (v.interests || []).join(", ");
      return "";
    };
    working.sort((a, b) => {
      const av = getter(a).toString().toLowerCase();
      const bv = getter(b).toString().toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }
  if (!working.length) {
    volunteersBody.innerHTML = '<tr><td colspan="5">No volunteers found.</td></tr>';
    if (volunteerCount) volunteerCount.textContent = "0 volunteers";
    return;
  }
  volunteersBody.innerHTML = working
    .map((volunteer) => `
      <tr>
        <td>${volunteer.name}</td>
        <td>${volunteer.email || "-"}</td>
        <td>${volunteer.skills.join(', ') || "-"}</td>
        <td>${volunteer.interests.join(', ') || "-"}</td>
        <td>${volunteer.backgroundCheckStatus}</td>
      </tr>`)
    .join("");
  if (volunteerCount) volunteerCount.textContent = `${working.length} volunteer${working.length === 1 ? "" : "s"}`;

  const options = ['<option value="">Unassigned</option>']
    .concat(list.map((vol) => `<option value="${vol.id}">${vol.name}</option>`));
  if (shiftVolunteerSelect) shiftVolunteerSelect.innerHTML = options.join("");
  if (hoursVolunteerSelect) {
    const hourOptions = ['<option value="">Select volunteer</option>']
      .concat(list.map((vol) => `<option value="${vol.id}">${vol.name}</option>`));
    hoursVolunteerSelect.innerHTML = hourOptions.join("");
  }
}

function renderShifts(list) {
  if (!shiftsBody) return;
  let working = Array.isArray(list) ? list.slice() : [];
  const sortBy = (state.shiftFilters?.sortBy || "").trim();
  const sortDir = (state.shiftFilters?.sortDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const filterText = (state.shiftFilters?.filterText || "").toLowerCase();
  if (filterText && sortBy) {
    const getter = (s) => {
      if (sortBy === "event") return (s.eventName || "").toLowerCase();
      if (sortBy === "title") return (s.title || "").toLowerCase();
      if (sortBy === "volunteer") return (s.volunteerName || "").toLowerCase();
      if (sortBy === "status") return (s.status || "").toLowerCase();
      if (sortBy === "start") return (s.startAt || "").toString().toLowerCase();
      return "";
    };
    working = working.filter((s) => getter(s).includes(filterText));
  }
  if (sortBy) {
    const getter = (s) => {
      if (sortBy === "event") return s.eventName || "";
      if (sortBy === "title") return s.title || "";
      if (sortBy === "volunteer") return s.volunteerName || "";
      if (sortBy === "status") return s.status || "";
      if (sortBy === "start") return s.startAt || "";
      return "";
    };
    working.sort((a,b) => {
      const av = getter(a).toString().toLowerCase();
      const bv = getter(b).toString().toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }
  if (!working.length) {
    shiftsBody.innerHTML = '<tr><td colspan="5">No shifts recorded.</td></tr>';
    return;
  }
  shiftsBody.innerHTML = working
    .map((shift) => `
      <tr>
        <td>${shift.eventName || '-'}</td>
        <td>${shift.title}</td>
        <td>${shift.volunteerName || "Unassigned"}</td>
        <td>${shift.startAt ? new Date(shift.startAt).toLocaleString() : "-"}</td>
        <td>${shift.status}</td>
      </tr>`)
    .join("");
}

function renderHoursSummary(rows) {
  if (!hoursSummaryBody) return;
  let working = Array.isArray(rows) ? rows.slice() : [];
  const sortBy = (state.hoursFilters?.sortBy || "").trim();
  const sortDir = (state.hoursFilters?.sortDir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const filterText = (state.hoursFilters?.filterText || "").toLowerCase();
  if (filterText && sortBy) {
    const getter = (r) => {
      if (sortBy === "volunteer") return (r.volunteer_name || "").toLowerCase();
      if (sortBy === "event") return (r.event_name || r.shift_title || "").toLowerCase();
      if (sortBy === "total") return String(r.total_hours ?? '').toLowerCase();
      if (sortBy === "mtd") return String(r.hours_mtd ?? '').toLowerCase();
      if (sortBy === "ytd") return String(r.hours_ytd ?? '').toLowerCase();
      return "";
    };
    working = working.filter((r) => getter(r).includes(filterText));
  }
  if (sortBy) {
    const getter = (r) => {
      if (sortBy === "volunteer") return r.volunteer_name || "";
      if (sortBy === "event") return r.event_name || r.shift_title || "";
      if (sortBy === "total") return Number(r.total_hours || 0);
      if (sortBy === "mtd") return Number(r.hours_mtd || 0);
      if (sortBy === "ytd") return Number(r.hours_ytd || 0);
      return "";
    };
    working.sort((a,b) => {
      const av = getter(a);
      const bv = getter(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as < bs) return sortDir === 'asc' ? -1 : 1;
      if (as > bs) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  if (!working.length) {
    hoursSummaryBody.innerHTML = '<tr><td colspan="5">No hours logged.</td></tr>';
    return;
  }
  const fmt = (value) => Number(value || 0).toFixed(2);
  hoursSummaryBody.innerHTML = working
    .map((row) => `
      <tr>
        <td>${row.volunteer_name}</td>
        <td>${row.event_name || row.shift_title || '-'}</td>
        <td style="text-align:right;">${fmt(row.total_hours)}</td>
        <td style="text-align:right;">${fmt(row.hours_mtd)}</td>
        <td style="text-align:right;">${fmt(row.hours_ytd)}</td>
      </tr>`)
    .join("");
}

function renderOptions(selectEl, options, selectedValues = []) {
  if (!selectEl) return;
  const isMulti = !!selectEl.multiple;
  const opts = [];
  if (!isMulti) {
    opts.push("<option value=\"\">Select</option>");
  }
  const selectedSet = new Set((selectedValues || []).map(String));
  for (const o of options) {
    const sel = selectedSet.has(String(o)) ? " selected" : "";
    opts.push(`<option value="${o}"${sel}>${o}</option>`);
  }
  selectEl.innerHTML = opts.join("");
}

function renderSelectedTags(container, values) {
  if (!container) return;
  if (!values.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = values
    .map(
      (v) =>
        `<span data-tag="${v}" style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border:1px solid var(--color-border);border-radius:999px;">${v}<button type="button" data-remove-tag="${v}" aria-label="Remove ${v}" style="border:none;background:transparent;color:var(--color-muted);cursor:pointer">×</button></span>`
    )
    .join(" ");
}

async function loadContacts() {
  try {
    const { data } = await fetchContacts({ limit: 500 });
    state.contacts = Array.isArray(data) ? data : [];
    if (contactSelect) {
      const options = ['<option value="">Select contact</option>']
        .concat(state.contacts.map((contact) => `<option value="${contact.id}">${contact.firstName} ${contact.lastName}</option>`));
      contactSelect.innerHTML = options.join("");
    }
  } catch (error) {
    console.error("Failed to load contacts", error);
  }
}

async function loadVolunteers() {
  try {
    if (volunteersBody) {
      volunteersBody.innerHTML = '<tr><td colspan="5">Loading volunteers...</td></tr>';
      if (volunteerCount) volunteerCount.textContent = "Loading volunteers...";
    }
    const params = {};
    if (state.filters.search) params.search = state.filters.search;
    const { data } = await fetchVolunteers(params);
    state.volunteers = data;
    renderVolunteers(data);

    // Do not overwrite vocab lists here; loadGlobalTags handles vocab.
    renderSelectedTags(selectedSkillsWrap, state.selectedSkills);
    renderSelectedTags(selectedInterestsWrap, state.selectedInterests);
  } catch (error) {
    console.error("Failed to load volunteers", error);
    if (volunteersBody) volunteersBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
  }
}

// Load global tags (CRM tags) and populate skills/interests lists
async function loadGlobalTags() {
  try {
    const [skillsRes, interestsRes] = await Promise.all([
      fetchVolunteerVocab({ type: "skill" }),
      fetchVolunteerVocab({ type: "interest" }),
    ]);
    const skills = (skillsRes?.data || []).map((x) => x.name).filter(Boolean);
    const interests = (interestsRes?.data || []).map((x) => x.name).filter(Boolean);
    state.availableSkills = (skills.length ? skills : DEFAULT_SKILLS.slice()).sort((a, b) => a.localeCompare(b));
    state.availableInterests = (interests.length ? interests : DEFAULT_INTERESTS.slice()).sort((a, b) => a.localeCompare(b));
    renderOptions(skillSelect, state.availableSkills, state.selectedSkills);
    renderOptions(interestSelect, state.availableInterests, state.selectedInterests);
  } catch (e) {
    console.error("Failed to load tags", e);
    if (!state.availableSkills.length) state.availableSkills = DEFAULT_SKILLS.slice();
    if (!state.availableInterests.length) state.availableInterests = DEFAULT_INTERESTS.slice();
    renderOptions(skillSelect, state.availableSkills, state.selectedSkills);
    renderOptions(interestSelect, state.availableInterests, state.selectedInterests);
  }
}

async function loadShifts() {
  try {
    const { data } = await fetchVolunteerShifts();
    // Map event names if present in future responses
    state.shifts = (data || []).map((s) => {
      const event = (window.__VOL_EVENTS__ || []).find((e) => e.id === s.eventId);
      return event ? { ...s, eventName: event.name } : s;
    });
    renderShifts(state.shifts);
  } catch (error) {
    console.error("Failed to load shifts", error);
  }
}

async function loadHoursSummary() {
  try {
    const { data } = await fetchVolunteerHoursSummary();
    state.hoursSummary = data;
    renderHoursSummary(data);
  } catch (error) {
    console.error("Failed to load volunteer hours", error);
  }
}

async function loadEvents() {
  try {
    const api = await import("./api.js");
    const { data } = await api.fetchEvents({ limit: 200, upcoming: true });
    state.events = Array.isArray(data) ? data : [];
    window.__VOL_EVENTS__ = state.events.slice();
    const opts = ['<option value="">No event</option>']
      .concat(state.events.map((e) => `<option value="${e.id}">${e.name}</option>`));
    if (typeof document !== "undefined") {
      if (shiftEventSelect) shiftEventSelect.innerHTML = opts.join("");
      if (hoursEventSelect) hoursEventSelect.innerHTML = opts.join("");
    }
  } catch (error) {
    console.error("Failed to load events", error);
    if (shiftEventSelect) shiftEventSelect.innerHTML = '<option value="">No event</option>';
    if (hoursEventSelect) hoursEventSelect.innerHTML = '<option value="">No event</option>';
  }
}

if (volunteerForm) {
  volunteerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(volunteerMessage, "Sign in to add volunteers.", "error");
      return;
    }
    const form = new FormData(volunteerForm);
    const payload = {
      contactId: Number(form.get("contactId")),
      skills: state.selectedSkills.slice(),
      interests: state.selectedInterests.slice(),
    };
    if (!payload.contactId) {
      setMessage(volunteerMessage, "Choose a contact to link.", "error");
      return;
    }
    try {
      await createVolunteer(payload);
      setMessage(volunteerMessage, "Volunteer added.", "success");
      volunteerForm.reset();
      state.selectedSkills = [];
      state.selectedInterests = [];
        renderSelectedTags(selectedSkillsWrap, state.selectedSkills);
        renderSelectedTags(selectedInterestsWrap, state.selectedInterests);
        // Clear selections in the multi-selects
        if (skillSelect) {
          for (const opt of skillSelect.options) opt.selected = false;
        }
        if (interestSelect) {
          for (const opt of interestSelect.options) opt.selected = false;
        }
        loadVolunteers();
        loadShifts();
        loadHoursSummary();
    } catch (error) {
      setMessage(volunteerMessage, error.message || "Failed to create volunteer.", "error");
    }
  });
}

if (shiftForm) {
  shiftForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(shiftMessage, "Sign in to schedule shifts.", "error");
      return;
    }
    const form = new FormData(shiftForm);
    const payload = {
      volunteerId: form.get("volunteerId") ? Number(form.get("volunteerId")) : null,
      eventId: form.get("eventId") ? Number(form.get("eventId")) : null,
      title: form.get("title"),
      startAt: form.get("startAt"),
      endAt: form.get("endAt") || null,
    };
    try {
      await createVolunteerShift(payload);
      setMessage(shiftMessage, "Shift scheduled.", "success");
      shiftForm.reset();
      loadShifts();
    } catch (error) {
      setMessage(shiftMessage, error.message || "Failed to schedule shift.", "error");
    }
  });
}

if (hoursForm) {
  hoursForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(hoursMessage, "Sign in to log hours.", "error");
      return;
    }
    const form = new FormData(hoursForm);
    const payload = {
      volunteerId: Number(form.get("volunteerId")),
      eventId: form.get("eventId") ? Number(form.get("eventId")) : null,
      serviceDate: form.get("serviceDate"),
      hours: Number(form.get("hours")),
    };
    if (!payload.volunteerId || !payload.serviceDate) {
      setMessage(hoursMessage, "Volunteer and date are required.", "error");
      return;
    }
    try {
      await logVolunteerHours(payload);
      setMessage(hoursMessage, "Hours logged.", "success");
      hoursForm.reset();
      loadHoursSummary();
    } catch (error) {
      setMessage(hoursMessage, error.message || "Failed to log hours.", "error");
    }
  });
}

if (volunteerSearch) {
  let debounce;
  volunteerSearch.addEventListener("input", (event) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.filters.search = event.target.value || undefined;
      loadVolunteers();
    }, 250);
  });
}

// Add handlers for adding/removing skills/interests

if (removeSkillBtn) {
  removeSkillBtn.addEventListener("click", () => {
      if (!skillDeleteModal || !skillDeleteSelect) return;
      // Show all available skills; preselect ones currently chosen
      const selectedSet = new Set(state.selectedSkills || []);
      const opts = (state.availableSkills || []).map((v) => `<option value="${v}"${selectedSet.has(v) ? ' selected' : ''}>${v}</option>`);
      skillDeleteSelect.innerHTML = opts.join("");
      openModal(skillDeleteModal, skillDeleteSelect, removeSkillBtn);
    });
}


  if (removeInterestBtn && interestSelect) {
  removeInterestBtn.addEventListener("click", () => {
    if (!interestDeleteModal || !interestDeleteSelect) return;
    const selectedSet = new Set(state.selectedInterests || []);
    const opts = (state.availableInterests || []).map((v) => `<option value="${v}"${selectedSet.has(v) ? ' selected' : ''}>${v}</option>`);
    interestDeleteSelect.innerHTML = opts.join("");
    openModal(interestDeleteModal, interestDeleteSelect, removeInterestBtn);
  });
}

// Modal helpers
let __lastModalOpener = null;
function openModal(modalEl, focusEl, openerEl) {
  if (!modalEl) return;
  __lastModalOpener = openerEl || document.activeElement || null;
  modalEl.style.display = "block";
  modalEl.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    if (focusEl && typeof focusEl.focus === "function") {
      focusEl.focus();
    }
  }, 0);
}
function closeModal(modalEl) {
  if (!modalEl) return;
  try {
    const active = document.activeElement;
    if (active && modalEl.contains(active) && typeof active.blur === "function") {
      active.blur();
    }
  } catch (error) {
    console.info("Modal focus cleanup skipped", error.message);
  }
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.style.display = "none";
  try {
    if (__lastModalOpener && typeof __lastModalOpener.focus === "function") {
      __lastModalOpener.focus();
    } else if (document.body && typeof document.body.focus === "function") {
      document.body.focus();
    }
  } catch (error) {
    console.info("Modal focus restore skipped", error.message);
  }
  __lastModalOpener = null;
}

// New Skill modal
if (skillNewBtn) {
  skillNewBtn.addEventListener("click", () => openModal(skillModal, skillNameInput, skillNewBtn));
}
if (skillCancel) skillCancel.addEventListener("click", () => closeModal(skillModal));
if (skillCancel2) skillCancel2.addEventListener("click", () => closeModal(skillModal));
if (skillBackdrop) skillBackdrop.addEventListener("click", () => closeModal(skillModal));
  if (skillForm) {
    skillForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (skillNameInput?.value || "").trim();
      if (!name) return;
      try {
        const resp = await createVolunteerVocab({ type: "skill", name });
        const tagName = resp?.data?.name || name;
        if (!state.availableSkills.includes(tagName)) {
          state.availableSkills.push(tagName);
          state.availableSkills.sort((a, b) => a.localeCompare(b));
        }
        if (!state.availableInterests.includes(tagName)) {
          state.availableInterests.push(tagName);
          state.availableInterests.sort((a, b) => a.localeCompare(b));
        }
      } catch (err) {
        console.error('Failed to create tag', err);
        // Fallback: add locally so user can proceed even without CRM write
        if (!state.availableSkills.includes(name)) {
          state.availableSkills.push(name);
          state.availableSkills.sort((a, b) => a.localeCompare(b));
        }
        if (!state.availableInterests.includes(name)) {
          state.availableInterests.push(name);
          state.availableInterests.sort((a, b) => a.localeCompare(b));
        }
        saveLocalList(LS_SKILLS, state.availableSkills);
      }
      renderOptions(skillSelect, state.availableSkills, state.selectedSkills);
      // Select the new option
      if (skillSelect) {
        const opt = Array.from(skillSelect.options).find((o) => o.value === name);
        if (opt) opt.selected = true;
        // Sync chips with current selection
        if (skillSelect.multiple) {
          state.selectedSkills = Array.from(skillSelect.selectedOptions).map((o) => o.value).filter(Boolean);
          renderSelectedTags(selectedSkillsWrap, state.selectedSkills);
        }
      }
      skillNameInput.value = "";
      closeModal(skillModal);
    });
  }

// Delete Skills modal
if (skillDeleteCancel) skillDeleteCancel.addEventListener("click", () => closeModal(skillDeleteModal));
if (skillDeleteCancel2) skillDeleteCancel2.addEventListener("click", () => closeModal(skillDeleteModal));
if (skillDeleteBackdrop) skillDeleteBackdrop.addEventListener("click", () => closeModal(skillDeleteModal));
if (skillDeleteForm) {
  skillDeleteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const toRemove = Array.from(skillDeleteSelect?.selectedOptions || []).map((o) => o.value);
    if (toRemove.length) {
      try {
        await deleteVolunteerVocab({ type: "skill", names: toRemove });
      } catch (err) {
        console.error("Failed to delete skills", err);
      }
      state.selectedSkills = state.selectedSkills.filter((v) => !toRemove.includes(v));
      state.availableSkills = (state.availableSkills || []).filter((v) => !toRemove.includes(v));
      if (skillSelect) {
        for (const opt of skillSelect.options) {
          if (toRemove.includes(opt.value)) opt.selected = false;
        }
      }
      renderOptions(skillSelect, state.availableSkills, state.selectedSkills);
      renderSelectedTags(selectedSkillsWrap, state.selectedSkills);
    }
    closeModal(skillDeleteModal);
  });
}

// New Interest modal
if (interestNewBtn) {
  interestNewBtn.addEventListener("click", () => openModal(interestModal, interestNameInput, interestNewBtn));
}
if (interestCancel) interestCancel.addEventListener("click", () => closeModal(interestModal));
if (interestCancel2) interestCancel2.addEventListener("click", () => closeModal(interestModal));
if (interestBackdrop) interestBackdrop.addEventListener("click", () => closeModal(interestModal));
  if (interestForm) {
    interestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (interestNameInput?.value || "").trim();
      if (!name) return;
      try {
        const resp = await createVolunteerVocab({ type: "interest", name });
        const tagName = resp?.data?.name || name;
        if (!state.availableInterests.includes(tagName)) {
          state.availableInterests.push(tagName);
          state.availableInterests.sort((a, b) => a.localeCompare(b));
        }
        if (!state.availableSkills.includes(tagName)) {
          state.availableSkills.push(tagName);
          state.availableSkills.sort((a, b) => a.localeCompare(b));
        }
      } catch (err) {
        console.error('Failed to create tag', err);
        // Fallback local add
        if (!state.availableInterests.includes(name)) {
          state.availableInterests.push(name);
          state.availableInterests.sort((a, b) => a.localeCompare(b));
        }
        if (!state.availableSkills.includes(name)) {
          state.availableSkills.push(name);
          state.availableSkills.sort((a, b) => a.localeCompare(b));
        }
        saveLocalList(LS_INTERESTS, state.availableInterests);
      }
      renderOptions(interestSelect, state.availableInterests, state.selectedInterests);
      if (interestSelect) {
        const opt = Array.from(interestSelect.options).find((o) => o.value === name);
        if (opt) opt.selected = true;
        if (interestSelect.multiple) {
          state.selectedInterests = Array.from(interestSelect.selectedOptions).map((o) => o.value).filter(Boolean);
          renderSelectedTags(selectedInterestsWrap, state.selectedInterests);
        }
      }
      interestNameInput.value = "";
      closeModal(interestModal);
    });
  }

// Delete Interests modal
if (interestDeleteCancel) interestDeleteCancel.addEventListener("click", () => closeModal(interestDeleteModal));
if (interestDeleteCancel2) interestDeleteCancel2.addEventListener("click", () => closeModal(interestDeleteModal));
if (interestDeleteBackdrop) interestDeleteBackdrop.addEventListener("click", () => closeModal(interestDeleteModal));
if (interestDeleteForm) {
  interestDeleteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const toRemove = Array.from(interestDeleteSelect?.selectedOptions || []).map((o) => o.value);
    if (toRemove.length) {
      try {
        await deleteVolunteerVocab({ type: "interest", names: toRemove });
      } catch (err) {
        console.error("Failed to delete interests", err);
      }
      state.selectedInterests = state.selectedInterests.filter((v) => !toRemove.includes(v));
      state.availableInterests = (state.availableInterests || []).filter((v) => !toRemove.includes(v));
      if (interestSelect) {
        for (const opt of interestSelect.options) {
          if (toRemove.includes(opt.value)) opt.selected = false;
        }
      }
      renderOptions(interestSelect, state.availableInterests, state.selectedInterests);
      renderSelectedTags(selectedInterestsWrap, state.selectedInterests);
    }
    closeModal(interestDeleteModal);
  });
}

    // Sync state when user multi-selects directly
    if (skillSelect && skillSelect.multiple) {
    skillSelect.addEventListener("change", () => {
      state.selectedSkills = Array.from(skillSelect.selectedOptions)
        .map((o) => (o.value || "").trim())
        .filter(Boolean);
      renderSelectedTags(selectedSkillsWrap, state.selectedSkills);
    });
  }

  if (interestSelect && interestSelect.multiple) {
    interestSelect.addEventListener("change", () => {
      state.selectedInterests = Array.from(interestSelect.selectedOptions)
        .map((o) => (o.value || "").trim())
        .filter(Boolean);
      renderSelectedTags(selectedInterestsWrap, state.selectedInterests);
    });
  }

if (selectedSkillsWrap) {
  selectedSkillsWrap.addEventListener("click", (e) => {
    const val = e.target?.getAttribute?.("data-remove-tag");
    if (!val) return;
    state.selectedSkills = state.selectedSkills.filter((v) => v !== val);
    // Deselect in select if present
    if (skillSelect) {
      for (const opt of skillSelect.options) {
        if (opt.value === val) opt.selected = false;
      }
    }
    renderSelectedTags(selectedSkillsWrap, state.selectedSkills);
  });
}

if (selectedInterestsWrap) {
  selectedInterestsWrap.addEventListener("click", (e) => {
    const val = e.target?.getAttribute?.("data-remove-tag");
    if (!val) return;
    state.selectedInterests = state.selectedInterests.filter((v) => v !== val);
    if (interestSelect && interestSelect.multiple) {
      for (const opt of interestSelect.options) {
        if (opt.value === val) opt.selected = false;
      }
    }
    renderSelectedTags(selectedInterestsWrap, state.selectedInterests);
  });
}

function init() {
  applyFeatureAccess();
  document.addEventListener("auth:ready", (event) => applyFeatureAccess(event.detail?.user || null));
  let bootOnce = false;
  const run = () => {
    if (bootOnce) return;
    bootOnce = true;
    loadGlobalTags();
    loadContacts();
    loadVolunteers();
    loadEvents();
    loadShifts();
    loadHoursSummary();
  };
  if (!window.__ERP_USER__) {
    document.addEventListener("auth:ready", run, { once: true });
    run();
  } else {
    run();
  }
}

init();













// Wire up Shifts filters
if (document.getElementById('shift-apply-sort')) {
  const shiftSortBy = document.getElementById('shift-sort-by');
  const shiftSortDir = document.getElementById('shift-sort-dir');
  const shiftFilterText = document.getElementById('shift-filter-text');
  document.getElementById('shift-apply-sort').addEventListener('click', () => {
    state.shiftFilters = {
      sortBy: shiftSortBy ? shiftSortBy.value : undefined,
      sortDir: shiftSortDir ? shiftSortDir.value : undefined,
      filterText: shiftFilterText ? shiftFilterText.value : undefined,
    };
    renderShifts(state.shifts || []);
  });
}


// Wire up Hours filters
if (document.getElementById('hours-apply-sort')) {
  const hoursSortBy = document.getElementById('hours-sort-by');
  const hoursSortDir = document.getElementById('hours-sort-dir');
  const hoursFilterText = document.getElementById('hours-filter-text');
  document.getElementById('hours-apply-sort').addEventListener('click', () => {
    state.hoursFilters = {
      sortBy: hoursSortBy ? hoursSortBy.value : undefined,
      sortDir: hoursSortDir ? hoursSortDir.value : undefined,
      filterText: hoursFilterText ? hoursFilterText.value : undefined,
    };
    renderHoursSummary(state.hoursSummary || []);
  });
}
