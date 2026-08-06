import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { getProviderRegistry } from "./providers/registry.js";

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    variables: row.variables_json ? JSON.parse(row.variables_json) : [],
    isActive: !!row.is_active,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name ?? null,
    channel: row.channel,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    audience: row.audience_json ? JSON.parse(row.audience_json) : {},
    status: row.status,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getMessageRow(messageId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.*, t.name AS template_name
       FROM messages m
       LEFT JOIN message_templates t ON t.id = m.template_id
       WHERE m.id = ?`
    )
    .get(messageId);
}

function normalizeContactIds(audience) {
  if (!audience || !Array.isArray(audience.contactIds)) {
    return [];
  }
  const unique = [];
  const seen = new Set();
  for (const value of audience.contactIds) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function fetchContactsByIds(db, contactIds) {
  if (!contactIds.length) {
    return [];
  }
  const placeholders = contactIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, first_name, last_name, email, phone, mobile, do_not_contact
       FROM contacts
       WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    )
    .all(...contactIds);
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    doNotContact: !!row.do_not_contact,
  }));
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveContactAddress(contact, channel) {
  if (channel === "SMS") {
    const mobile = cleanString(contact.mobile);
    if (mobile) return mobile;
    const phone = cleanString(contact.phone);
    if (phone) return phone;
    return "";
  }
  return cleanString(contact.email);
}

function contactMergeData(contact) {
  return {
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    email: contact.email || "",
    phone: contact.phone || "",
    mobile: contact.mobile || "",
  };
}

function renderTemplateText(value, contact) {
  if (!value) return value;
  const data = contactMergeData(contact);
  return String(value).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
    const field = String(key).trim();
    return Object.prototype.hasOwnProperty.call(data, field) ? data[field] : match;
  });
}

function mapProviderStatus(status) {
  const normalized = typeof status === "string" ? status.toLowerCase() : "";
  if (normalized === "delivered") return "Delivered";
  if (normalized === "failed" || normalized === "error") return "Failed";
  return "Sent";
}

export function listTemplates() {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM message_templates ORDER BY created_at DESC, id DESC`)
    .all()
    .map(mapTemplate);
}

