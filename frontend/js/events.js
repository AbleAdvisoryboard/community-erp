import {
  fetchEvents,
  fetchEvent,
  createEvent,
  createEventTicket,
  createEventRegistration,
  createEventSponsor,
  checkInRegistration,
  fetchContacts,
} from "./api.js";

const state = {
  events: [],
  filteredEvents: [],
  selectedEvent: null,
  contacts: [],
  filters: {
    upcoming: true,
    search: "",
  },
};

const eventsBody = document.querySelector("[data-events-body]");
const eventsCount = document.getElementById("events-count");
const eventSelect = document.getElementById("event-select");
const upcomingCheckbox = document.getElementById("events-upcoming");
const eventSearch = document.getElementById("event-search");
const eventDetailsSection = document.getElementById("event-details");
const eventManagementSection = document.getElementById("event-management");
const eventSummary = document.getElementById("event-summary");
const ticketsBody = document.querySelector("[data-event-tickets]");
const sponsorsBody = document.querySelector("[data-event-sponsors]");
const registrationsBody = document.querySelector("[data-event-registrations]");

const eventForm = document.getElementById("event-form");
const eventFormMessage = document.getElementById("event-form-message");
const ticketForm = document.getElementById("ticket-form");
const ticketFormMessage = document.getElementById("ticket-form-message");
const registrationForm = document.getElementById("registration-form");
const registrationFormMessage = document.getElementById("registration-form-message");
const sponsorForm = document.getElementById("sponsor-form");
const sponsorFormMessage = document.getElementById("sponsor-form-message");
const registrationContactSelect = document.getElementById("registration-contact");
const registrationTicketSelect = document.getElementById("registration-ticket");
const sponsorContactSelect = document.getElementById("sponsor-contact");

function setMessage(el, text, tone = "info") {
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = text;
  let color = "var(--color-muted)";
  if (tone === "success") color = "var(--color-success)";
  if (tone === "error") color = "var(--color-danger)";
  el.style.color = color;
}

