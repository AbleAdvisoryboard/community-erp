import { getDb } from "../db/connection.js";

export function writeAuditLog({
  userId = null,
  entity,
  entityId = null,
  action,
  before = null,
  after = null,
  ipAddress = null,
  userAgent = null,
}) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO audit_logs (user_id, entity, entity_id, action, before_json, after_json, ip_address, user_agent)
     VALUES (@userId, @entity, @entityId, @action, @beforeJson, @afterJson, @ip, @agent)`
  );
  stmt.run({
    userId,
    entity,
    entityId,
    action,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    ip: ipAddress,
    agent: userAgent,
  });
}