export function createTemplate(data, auditContext) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO message_templates (name, channel, subject, body_html, body_text, variables_json, is_active, created_by, updated_by)
       VALUES (@name, @channel, @subject, @body_html, @body_text, @variables_json, 1, @created_by, @updated_by)`
    )
    .run({
      name: data.name,
      channel: data.channel,
      subject: data.subject ?? null,
      body_html: data.bodyHtml ?? null,
      body_text: data.bodyText ?? null,
      variables_json: data.variables ? JSON.stringify(data.variables) : null,
      created_by: auditContext?.userId ?? null,
      updated_by: auditContext?.userId ?? null,
    });
  const template = mapTemplate(
    db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(result.lastInsertRowid)
  );
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "message_templates",
    entityId: String(template.id),
    action: "create",
    after: template,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return template;
}

export function updateTemplate(templateId, updates, auditContext) {
  const db = getDb();
  const existing = mapTemplate(
    db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(templateId)
  );
  if (!existing) {
    return null;
  }
  const sets = [];
  const params = { id: templateId };
  const mapping = {
    name: "name",
    channel: "channel",
    subject: "subject",
    bodyHtml: "body_html",
    bodyText: "body_text",
    isActive: "is_active",
  };
  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];
      if (key === "isActive") {
        value = updates[key] ? 1 : 0;
      }
      sets.push(`${column} = @${column}`);
      params[column] = value ?? null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, "variables")) {
    sets.push("variables_json = @variables_json");
    params.variables_json = updates.variables ? JSON.stringify(updates.variables) : null;
  }
  if (!sets.length) {
    return existing;
  }
  sets.push("updated_by = @updated_by");
  params.updated_by = auditContext?.userId ?? null;
  db.prepare(`UPDATE message_templates SET ${sets.join(", ")} WHERE id = @id`).run(params);
  const updated = mapTemplate(
    db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(templateId)
  );
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "message_templates",
    entityId: String(templateId),
    action: "update",
    before: existing,
    after: updated,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return updated;
}

export function deleteTemplate(templateId, auditContext) {
  const db = getDb();
  const existing = mapTemplate(
    db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(templateId)
  );
  if (!existing) {
    return null;
  }
  const run = db.transaction(() => {
    db.prepare(`UPDATE messages SET template_id = NULL WHERE template_id = ?`).run(templateId);
    db.prepare(`DELETE FROM message_templates WHERE id = ?`).run(templateId);
  });
  run();
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "message_templates",
    entityId: String(templateId),
    action: "delete",
    before: existing,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return existing;
}

export function listMessages({ status, channel } = {}) {
  const db = getDb();
  const where = [];
  const params = {};
  if (status) {
    where.push("m.status = @status");
    params.status = status;
  }
  if (channel) {
    where.push("m.channel = @channel");
    params.channel = channel;
  }
  const sql = `SELECT m.*, t.name AS template_name
    FROM messages m
    LEFT JOIN message_templates t ON t.id = m.template_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY m.created_at DESC`;
  return db.prepare(sql).all(params).map(mapMessage);
}

export function createMessage(data, auditContext) {
  const db = getDb();
  let template = null;
  if (data.templateId) {
    template = db.prepare(`SELECT * FROM message_templates WHERE id = ?`).get(data.templateId);
    if (!template) {
      throw new Error("Template not found");
    }
  }
  const audience = data.audience ?? {};
  const audienceJson = JSON.stringify(audience);
  const result = db
    .prepare(
      `INSERT INTO messages (template_id, channel, subject, body_html, body_text, audience_json, status, scheduled_at, created_by)
       VALUES (@template_id, @channel, @subject, @body_html, @body_text, @audience_json, @status, @scheduled_at, @created_by)`
    )
    .run({
      template_id: data.templateId ?? null,
      channel: data.channel ?? (template?.channel ?? "Email"),
      subject: data.subject ?? template?.subject ?? null,
      body_html: data.bodyHtml ?? template?.body_html ?? null,
      body_text: data.bodyText ?? template?.body_text ?? null,
      audience_json: audienceJson,
      status: data.status ?? "Draft",
      scheduled_at: data.scheduledAt ?? null,
      created_by: auditContext?.userId ?? null,
    });
  const message = mapMessage(getMessageRow(result.lastInsertRowid));
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "messages",
    entityId: String(message.id),
    action: "create",
    after: message,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return message;
}

export function listMessageDeliveries(messageId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT d.*, printf('%s %s', c.first_name, c.last_name) AS contact_name
       FROM message_deliveries d
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.message_id = ?
       ORDER BY d.created_at`
    )
    .all(messageId)
    .map((row) => ({
      id: row.id,
      messageId: row.message_id,
      contactId: row.contact_id,
      contactName: row.contact_name ?? null,
      channel: row.channel,
      address: row.address,
      status: row.status,
      sentAt: row.sent_at,
      deliveredAt: row.delivered_at,
      errorMessage: row.error_message,
      providerResponse: row.provider_response,
      createdAt: row.created_at,
    }));
}

