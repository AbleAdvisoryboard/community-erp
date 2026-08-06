import {
  fetchMessageTemplates,
  fetchCommunicationSettings,
  updateCommunicationSettings,
  createMessageTemplate,
  deleteMessageTemplate,
  fetchMessages,
  createMessage,
  sendMessage,
  fetchMessageDeliveries,
  fetchContacts,
} from "./api.js";

const state = {
  templates: [],
  messages: [],
  contacts: [],
  deliveries: [],
  filters: {
    search: "",
    status: "",
    channel: "",
  },
  selectedMessageId: null,
};

const templateBody = document.querySelector("[data-template-body]");
const templateForm = document.getElementById("template-form");
const templateFormMessage = document.getElementById("template-form-message");
const templateSubjectInput = document.getElementById("template-subject");
const templateBodyInput = document.getElementById("template-body-text");
const templateVariableInsert = document.getElementById("template-variable-insert");
const messagesTableBody = document.querySelector("[data-message-body]");
const messageForm = document.getElementById("message-form");
const messageFormMessage = document.getElementById("message-form-message");
const messageTemplateSelect = document.getElementById("message-template");
const messageChannelSelect = document.getElementById("message-channel");
const messageSubjectInput = document.getElementById("message-subject");
const messageBodyInput = document.getElementById("message-body");
const messageContactsSelect = document.getElementById("message-contacts");
const templatePreview = document.getElementById("template-preview");
const templatePreviewName = document.getElementById("template-preview-name");
const templatePreviewChannel = document.getElementById("template-preview-channel");
const templatePreviewSubject = document.getElementById("template-preview-subject");
const templatePreviewBody = document.getElementById("template-preview-body");
const messageStatusFilter = document.getElementById("message-status-filter");
const messageChannelFilter = document.getElementById("message-channel-filter");
const messageSearchInput = document.getElementById("message-search");
const messagesCount = document.getElementById("messages-count");
const deliveryCard = document.getElementById("delivery-card");
const deliverySummary = document.getElementById("delivery-summary");
const deliveryBody = document.querySelector("[data-delivery-body]");
const communicationSettingsForm = document.getElementById("communications-settings-form");
const communicationSettingsStatus = document.getElementById("communications-settings-status");
const settingsEmailProvider = document.getElementById("settings-email-provider");
const settingsSendgridKey = document.getElementById("settings-sendgrid-key");
const settingsEmailFrom = document.getElementById("settings-email-from");
const settingsEmailReplyTo = document.getElementById("settings-email-reply-to");
const settingsSmsProvider = document.getElementById("settings-sms-provider");
const settingsTwilioSid = document.getElementById("settings-twilio-sid");
const settingsTwilioToken = document.getElementById("settings-twilio-token");
const settingsTwilioFrom = document.getElementById("settings-twilio-from");

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sampleMergeData() {
  const selectedContactId = Number(messageContactsSelect?.selectedOptions?.[0]?.value);
  const contact = state.contacts.find((item) => item.id === selectedContactId) || state.contacts[0] || {};
  return {
    firstName: contact.firstName || "First Name",
    lastName: contact.lastName || "Last Name",
    email: contact.email || "email@example.com",
    phone: contact.phone || contact.mobile || "Phone Number",
    mobile: contact.mobile || contact.phone || "Mobile Number",
    amount: "Amount",
  };
}

function renderMergedText(text) {
  const data = sampleMergeData();
  return String(text || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key) => {
    const normalized = String(key).trim();
    return data[normalized] || `[${normalized}]`;
  });
}

function extractVariables(...values) {
  const variables = new Set();
  for (const value of values) {
    const text = String(value || "");
    const matches = text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g);
    for (const match of matches) {
      const variable = String(match[1] || "").trim();
      if (variable) variables.add(variable);
    }
  }
  return Array.from(variables);
}

function insertAtCursor(input, value) {
  if (!input || !value) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
  const nextPosition = start + value.length;
  input.focus();
  input.setSelectionRange?.(nextPosition, nextPosition);
}

function updateTemplatePreview(template) {
  if (!templatePreview) return;
  if (!template) {
    templatePreview.style.display = "none";
    if (templatePreviewName) templatePreviewName.textContent = "";
    if (templatePreviewChannel) templatePreviewChannel.textContent = "";
    if (templatePreviewSubject) templatePreviewSubject.textContent = "";
    if (templatePreviewBody) templatePreviewBody.textContent = "";
    return;
  }
  templatePreview.style.display = "block";
  if (templatePreviewName) templatePreviewName.textContent = template.name || "Template";
  if (templatePreviewChannel) templatePreviewChannel.textContent = template.channel || "";
  if (templatePreviewSubject) {
    templatePreviewSubject.textContent = renderMergedText(template.subject || "(No subject)");
  }
  if (templatePreviewBody) {
    templatePreviewBody.textContent = renderMergedText(template.bodyText || "");
  }
}

