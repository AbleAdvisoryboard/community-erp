import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";

const CONTROL_KEYS = {
  manualJournalApproval: "finance.controls.manual_journal_approval",
  manualJournalApprover: "finance.controls.manual_journal_approver",
  bankDepositApproval: "finance.controls.bank_deposit_approval",
  bankDepositApprover: "finance.controls.bank_deposit_approver",
  billApproval: "finance.controls.bill_approval",
  billApprover: "finance.controls.bill_approver",
  paymentApproval: "finance.controls.payment_approval",
  paymentApprover: "finance.controls.payment_approver",
};

const DEFAULT_CONTROLS = {
  manualJournalApproval: false,
  manualJournalApprover: "",
  bankDepositApproval: false,
  bankDepositApprover: "",
  billApproval: false,
  billApprover: "",
  paymentApproval: false,
  paymentApprover: "",
};

function getSetting(db, key, fallback = "") {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row?.value ?? fallback;
}

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ key, value: String(value ?? "") });
}

function asBoolean(value) {
  return value === true || value === "1" || value === "true";
}

export function getFinanceControls() {
  const db = getDb();
  return {
    manualJournalApproval: asBoolean(getSetting(db, CONTROL_KEYS.manualJournalApproval, "0")),
    manualJournalApprover: getSetting(db, CONTROL_KEYS.manualJournalApprover, ""),
    bankDepositApproval: asBoolean(getSetting(db, CONTROL_KEYS.bankDepositApproval, "0")),
    bankDepositApprover: getSetting(db, CONTROL_KEYS.bankDepositApprover, ""),
    billApproval: asBoolean(getSetting(db, CONTROL_KEYS.billApproval, "0")),
    billApprover: getSetting(db, CONTROL_KEYS.billApprover, ""),
    paymentApproval: asBoolean(getSetting(db, CONTROL_KEYS.paymentApproval, "0")),
    paymentApprover: getSetting(db, CONTROL_KEYS.paymentApprover, ""),
  };
}

export function updateFinanceControls(data, auditContext) {
  const db = getDb();
  const before = getFinanceControls();
  const next = {
    ...DEFAULT_CONTROLS,
    manualJournalApproval: Boolean(data.manualJournalApproval),
    manualJournalApprover: data.manualJournalApprover?.trim() || "",
    bankDepositApproval: Boolean(data.bankDepositApproval),
    bankDepositApprover: data.bankDepositApprover?.trim() || "",
    billApproval: Boolean(data.billApproval),
    billApprover: data.billApprover?.trim() || "",
    paymentApproval: Boolean(data.paymentApproval),
    paymentApprover: data.paymentApprover?.trim() || "",
  };

  const run = db.transaction(() => {
    setSetting(db, CONTROL_KEYS.manualJournalApproval, next.manualJournalApproval ? "1" : "0");
    setSetting(db, CONTROL_KEYS.manualJournalApprover, next.manualJournalApprover);
    setSetting(db, CONTROL_KEYS.bankDepositApproval, next.bankDepositApproval ? "1" : "0");
    setSetting(db, CONTROL_KEYS.bankDepositApprover, next.bankDepositApprover);
    setSetting(db, CONTROL_KEYS.billApproval, next.billApproval ? "1" : "0");
    setSetting(db, CONTROL_KEYS.billApprover, next.billApprover);
    setSetting(db, CONTROL_KEYS.paymentApproval, next.paymentApproval ? "1" : "0");
    setSetting(db, CONTROL_KEYS.paymentApprover, next.paymentApprover);
  });
  run();

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "finance_controls",
    entityId: "settings",
    action: "update",
    before,
    after: next,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return next;
}

export function getApprovalNote(kind) {
  const controls = getFinanceControls();
  const map = {
    manualJournal: ["manualJournalApproval", "manualJournalApprover"],
    bankDeposit: ["bankDepositApproval", "bankDepositApprover"],
    bill: ["billApproval", "billApprover"],
    payment: ["paymentApproval", "paymentApprover"],
  };
  const [requiredKey, approverKey] = map[kind] || [];
  if (!requiredKey || !controls[requiredKey]) return null;
  const approver = controls[approverKey] || "Approval not configured";
  return { required: true, approver };
}