export async function sendMessage(messageId, auditContext) {
  const db = getDb();
  const row = getMessageRow(messageId);
  if (!row) {
    throw new Error("Message not found");
  }

  const before = mapMessage(row);
  const contactIds = normalizeContactIds(before.audience);
  if (!contactIds.length) {
    throw new Error("Audience has no contact IDs");
  }

  const registry = getProviderRegistry();
  const provider = before.channel === "SMS" ? registry.sms : registry.email;
  if (!provider) {
    throw new Error(`No provider configured for ${before.channel}`);
  }

  const subjectText = cleanString(before.subject);
  const bodyHtml = cleanString(before.bodyHtml);
  const bodyText = cleanString(before.bodyText);

  if (before.channel === "SMS" && !bodyText) {
    throw new Error("SMS messages require body text");
  }
  if (before.channel === "Email" && !subjectText && !bodyHtml && !bodyText) {
    throw new Error("Email messages require a subject or body");
  }

  const updateStatusStmt = db.prepare(
    `UPDATE messages SET status = @status, sent_at = @sent_at WHERE id = @id`
  );
  updateStatusStmt.run({ status: "Sending", sent_at: null, id: messageId });

  try {
    const contacts = fetchContactsByIds(db, contactIds);
    const contactMap = new Map(contacts.map((contact) => [contact.id, contact]));
    const deliveries = [];

    for (const identifier of contactIds) {
      const contact = contactMap.get(identifier);
      if (!contact) {
        deliveries.push({
          message_id: messageId,
          contact_id: null,
          channel: before.channel,
          address: null,
          status: "Failed",
          provider_response: null,
          sent_at: null,
          delivered_at: null,
          error_message: `Contact ${identifier} not found`,
        });
        continue;
      }

      if (contact.doNotContact) {
        deliveries.push({
          message_id: messageId,
          contact_id: contact.id,
          channel: before.channel,
          address: null,
          status: "Failed",
          provider_response: null,
          sent_at: null,
          delivered_at: null,
          error_message: "Contact marked as do not contact",
        });
        continue;
      }

      const address = resolveContactAddress(contact, before.channel);
      if (!address) {
        deliveries.push({
          message_id: messageId,
          contact_id: contact.id,
          channel: before.channel,
          address: null,
          status: "Failed",
          provider_response: null,
          sent_at: null,
          delivered_at: null,
          error_message:
            before.channel === "SMS"
              ? "Contact has no phone number"
              : "Contact has no email address",
        });
        continue;
      }

      try {
        let providerResult;
        const personalizedSubject = renderTemplateText(subjectText, contact);
        const personalizedBodyHtml = renderTemplateText(bodyHtml, contact);
        const personalizedBodyText = renderTemplateText(bodyText, contact);
        if (before.channel === "SMS") {
          providerResult = await provider.sendSms({
            to: address,
            message: personalizedBodyText,
            metadata: {
              messageId,
              contactId: contact.id,
            },
          });
        } else {
          providerResult = await provider.sendEmail({
            to: address,
            subject: personalizedSubject || before.templateName || "Message",
            html: personalizedBodyHtml || null,
            text: personalizedBodyText || null,
            metadata: {
              messageId,
              contactId: contact.id,
            },
          });
        }

        const status = mapProviderStatus(providerResult?.status);
        const timestamp = new Date().toISOString();
        deliveries.push({
          message_id: messageId,
          contact_id: contact.id,
          channel: before.channel,
          address,
          status,
          provider_response: providerResult ? JSON.stringify(providerResult) : null,
          sent_at: status === "Failed" ? null : providerResult?.deliveredAt || timestamp,
          delivered_at:
            status === "Delivered" ? providerResult?.deliveredAt || timestamp : null,
          error_message: status === "Failed" ? providerResult?.error ?? null : null,
        });
      } catch (error) {
        deliveries.push({
          message_id: messageId,
          contact_id: contact.id,
          channel: before.channel,
          address,
          status: "Failed",
          provider_response: null,
          sent_at: null,
          delivered_at: null,
          error_message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = deliveries.filter((delivery) =>
      delivery.status === "Sent" || delivery.status === "Delivered"
    ).length;
    const finalStatus = successCount ? "Sent" : "Failed";
    const completedAt = new Date().toISOString();

    const persistDeliveries = db.transaction((records, status, sentTimestamp) => {
      const insertDelivery = db.prepare(
        `INSERT INTO message_deliveries (
           message_id,
           contact_id,
           channel,
           address,
           status,
           provider_response,
           sent_at,
           delivered_at,
           error_message
         ) VALUES (
           @message_id,
           @contact_id,
           @channel,
           @address,
           @status,
           @provider_response,
           @sent_at,
           @delivered_at,
           @error_message
         )`
      );
      for (const record of records) {
        insertDelivery.run(record);
      }
      updateStatusStmt.run({ status, sent_at: sentTimestamp, id: messageId });
    });

    persistDeliveries(deliveries, finalStatus, completedAt);

    const updated = mapMessage(getMessageRow(messageId));
    writeAuditLog({
      userId: auditContext?.userId ?? null,
      entity: "messages",
      entityId: String(messageId),
      action: "send",
      before,
      after: updated,
      ipAddress: auditContext?.ip ?? null,
      userAgent: auditContext?.userAgent ?? null,
    });

    return updated;
  } catch (error) {
    updateStatusStmt.run({ status: "Failed", sent_at: null, id: messageId });
    throw error;
  }
}