function applyTemplate(templateId) {
  const template = state.templates.find((item) => item.id === Number(templateId));
  if (!template) {
    if (messageChannelSelect) messageChannelSelect.value = "Email";
    if (messageSubjectInput) messageSubjectInput.value = "";
    if (messageBodyInput) messageBodyInput.value = "";
    updateTemplatePreview(null);
    return;
  }
  if (messageTemplateSelect) messageTemplateSelect.value = String(template.id);
  if (messageChannelSelect) messageChannelSelect.value = template.channel;
  if (messageSubjectInput) messageSubjectInput.value = template.subject || "";
  if (messageBodyInput) messageBodyInput.value = template.bodyText || "";
  updateTemplatePreview(template);
}

function renderTemplates() {
  if (!templateBody) return;
  if (!state.templates.length) {
    templateBody.innerHTML = '<tr><td colspan="4">No templates yet.</td></tr>';
    return;
  }
  templateBody.innerHTML = state.templates
    .map((template) => {
      return `
        <tr>
          <td>${escapeHtml(template.name)}</td>
          <td>${escapeHtml(template.channel)}</td>
          <td>${template.isActive ? "Active" : "Inactive"}</td>
          <td style="text-align:center;">
            <button class="button tertiary" type="button" data-use-template="${template.id}">Use</button>
            <button class="button tertiary" type="button" data-delete-template="${template.id}">Delete</button>
          </td>
        </tr>`;
    })
    .join("");
  if (messageTemplateSelect) {
    const options = ['<option value="">(Optional) Select template</option>']
      .concat(state.templates.map((template) => `<option value="${template.id}">${escapeHtml(template.name)}</option>`));
    messageTemplateSelect.innerHTML = options.join("");
  }
}