function renderEvents() {
  const list = state.filteredEvents;
  if (!eventsBody) return;
  if (!list.length) {
    eventsBody.innerHTML = '<tr><td colspan="5">No events match the filters.</td></tr>';
    if (eventsCount) eventsCount.textContent = "0 events";
  } else {
    eventsBody.innerHTML = list
      .map((event) => {
        const start = event.startAt ? new Date(event.startAt).toLocaleString() : "-";
        const sponsorshipCurrency = Number(event.sponsorshipTotal || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
        return `
          <tr data-event-row data-event-id="${event.id}" class="${state.selectedEvent?.id === event.id ? "is-selected" : ""}">
            <td>${event.code}</td>
            <td>${event.name}</td>
            <td>${start}</td>
            <td style="text-align:right;">${event.registrationsCount}</td>
            <td style="text-align:right;">${sponsorshipCurrency}</td>
          </tr>`;
      })
      .join("");
    if (eventsCount) eventsCount.textContent = `${list.length} event${list.length === 1 ? "" : "s"}`;
  }
  if (eventSelect) {
    const options = ['<option value="">Select event</option>']
      .concat(
        state.events.map((event) => `<option value="${event.id}" ${state.selectedEvent?.id === event.id ? "selected" : ""}>${event.name}</option>`)
      );
    eventSelect.innerHTML = options.join("");
  }
}

function renderEventSummary(detail) {
  if (!eventSummary) return;
  if (!detail) {
    eventSummary.innerHTML = "";
    return;
  }
  const start = detail.startAt ? new Date(detail.startAt).toLocaleString() : "-";
  const end = detail.endAt ? new Date(detail.endAt).toLocaleString() : "";
  const venueLines = [detail.venue?.name, detail.venue?.address, [detail.venue?.city, detail.venue?.state].filter(Boolean).join(", "), detail.venue?.postalCode]
    .filter(Boolean)
    .join("<br/>");
  eventSummary.innerHTML = `
    <div class="stat">
      <h4>Date & Time</h4>
      <p>${start}${end ? ` - ${end}` : ""}</p>
    </div>
    <div class="stat">
      <h4>Venue</h4>
      <p>${venueLines || "TBD"}</p>
    </div>
    <div class="stat">
      <h4>Registrations</h4>
      <p>${detail.registrationsCount} attendees</p>
    </div>
    <div class="stat">
      <h4>Sponsorship</h4>
      <p>${Number(detail.sponsorshipTotal || 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}</p>
    </div>
    <div class="stat">
      <h4>Calendar</h4>
      <p><a class="link" href="/api/v1/calendar/events/${detail.id}.ics" target="_blank" rel="noopener">Download .ics</a></p>
    </div>`;
}

function renderTickets(tickets) {
  if (!ticketsBody) return;
  if (!tickets?.length) {
    ticketsBody.innerHTML = '<tr><td colspan="4">No tickets.</td></tr>';
    return;
  }
  ticketsBody.innerHTML = tickets
    .map((ticket) => {
      const price = Number(ticket.price || 0).toLocaleString(undefined, { style: "currency", currency: ticket.currencyCode || "USD" });
      const quantityTotal = ticket.quantityTotal === null || ticket.quantityTotal === undefined ? "Unlimited" : ticket.quantityTotal;
      return `
        <tr>
          <td>${ticket.name}</td>
          <td>${ticket.type}</td>
          <td style="text-align:right;">${price}</td>
          <td style="text-align:right;">${ticket.quantitySold} / ${quantityTotal}</td>
        </tr>`;
    })
    .join("");
  if (registrationTicketSelect) {
    const options = ['<option value="">Select ticket</option>']
      .concat(tickets.map((ticket) => `<option value="${ticket.id}">${ticket.name}</option>`));
    registrationTicketSelect.innerHTML = options.join("");
  }
}

function renderSponsors(sponsors) {
  if (!sponsorsBody) return;
  if (!sponsors?.length) {
    sponsorsBody.innerHTML = '<tr><td colspan="3">No sponsors yet.</td></tr>';
    return;
  }
  sponsorsBody.innerHTML = sponsors
    .map((sponsor) => `
      <tr>
        <td>${sponsor.sponsorName}</td>
        <td>${sponsor.sponsorLevel || "-"}</td>
        <td style="text-align:right;">${Number(sponsor.amount || 0).toLocaleString(undefined, { style: "currency", currency: sponsor.currencyCode || "USD" })}</td>
      </tr>`)
    .join("");
}

function renderRegistrations(registrations) {
  if (!registrationsBody) return;
  if (!registrations?.length) {
    registrationsBody.innerHTML = '<tr><td colspan="6">No registrations yet.</td></tr>';
    return;
  }
  registrationsBody.innerHTML = registrations
    .map((registration) => {
      const attendee = registration.contactName || registration.guestName || "Guest";
      const registeredAt = registration.registeredAt ? new Date(registration.registeredAt).toLocaleString() : "-";
      const button = registration.status === "CheckedIn"
        ? '<span class="badge success">Checked in</span>'
        : `<button class="button tertiary" data-checkin data-registration-id="${registration.id}">Check In</button>`;
      return `
        <tr>
          <td>${attendee}</td>
          <td>${registration.ticketName || "-"}</td>
          <td style="text-align:right;">${registration.quantity}</td>
          <td>${registration.status}</td>
          <td>${registeredAt}</td>
          <td style="text-align:center;">${button}</td>
        </tr>`;
    })
    .join("");
}

function applyFilters() {
  const search = state.filters.search.trim().toLowerCase();
  state.filteredEvents = state.events.filter((event) => {
    if (state.filters.upcoming) {
      if (!event.startAt) return false;
      if (new Date(event.startAt) < new Date()) return false;
    }
    if (search) {
      const match = `${event.name} ${event.code}`.toLowerCase();
      if (!match.includes(search)) return false;
    }
    return true;
  });
  renderEvents();
}

async function loadEvents() {
  if (!window.__ERP_USER__) return;
  try {
    const params = {};
    if (state.filters.upcoming) params.upcoming = "true";
    const { data } = await fetchEvents(params);
    state.events = data;
    state.filteredEvents = data;
    applyFilters();
  } catch (error) {
    console.error("Failed to load events", error);
    setMessage(eventFormMessage, error.message || "Failed to load events.", "error");
  }
}

async function loadEventDetails(eventId) {
  if (!eventId) {
    state.selectedEvent = null;
    if (eventDetailsSection) eventDetailsSection.style.display = "none";
    if (eventManagementSection) eventManagementSection.style.display = "none";
    return;
  }
  try {
    const { data } = await fetchEvent(eventId);
    state.selectedEvent = data;
    if (eventDetailsSection) eventDetailsSection.style.display = "block";
    if (eventManagementSection) eventManagementSection.style.display = "block";
    renderEventSummary(data);
    renderTickets(data.tickets);
    renderSponsors(data.sponsors);
    renderRegistrations(data.registrations);
    renderEvents();
  } catch (error) {
    console.error("Failed to load event", error);
    setMessage(eventFormMessage, error.message || "Failed to load event.", "error");
  }
}

async function loadContacts() {
  try {
    const { data } = await fetchContacts({ limit: 200 });
    state.contacts = data || [];
    const contactOptions = ['<option value="">Select contact</option>']
      .concat(state.contacts.map((contact) => `<option value="${contact.id}">${contact.firstName} ${contact.lastName}</option>`));
    if (registrationContactSelect) registrationContactSelect.innerHTML = contactOptions.join("");
    if (sponsorContactSelect) {
      const sponsorOptions = ['<option value="">Unlinked</option>']
        .concat(state.contacts.map((contact) => `<option value="${contact.id}">${contact.firstName} ${contact.lastName}</option>`));
      sponsorContactSelect.innerHTML = sponsorOptions.join("");
    }
  } catch (error) {
    console.error("Failed to load contacts", error);
  }
}

if (eventSelect) {
  eventSelect.addEventListener("change", (event) => {
    const eventId = event.target.value ? Number(event.target.value) : null;
    loadEventDetails(eventId);
  });
}

if (upcomingCheckbox) {
  upcomingCheckbox.addEventListener("change", (event) => {
    state.filters.upcoming = event.target.checked;
    applyFilters();
    if (state.filters.upcoming && state.filteredEvents.length) {
      const first = state.filteredEvents[0];
      if (eventSelect) eventSelect.value = String(first.id);
      loadEventDetails(first.id);
    }
  });
}

if (eventSearch) {
  let debounce;
  eventSearch.addEventListener("input", (event) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.filters.search = event.target.value || "";
      applyFilters();
    }, 250);
  });
}

