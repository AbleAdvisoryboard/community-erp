import { afterAll, describe, it, expect } from 'vitest';
import { useTestDatabase } from '../utils/db.js';
import { getDb } from '../../db/connection.js';
import { getTrialBalance } from '../../services/financeService.js';

describe('trial balance filter by fund', () => {
  const { cleanup } = useTestDatabase({ seed: true });

  afterAll(() => cleanup());

  it('filters on fund_id', () => {
    const db = getDb();
    // Ensure accounts
    const cash = db.prepare("SELECT id FROM gl_accounts WHERE code='1000'").get()?.id || db.prepare("INSERT INTO gl_accounts (code,name,type,is_active) VALUES ('1000','Cash','Asset',1)").run().lastInsertRowid;
    const rev = db.prepare("SELECT id FROM gl_accounts WHERE code='4000'").get()?.id || db.prepare("INSERT INTO gl_accounts (code,name,type,is_active) VALUES ('4000','Revenue','Revenue',1)").run().lastInsertRowid;
    // Create two funds
    const f1 = db.prepare("INSERT INTO funds (name, code, restriction, is_active) VALUES ('Fund A','FA','Unrestricted',1)").run().lastInsertRowid;
    const f2 = db.prepare("INSERT INTO funds (name, code, restriction, is_active) VALUES ('Fund B','FB','Unrestricted',1)").run().lastInsertRowid;
    // Journal 1 for Fund A: Dr Cash 50, Cr Rev 50
    const j1 = db.prepare("INSERT INTO journals (entry_no, journal_date, posted_at) VALUES ('JFUND001','2025-01-01',CURRENT_TIMESTAMP)").run().lastInsertRowid;
    db.prepare("INSERT INTO journal_lines (journal_id, gl_account_id, fund_id, amount, drcr) VALUES (?,?,?,?,?)").run(j1, cash, f1, 50, 'D');
    db.prepare("INSERT INTO journal_lines (journal_id, gl_account_id, fund_id, amount, drcr) VALUES (?,?,?,?,?)").run(j1, rev, f1, 50, 'C');
    // Journal 2 for Fund B: Dr Cash 20, Cr Rev 20
    const j2 = db.prepare("INSERT INTO journals (entry_no, journal_date, posted_at) VALUES ('JFUND002','2025-01-01',CURRENT_TIMESTAMP)").run().lastInsertRowid;
    db.prepare("INSERT INTO journal_lines (journal_id, gl_account_id, fund_id, amount, drcr) VALUES (?,?,?,?,?)").run(j2, cash, f2, 20, 'D');
    db.prepare("INSERT INTO journal_lines (journal_id, gl_account_id, fund_id, amount, drcr) VALUES (?,?,?,?,?)").run(j2, rev, f2, 20, 'C');

    const tbA = getTrialBalance({ fundId: f1 });
    const cashRowA = tbA.find(r => r.account_id === cash);
    const tbB = getTrialBalance({ fundId: f2 });
    const cashRowB = tbB.find(r => r.account_id === cash);
    expect(Math.round(cashRowA.balance)).toBe(50);
    expect(Math.round(cashRowB.balance)).toBe(20);
  });
});
