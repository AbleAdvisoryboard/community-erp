const API_BASE = "/api/v1";

export async function request(path, { method = "GET", body, params } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });
  }

  const options = {
    method,
    credentials: "include",
    headers: {
      "Accept": "application/json",
    },
  };

  const upperMethod = method.toUpperCase();
  const safeMethod = upperMethod === "GET" || upperMethod === "HEAD" || upperMethod === "OPTIONS";
  if (!safeMethod) {
    options.headers["x-csrf-token"] = window.__CSRF_TOKEN__ || "";
  }

  if (body !== undefined && body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const csrfHeader = response.headers ? response.headers.get("x-csrf-token") : null;
  if (csrfHeader && typeof window !== "undefined") {
    window.__CSRF_TOKEN__ = csrfHeader;
  }
  if (!response.ok) {
    let errorPayload = null;
    try {
      errorPayload = await response.json();
    } catch (_err) {
      // ignore
    }
    const message = errorPayload?.message || `Request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.details = errorPayload;
    if (response.status === 401 && typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("auth:expired", { detail: { path } }));
    }
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function login(email, password) {
  const { user, csrfToken } = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  window.__CSRF_TOKEN__ = csrfToken;
  return user;
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
}

export function fetchMe() {
  return request("/auth/me");
}

export function fetchAccounts(params) {
  return request("/crm/accounts", { params });
}

export function createAccount(body) {
  return request("/crm/accounts", { method: "POST", body });
}

export function updateAccount(id, body) {
  return request(`/crm/accounts/${id}`, { method: "PATCH", body });
}

export function deleteAccount(id) {
  return request(`/crm/accounts/${id}`, { method: "DELETE" });
}

export function fetchContacts(params) {
  return request("/crm/contacts", { params });
}

export function createContact(body) {
  return request("/crm/contacts", { method: "POST", body });
}

export function updateContact(id, body) {
  return request(`/crm/contacts/${id}`, { method: "PATCH", body });
}

export function deleteContact(id) {
  return request(`/crm/contacts/${id}`, { method: "DELETE" });
}

export function fetchContactTags() {
  return request("/crm/tags");
}

export function createContactTag(body) {
  return request("/crm/tags", { method: "POST", body });
}

export function deleteContactTag(id) {
  return request(`/crm/tags/${id}`, { method: "DELETE" });
}

export function createActivity(body) {
  return request("/crm/activities", { method: "POST", body });
}

export function fetchFunds(params) {
  return request("/fundraising/funds", { params });
}

export function createFund(body) {
  return request("/fundraising/funds", { method: "POST", body });
}

export function updateFund(id, body) {
  return request(`/fundraising/funds/${id}`, { method: "PATCH", body });
}

export function fetchCampaigns(params) {
  return request("/fundraising/campaigns", { params });
}

export function createCampaign(body) {
  return request("/fundraising/campaigns", { method: "POST", body });
}

export function updateCampaign(id, body) {
  return request(`/fundraising/campaigns/${id}`, { method: "PATCH", body });
}

export function fetchDonations(params) {
  return request("/fundraising/donations", { params });
}

export function createDonation(body) {
  return request("/fundraising/donations", { method: "POST", body });
}

export function createReceipt(donationId, body) {
  return request(`/fundraising/donations/${donationId}/receipts`, { method: "POST", body });
}

export function createPledge(body) {
  return request("/fundraising/pledges", { method: "POST", body });
}

// Pledge payments against a pledge-style donation
export function createPledgePayment(donationId, body) {
  return request(`/fundraising/donations/${donationId}/pledge-payments`, { method: "POST", body });
}


export function fetchGlAccounts(params) {
  return request("/finance/gl-accounts", { params });
}

export function createGlAccount(body) {
  return request("/finance/gl-accounts", { method: "POST", body });
}

export function deleteGlAccount(id) {
  return request(`/finance/gl-accounts/${id}`, { method: "DELETE" });
}

export function updateGlAccount(id, body) {
  return request(`/finance/gl-accounts/${id}`, { method: "PATCH", body });
}

export function fetchJournals(params) {
  return request("/finance/journals", { params });
}

export function createJournal(body) {
  return request("/finance/journals", { method: "POST", body });
}

// Trial Balance via GL route; accepts optional params { as_of, fund_id, class_id }
export function fetchTrialBalance(params) {
  return request("/gl/trial-balance", { params });
}
export function fetchBalanceSheet() {
  return request("/finance/financials/balance-sheet");
}
export function fetchIncomeStatement() {
  return request("/finance/financials/income-statement");
}
export function fetchFinancialOverview(params) {
  return request("/finance/financials/overview", { params });
}
export function fetchNonprofitStatement(params) {
  return request("/finance/financials/nonprofit-statement", { params });
}
export function fetchBalanceSheetDetailed(params) {
  return request("/finance/financials/balance-sheet-detailed", { params });
}
// AR
export function fetchInvoices(params) {
  return request("/ar/invoices", { params });
}
export function createInvoice(body) {
  return request("/ar/invoices", { method: "POST", body });
}
export function applyInvoicePayment(id, body) {
  return request(`/ar/invoices/${id}/payments`, { method: "POST", body });
}
export function fetchArAging() {
  return request("/ar/aging");
}
export function postInvoiceToGL(id) {
  return request(`/ar/invoices/${id}/postToGL`, { method: 'POST' });
}
export function postArPaymentToGL(id) {
  return request(`/ar/payments/${id}/postToGL`, { method: 'POST' });
}
export function postBillToGL(id) {
  return request(`/ap/bills/${id}/postToGL`, { method: 'POST' });
}
export function postApPaymentToGL(id) {
  return request(`/ap/payments/${id}/postToGL`, { method: 'POST' });
}
export function postDonationToGL(id) {
  return request(`/donations/${id}/postToGL`, { method: 'POST' });
}
export function fetchInventoryItems(params) {
  return request("/inventory/items", { params });
}

export function createInventoryItem(body) {
  return request("/inventory/items", { method: "POST", body });
}

export function updateInventoryItem(id, body) {
  return request(`/inventory/items/${id}`, { method: "PATCH", body });
}

export function fetchInventoryStock(params) {
  return request("/inventory/stock", { params });
}

export function adjustInventoryStock(body) {
  return request("/inventory/stock/adjust", { method: "POST", body });
}

export function updateInventoryStock(id, body) {
  return request(`/inventory/stock/${id}`, { method: "PATCH", body });
}

export function fetchLowStock() {
  return request("/inventory/stock/low");
}

export function fetchAssets(params) {
  return request("/inventory/assets", { params });
}

export function createAsset(body) {
  return request("/inventory/assets", { method: "POST", body });
}

export function updateAsset(id, body) {
  return request(`/inventory/assets/${id}`, { method: "PATCH", body });
}

export function logAssetMaintenance(id, body) {
  return request(`/inventory/assets/${id}/maintenance`, { method: "POST", body });
}

export function fetchInventoryCategories() {
  return request("/inventory/categories");
}

export function createInventoryCategory(body) {
  return request("/inventory/categories", { method: "POST", body });
}

export function deleteInventoryCategory(id) {
  return request(`/inventory/categories/${id}`, { method: "DELETE" });
}

export function fetchInventoryTypes() {
  return request("/inventory/types");
}

export function createInventoryType(body) {
  return request("/inventory/types", { method: "POST", body });
}

export function deleteInventoryType(name) {
  return request(`/inventory/types/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function fetchVolunteers(params) {
  return request("/volunteers", { params });
}

export function createVolunteer(body) {
  return request("/volunteers", { method: "POST", body });
}

export function updateVolunteer(id, body) {
  return request(`/volunteers/volunteers/${id}`, { method: "PATCH", body });
}

export function fetchVolunteerShifts(params) {
  return request("/volunteers/shifts", { params });
}

export function createVolunteerShift(body) {
  return request("/volunteers/shifts", { method: "POST", body });
}

export function logVolunteerHours(body) {
  return request("/volunteers/hours", { method: "POST", body });
}

export function fetchVolunteerHoursSummary() {
  return request("/volunteers/hours/summary");
}

// Volunteer vocab (skills/interests)
export function fetchVolunteerVocab(params) {
  return request("/volunteers/vocab", { params });
}

export function createVolunteerVocab(body) {
  return request("/volunteers/vocab", { method: "POST", body });
}

export function deleteVolunteerVocab(body) {
  return request("/volunteers/vocab", { method: "DELETE", body });
}


export function fetchReportDatasets() {
  return request("/reports/datasets");
}

export function fetchReportDataset(key) {
  return request(`/reports/datasets/${key}`);
}

export function fetchReportsList() {
  return request("/reports");
}

export function createReportDefinition(body) {
  return request("/reports", { method: "POST", body });
}

export function updateReportDefinition(id, body) {
  return request(`/reports/${id}`, { method: "PATCH", body });
}

export function deleteReportDefinition(id) {
  return request(`/reports/${id}`, { method: "DELETE" });
}

export function runReportRequest(id, body) {
  return request(`/reports/${id}/run`, { method: "POST", body });
}

export function fetchReportViews(id) {
  return request(`/reports/${id}/views`);
}

export function createReportViewRequest(id, body) {
  return request(`/reports/${id}/views`, { method: "POST", body });
}

export function deleteReportViewRequest(id, viewId) {
  return request(`/reports/${id}/views/${viewId}`, { method: "DELETE" });
}

export function fetchDashboardCards() {
  return request("/reports/dashboard/cards");
}

// Programs module removed


export function fetchEvents(params) {
  return request("/events", { params });
}

export function fetchEvent(eventId) {
  return request(`/events/${eventId}`);
}

export function createEvent(body) {
  return request("/events", { method: "POST", body });
}

export function updateEvent(eventId, body) {
  return request(`/events/${eventId}`, { method: "PATCH", body });
}

export function fetchEventTickets(eventId) {
  return request(`/events/${eventId}/tickets`);
}

export function createEventTicket(eventId, body) {
  return request(`/events/${eventId}/tickets`, { method: "POST", body });
}

export function fetchEventRegistrations(eventId) {
  return request(`/events/${eventId}/registrations`);
}

export function createEventRegistration(eventId, body) {
  return request(`/events/${eventId}/registrations`, { method: "POST", body });
}

export function checkInRegistration(registrationId) {
  return request(`/events/registrations/${registrationId}/check-in`, { method: "POST" });
}

export function fetchEventSponsors(eventId) {
  return request(`/events/${eventId}/sponsors`);
}

export function createEventSponsor(eventId, body) {
  return request(`/events/${eventId}/sponsors`, { method: "POST", body });
}

export function fetchMessageTemplates() {
  return request("/communications/templates");
}

export function fetchCommunicationSettings() {
  return request("/communications/settings");
}

export function updateCommunicationSettings(body) {
  return request("/communications/settings", { method: "PUT", body });
}

export function fetchPublicSettings() {
  return request("/settings/public");
}

export function updateOrganizationSettings(body) {
  return request("/settings/organization", { method: "PUT", body });
}

export function fetchManagedUsers() {
  return request("/settings/users");
}

export function fetchAuthSecuritySettings() {
  return request("/settings/auth-security");
}

export function updateAuthSecuritySettings(body) {
  return request("/settings/auth-security", { method: "PUT", body });
}

export function fetchFinanceControls() {
  return request("/settings/finance-controls");
}

export function updateFinanceControls(body) {
  return request("/settings/finance-controls", { method: "PUT", body });
}

export function createManagedUser(body) {
  return request("/settings/users", { method: "POST", body });
}

export function updateManagedUser(id, body) {
  return request(`/settings/users/${id}`, { method: "PATCH", body });
}

export function deleteManagedUser(id) {
  return request(`/settings/users/${id}`, { method: "DELETE" });
}

export function fetchAccessCatalog() {
  return request("/settings/access-catalog");
}

export function fetchAccessProfiles() {
  return request("/settings/access-profiles");
}

export function saveAccessProfiles(body) {
  return request("/settings/access-profiles", { method: "PUT", body });
}

export function updateManagedUserAccess(id, body) {
  return request(`/settings/users/${id}/access`, { method: "PUT", body });
}

export function unlockManagedUser(id) {
  return request(`/settings/users/${id}/unlock`, { method: "POST" });
}

export function createMessageTemplate(body) {
  return request("/communications/templates", { method: "POST", body });
}

export function updateMessageTemplate(id, body) {
  return request(`/communications/templates/${id}`, { method: "PATCH", body });
}

export function deleteMessageTemplate(id) {
  return request(`/communications/templates/${id}`, { method: "DELETE" });
}

export function fetchMessages(params) {
  return request("/communications/messages", { params });
}

export function createMessage(body) {
  return request("/communications/messages", { method: "POST", body });
}

export function sendMessage(id) {
  return request(`/communications/messages/${id}/send`, { method: "POST" });
}

export function fetchMessageDeliveries(id) {
  return request(`/communications/messages/${id}/deliveries`);
}

export function fetchDashboardSnapshot() {
  return request("/dashboard/snapshot");
}

// Meeting Notes API
export function fetchNotes(params) {
  return request("/notes", { params });
}

export function createNote(body) {
  return request("/notes", { method: "POST", body });
}

export function fetchNote(id) {
  return request(`/notes/${id}`);
}

export function updateNote(id, body) {
  return request(`/notes/${id}`, { method: "PATCH", body });
}

export function fetchNoteChanges(id) {
  return request(`/notes/${id}/changes`);
}


export function fetchProjects() {
  return request("/projects");
}

export function fetchProjectByKey(key) {
  return request(`/projects/${key}`);
}

export function createProjectIssue(projectId, body) {
  return request(`/projects/${projectId}/issues`, { method: "POST", body });
}

export function updateProjectIssue(projectId, issueId, body) {
  return request(`/projects/${projectId}/issues/${issueId}`, { method: "PATCH", body });
}

export function moveProjectIssue(projectId, issueId, body) {
  return request(`/projects/${projectId}/issues/${issueId}/move`, { method: "POST", body });
}

export function createProjectColumn(projectId, body) {
  return request(`/projects/${projectId}/columns`, { method: "POST", body });
}

export function reorderProjectColumns(projectId, body) {
  return request(`/projects/${projectId}/columns/reorder`, { method: "PATCH", body });
}

export function createProjectSprint(projectId, body) {
  return request(`/projects/${projectId}/sprints`, { method: "POST", body });
}

export function updateSprint(sprintId, body) {
  return request(`/projects/sprints/${sprintId}`, { method: "PATCH", body });
}

export function addIssueComment(issueId, body) {
  return request(`/projects/issues/${issueId}/comments`, { method: "POST", body });
}

// Knowledge module removed
export const apiGet = (path, params) => request(path, { params });
export const apiPost = (path, body) => request(path, { method: "POST", body });
export const apiPatch = (path, body) => request(path, { method: "PATCH", body });

// Intelligence module removed

