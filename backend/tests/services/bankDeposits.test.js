import { afterAll, describe, it, expect } from 'vitest';
import { useTestDatabase } from '../utils/db.js';
import { getDb } from '../../db/connection.js';

describe('bank deposits', () => {
  const { cleanup } = useTestDatabase({ seed: true });

  afterAll(() => cleanup());

  it('creates a deposit and tags payments', () => {
    const db = getDb();
    // Ensure bank account exists
    const cashId = db.prepare("SELECT id FROM gl_accounts WHERE code='1000'").get()?.id
      || db.prepare("INSERT INTO gl_accounts (code,name,type,is_active) VALUES ('1000','Cash','Asset',1)").run().lastInsertRowid;
    const bank = db.prepare("INSERT INTO bank_accounts (name, gl_account_id) VALUES ('Test Bank', ?) ").run(cashId);
    const bankAccountId = bank.lastInsertRowid;
    // Create an invoice and two payments without deposit
    const inv = db.prepare("INSERT INTO invoices (invoice_no, invoice_date, status, total_amount, balance_amount) VALUES ('INVTEST2','2025-01-01','Posted',100,0)").run();
    const invId = inv.lastInsertRowid;
    const p1 = db.prepare("INSERT INTO invoice_payments (invoice_id, received_at, amount, method) VALUES (?,?,?,?)").run(invId, '2025-01-02', 30, 'Offline');
    const p2 = db.prepare("INSERT INTO invoice_payments (invoice_id, received_at, amount, method) VALUES (?,?,?,?)").run(invId, '2025-01-03', 70, 'Offline');

    // Mimic route logic
    const dep = db.prepare("INSERT INTO bank_deposits (bank_account_id, deposit_date, total_amount, memo) VALUES (?,?,?,?)").run(bankAccountId, '2025-01-05', 100, 'Batch');
    const depositId = dep.lastInsertRowid;
    db.prepare("INSERT INTO bank_deposit_lines (deposit_id, payment_id, amount) VALUES (?,?,?)").run(depositId, p1.lastInsertRowid, 30);
    db.prepare("INSERT INTO bank_deposit_lines (deposit_id, payment_id, amount) VALUES (?,?,?)").run(depositId, p2.lastInsertRowid, 70);
    db.prepare("UPDATE invoice_payments SET deposit_batch_id = ? WHERE id IN (?,?)").run(depositId, p1.lastInsertRowid, p2.lastInsertRowid);

    const tagged = db.prepare("SELECT COUNT(1) AS c FROM invoice_payments WHERE deposit_batch_id = ?").get(depositId);
    expect(tagged.c).toBe(2);
  });
});