function filterMessages() {
  const search = state.filters.search.toLowerCase();
  return state.messages.filter((message) => {
    if (state.filters.status && message.status !== state.filters.status) return false;
    if (state.filters.channel && message.channel !== state.filters.channel) return false;
    if (search) {
      const text = `${message.subject || ""} ${message.templateName || ""}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });
}

function renderMessages() {
  if (!messagesTableBody) return;
  const filtered = filterMessages();
  if (!filtered.length) {
    messagesTableBody.innerHTML = '<tr><td colspan="6">No messages match the filters.</td></tr>';
    if (messagesCount) messagesCount.textContent = "0 messages";
    return;
  }
  messagesTableBody.innerHTML = filtered
    .map((message) => {
      const audienceCount = Array.isArray(message.audience?.contactIds) ? message.audience.contactIds.length : 0;
      const sentAt = message.sentAt ? new Date(message.sentAt).toLocaleString() : "-";
      const canSend = message.status !== "Sent" && message.status !== "Sending";
      return `
        <tr data-message-row data-message-id="${message.id}" class="${state.selectedMessageId === message.id ? "is-selected" : ""}">
          <td>${message.subject || message.templateName || "Untitled"}</td>
          <td>${message.channel}</td>
          <td>${message.status}</td>
          <td>${audienceCount} contacts</td>
          <td>${sentAt}</td>
          <td style="text-align:center;">
            ${canSend ? `<button class="button tertiary" data-send data-message-id="${message.id}">Send</button>` : "-"}
          </td>
        </tr>`;
    })
    .join("");
  if (messagesCount) messagesCount.textContent = `${filtered.length} message${filtered.length === 1 ? "" : "s"}`;
}

function renderDeliveries(deliveries) {
  if (!deliveryBody) return;
  if (!deliveries?.length) {
    deliveryBody.innerHTML = '<tr><td colspan="5">No deliveries yet.</td></tr>';
    return;
  }
  deliveryBody.innerHTML = deliveries
    .map((delivery) => `
      <tr>
        <td>${delivery.contactName || "Contact"}</td>
        <td>${delivery.channel}</td>
        <td>${delivery.address || "-"}</td>
        <td>${delivery.status}</td>
        <td>${delivery.sentAt ? new Date(delivery.sentAt).toLocaleString() : "-"}</td>
      </tr>`)
    .join("");
}

async function loadTemplates() {
  if (!window.__ERP_USER__) return;
  try {
    const { data } = await fetchMessageTemplates();
    state.templates = data;
    renderTemplates();
  } catch (error) {
    console.error("Failed to load templates", error);
    setMessage(templateFormMessage, error.message || "Failed to load templates.", "error");
  }
}

async function loadMessages() {
  if (!window.__ERP_USER__) return;
  try {
    const params = {};
    if (state.filters.status) params.status = state.filters.status;
    if (state.filters.channel) params.channel = state.filters.channel;
    const { data } = await fetchMessages(params);
    state.messages = data;
    renderMessages();
  } catch (error) {
    console.error("Failed to load messages", error);
    setMessage(messageFormMessage, error.message || "Failed to load messages.", "error");
  }
}

async function loadContacts() {
  try {
    const { data } = await fetchContacts({ limit: 200 });
    state.contacts = data || [];
    if (messageContactsSelect) {
      const options = state.contacts.map((contact) => `<option value="${contact.id}">${contact.firstName} ${contact.lastName} (${contact.email || contact.phone || "no contact"})</option>`);
      messageContactsSelect.innerHTML = options.join("");
    }
  } catch (error) {
    console.error("Failed to load contacts", error);
  }
}

function renderCommunicationSettings(settings) {
  if (!settings) return;
  if (settingsEmailProvider) settingsEmailProvider.value = settings.emailProvider || "mock";
  if (settingsEmailFrom) settingsEmailFrom.value = settings.emailFrom || "";
  if (settingsEmailReplyTo) settingsEmailReplyTo.value = settings.emailReplyTo || "";
  if (settingsSmsProvider) settingsSmsProvider.value = settings.smsProvider || "mock";
  if (settingsTwilioFrom) settingsTwilioFrom.value = settings.twilioFrom || "";
  if (settingsSendgridKey) {
    settingsSendgridKey.value = "";
    settingsSendgridKey.placeholder = settings.hasSendgridApiKey ? "Saved key - leave blank to keep" : "SendGrid API key";
  }
  if (settingsTwilioSid) {
    settingsTwilioSid.value = "";
    settingsTwilioSid.placeholder = settings.hasTwilioAccountSid ? "Saved SID - leave blank to keep" : "Twilio Account SID";
  }
  if (settingsTwilioToken) {
    settingsTwilioToken.value = "";
    settingsTwilioToken.placeholder = settings.hasTwilioAuthToken ? "Saved token - leave blank to keep" : "Twilio Auth Token";
  }
}

async function loadCommunicationSettings() {
  if (!window.__ERP_USER__) return;
  try {
    const { data } = await fetchCommunicationSettings();
    renderCommunicationSettings(data);
  } catch (error) {
    if (error.status === 403) {
      setMessage(communicationSettingsStatus, "Only admins can manage communication settings.", "error");
      return;
    }
    console.error("Failed to load communication settings", error);
    setMessage(communicationSettingsStatus, error.message || "Failed to load communication settings.", "error");
  }
}

let activeTemplateTextField = templateBodyInput;

for (const field of [templateSubjectInput, templateBodyInput]) {
  field?.addEventListener("focus", () => {
    activeTemplateTextField = field;
  });
}

if (templateVariableInsert) {
  templateVariableInsert.addEventListener("change", (event) => {
    const variable = event.target.value;
    if (!variable) return;
    insertAtCursor(activeTemplateTextField || templateBodyInput || templateSubjectInput, `{{${variable}}}`);
    event.target.value = "";
  });
}

if (templateForm) {
  templateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(templateFormMessage, "Sign in to manage communications.", "error");
      return;
    }
    const form = new FormData(templateForm);
    const payload = {
      name: form.get("name").trim(),
      channel: form.get("channel"),
      subject: form.get("subject") || null,
      bodyText: form.get("bodyText") || null,
      variables: extractVariables(form.get("subject"), form.get("bodyText")),
    };
    try {
      await createMessageTemplate(payload);
      setMessage(templateFormMessage, "Template saved.", "success");
      templateForm.reset();
      await loadTemplates();
    } catch (error) {
      setMessage(templateFormMessage, error.message || "Failed to save template.", "error");
    }
  });
}

if (communicationSettingsForm) {
  communicationSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(communicationSettingsStatus, "Sign in to manage communication settings.", "error");
      return;
    }
    const form = new FormData(communicationSettingsForm);
    const payload = {
      emailProvider: form.get("emailProvider") || "mock",
      emailFrom: (form.get("emailFrom") || "").trim(),
      emailReplyTo: (form.get("emailReplyTo") || "").trim(),
      sendgridApiKey: (form.get("sendgridApiKey") || "").trim(),
      smsProvider: form.get("smsProvider") || "mock",
      twilioAccountSid: (form.get("twilioAccountSid") || "").trim(),
      twilioAuthToken: (form.get("twilioAuthToken") || "").trim(),
      twilioFrom: (form.get("twilioFrom") || "").trim(),
    };
    try {
      const { data } = await updateCommunicationSettings(payload);
      renderCommunicationSettings(data);
      setMessage(communicationSettingsStatus, "Communication settings saved.", "success");
    } catch (error) {
      setMessage(communicationSettingsStatus, error.message || "Failed to save communication settings.", "error");
    }
  });
}

if (messageTemplateSelect) {
  messageTemplateSelect.addEventListener("change", (event) => {
    applyTemplate(event.target.value);
  });
}

if (templateBody) {
  templateBody.addEventListener("click", async (event) => {
    const useButton = event.target.closest("[data-use-template]");
    if (useButton) {
      applyTemplate(useButton.dataset.useTemplate);
      messageForm?.scrollIntoView({ behavior: "smooth", block: "start" });
      messageSubjectInput?.focus();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-template]");
    if (!deleteButton) return;
    if (!window.__ERP_USER__) {
      setMessage(templateFormMessage, "Sign in to delete templates.", "error");
      return;
    }
    const templateId = Number(deleteButton.dataset.deleteTemplate);
    const template = state.templates.find((item) => item.id === templateId);
    const confirmed = window.confirm(`Delete template "${template?.name || "this template"}"?`);
    if (!confirmed) return;
    try {
      await deleteMessageTemplate(templateId);
      if (Number(messageTemplateSelect?.value) === templateId) {
        applyTemplate(null);
      }
      setMessage(templateFormMessage, "Template deleted.", "success");
      await loadTemplates();
      await loadMessages();
    } catch (error) {
      setMessage(templateFormMessage, error.message || "Failed to delete template.", "error");
    }
  });
}

if (messageContactsSelect) {
  messageContactsSelect.addEventListener("change", () => {
    const template = state.templates.find((item) => item.id === Number(messageTemplateSelect?.value));
    updateTemplatePreview(template);
  });
}

if (messageForm) {
  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.__ERP_USER__) {
      setMessage(messageFormMessage, "Sign in to manage communications.", "error");
      return;
    }
    const form = new FormData(messageForm);
    const selectedContacts = Array.from(messageContactsSelect?.selectedOptions || []).map((option) => Number(option.value));
    if (!selectedContacts.length) {
      setMessage(messageFormMessage, "Select at least one contact.", "error");
      return;
    }
    const payload = {
      templateId: form.get("templateId") ? Number(form.get("templateId")) : null,
      channel: form.get("channel") || undefined,
      subject: form.get("subject") || null,
      bodyText: form.get("bodyText") || null,
      audience: {
        contactIds: selectedContacts,
      },
    };
    try {
      await createMessage(payload);
      setMessage(messageFormMessage, "Message drafted.", "success");
      messageForm.reset();
      if (messageContactsSelect) Array.from(messageContactsSelect.options).forEach((option) => (option.selected = false));
      await loadMessages();
    } catch (error) {
      setMessage(messageFormMessage, error.message || "Failed to create message.", "error");
    }
  });
}

if (messagesTableBody) {
  messagesTableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-send]");
    if (!button) return;
    const messageId = Number(button.dataset.messageId);
    try {
      const response = await sendMessage(messageId);
      setMessage(messageFormMessage, "Message sent.", "success");
      await loadMessages();
      await showDeliveries(response.data?.id || messageId);
    } catch (error) {
      setMessage(messageFormMessage, error.message || "Failed to send message.", "error");
    }
  });
}

async function showDeliveries(messageId) {
  try {
    state.selectedMessageId = messageId;
    const { data } = await fetchMessageDeliveries(messageId);
    state.deliveries = data;
    if (deliveryCard) deliveryCard.style.display = "block";
    if (deliverySummary) deliverySummary.textContent = `${data.length} delivery record${data.length === 1 ? "" : "s"}`;
    renderDeliveries(data);
    renderMessages();
  } catch (error) {
    console.error("Failed to load deliveries", error);
  }
}

if (messagesTableBody) {
  messagesTableBody.addEventListener("click", (event) => {
    const row = event.target.closest("[data-message-row]");
    if (!row) return;
    const messageId = Number(row.dataset.messageId);
    showDeliveries(messageId);
  });
}

if (messageStatusFilter) {
  messageStatusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderMessages();
  });
}

if (messageChannelFilter) {
  messageChannelFilter.addEventListener("change", (event) => {
    state.filters.channel = event.target.value;
    renderMessages();
  });
}

if (messageSearchInput) {
  let debounce;
  messageSearchInput.addEventListener("input", (event) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.filters.search = event.target.value || "";
      renderMessages();
    }, 250);
  });
}

function init() {
  const onReady = () => {
    loadTemplates();
    loadMessages();
    loadContacts();
    loadCommunicationSettings();
  };
  if (!window.__ERP_USER__) {
    document.addEventListener("auth:ready", onReady, { once: true });
  } else {
    onReady();
  }
}

init();