if (eventsBody) {
  eventsBody.addEventListener("click", (event) => {
    const row = event.target.closest("[data-event-row]");
    if (!row) return;
    const eventId = Number(row.dataset.eventId);
    if (eventSelect) eventSelect.value = String(eventId);
    loadEventDetails(eventId);
  });
}

if (registrationsBody) {
  registrationsBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-checkin]");
    if (!button) return;
    if (!state.selectedEvent) return;
    const registrationId = Number(button.dataset.registrationId);
    try {
      await checkInRegistration(registrationId);
      await loadEventDetails(state.selectedEvent.id);
    } catch (error) {
      console.error("Failed to check in", error);
      setMessage(registrationFormMessage, error.message || "Unable to check in attendee.", "error");
    }
  });
}

if (eventForm) {
  eventForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(eventFormMessage, "Sign in to manage events.", "error");
      return;
    }
    const form = new FormData(eventForm);
    const tzRaw = (form.get("timezone") || "").toString().trim();
    const TZ_MAP = {
      EST: "America/New_York",
      EDT: "America/New_York",
      CST: "America/Chicago",
      CDT: "America/Chicago",
      MST: "America/Denver",
      MDT: "America/Denver",
      PST: "America/Los_Angeles",
      PDT: "America/Los_Angeles",
      AKST: "America/Anchorage",
      AKDT: "America/Anchorage",
      HST: "Pacific/Honolulu",
      GMT: "UTC",
    };
    const timezone = TZ_MAP[tzRaw.toUpperCase()] || tzRaw || "UTC";
    const payload = {
      code: form.get("code").trim(),
      name: form.get("name").trim(),
      startAt: form.get("startAt") ? new Date(form.get("startAt")).toISOString() : null,
      endAt: form.get("endAt") ? new Date(form.get("endAt")).toISOString() : null,
      timezone,
      capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
      venue: {
        name: form.get("venueName") || null,
        city: form.get("venueCity") || null,
        state: form.get("venueState") || null,
      },
    };
    try {
      await createEvent(payload);
      setMessage(eventFormMessage, "Event created.", "success");
      eventForm.reset();
      await loadEvents();
    } catch (error) {
      setMessage(eventFormMessage, error.message || "Failed to create event.", "error");
    }
  });
}

if (ticketForm) {
  ticketForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    if (!state.selectedEvent) {
      setMessage(ticketFormMessage, "Select an event first.", "error");
      return;
    }
    const form = new FormData(ticketForm);
    const payload = {
      name: form.get("name").trim(),
      type: form.get("type"),
      price: form.get("price") ? Number(form.get("price")) : 0,
      quantityTotal: form.get("quantityTotal") ? Number(form.get("quantityTotal")) : 0,
    };
    try {
      await createEventTicket(state.selectedEvent.id, payload);
      setMessage(ticketFormMessage, "Ticket added.", "success");
      ticketForm.reset();
      await loadEventDetails(state.selectedEvent.id);
    } catch (error) {
      setMessage(ticketFormMessage, error.message || "Failed to add ticket.", "error");
    }
  });
}

if (registrationForm) {
  registrationForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    if (!state.selectedEvent) {
      setMessage(registrationFormMessage, "Select an event first.", "error");
      return;
    }
    const form = new FormData(registrationForm);
    const payload = {
      contactId: form.get("contactId") ? Number(form.get("contactId")) : null,
      ticketId: form.get("ticketId") ? Number(form.get("ticketId")) : null,
      quantity: form.get("quantity") ? Number(form.get("quantity")) : 1,
      totalAmount: form.get("totalAmount") ? Number(form.get("totalAmount")) : 0,
    };
    try {
      await createEventRegistration(state.selectedEvent.id, payload);
      setMessage(registrationFormMessage, "Registration added.", "success");
      registrationForm.reset();
      await loadEventDetails(state.selectedEvent.id);
    } catch (error) {
      setMessage(registrationFormMessage, error.message || "Failed to add registration.", "error");
    }
  });
}

if (sponsorForm) {
  sponsorForm.addEventListener("submit", async (submitEvent) => {
    submitEvent.preventDefault();
    if (!state.selectedEvent) {
      setMessage(sponsorFormMessage, "Select an event first.", "error");
      return;
    }
    const form = new FormData(sponsorForm);
    const payload = {
      contactId: form.get("contactId") ? Number(form.get("contactId")) : null,
      sponsorName: form.get("sponsorName").trim(),
      sponsorLevel: form.get("sponsorLevel") || null,
      amount: form.get("amount") ? Number(form.get("amount")) : 0,
    };
    try {
      await createEventSponsor(state.selectedEvent.id, payload);
      setMessage(sponsorFormMessage, "Sponsor logged.", "success");
      sponsorForm.reset();
      await loadEventDetails(state.selectedEvent.id);
    } catch (error) {
      setMessage(sponsorFormMessage, error.message || "Failed to add sponsor.", "error");
    }
  });
}

function init() {
  const onReady = () => {
    loadContacts();
    loadEvents();
  };
  if (!window.__ERP_USER__) {
    document.addEventListener("auth:ready", onReady, { once: true });
  } else {
    onReady();
  }
}

init();
