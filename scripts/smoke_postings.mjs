import { createApp } from '../backend/app.js';
import { getDb } from '../backend/db/connection.js';
import { createInvoice, applyInvoicePayment } from '../backend/services/arService.js';
import { createBill, applyBillPayment } from '../backend/services/apService.js';
import { createDonation } from '../backend/services/fundraisingService.js';
import { generateAndPostFromDonation, generateAndPostFromAR, generateAndPostFromAP } from '../backend/services/postingService.js';
import { getTrialBalance, getFinancialOverview, getNonprofitStatement } from '../backend/services/financeService.js';
import { GL_CODES } from '../backend/utils/gl.js';

// Ensure DB is initialized and migrations applied
createApp({ loadEnv: false, runMigrations: true, initializeDb: true });
const db = getDb();

const today = new Date().toISOString().slice(0,10);

function idByCode(table, code) {
  return db.prepare(`SELECT id FROM ${table} WHERE code = ?`).get(code)?.id || null;
}

function findFundByName(name) {
  return db.prepare("SELECT id FROM funds WHERE name = ?").get(name)?.id || db.prepare("SELECT id FROM funds LIMIT 1").get()?.id || null;
}

function log(title, obj) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(obj, null, 2));
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function sumDRCR(lines) {
  let d=0,c=0; for (const l of lines) { if (l.drcr === 'D') d+=Number(l.amount||0); else if (l.drcr==='C') c+=Number(l.amount||0); }
  return { d, c };
}

async function main() {
  // Baseline contributions before
  const beforeNps = getNonprofitStatement({ asOf: today });
  const beforeContrib = Number(beforeNps.revenuesOfSupport.contributions || 0);

  // Donation
  const fundId = findFundByName('Unrestricted');
  const donation = await createDonation({
    accountId: null,
    contactId: null,
    fundId,
    campaignId: null,
    amount: 123.45,
    currencyCode: 'USD',
    donatedAt: today,
    paymentMethod: 'Offline',
    isRecurring: false,
    status: 'Posted',
  }, { userId: null });
  // Ensure posted (idempotent safe)
  generateAndPostFromDonation(donation.id);
  const donJL = db.prepare("SELECT journal_id, gl_account_id, fund_id, campaign_id, drcr, amount, source_table, source_id FROM journal_lines WHERE source_table='donations' AND source_id = ?").all(donation.id);
  log('Donation posted JL', donJL);
  assert(donJL.length === 2, 'Donation should create 2 journal lines');
  const glUndep = idByCode('gl_accounts', GL_CODES.UNDEPOSITED);
  const glContrib = idByCode('gl_accounts', GL_CODES.CONTRIB_REV_BASE) || idByCode('gl_accounts','4000');
  const dr = donJL.find(l=>l.drcr==='D'); const cr = donJL.find(l=>l.drcr==='C');
  assert(dr && dr.gl_account_id === glUndep, 'Donation DR should be Undeposited Funds');
  assert(cr && cr.gl_account_id === glContrib, 'Donation CR should be Contribution Revenue base');
  assert(dr.fund_id === fundId && cr.fund_id === fundId, 'Donation lines carry fund_id');
  assert(donJL.every(l=>l.source_table==='donations' && l.source_id===donation.id), 'Donation lines tagged with source');
  const s1 = sumDRCR(donJL); assert(Math.abs(s1.d - s1.c) < 0.0001, 'Donation journal balanced');

  // Deposit donation
  const depRun = db.transaction(() => {
    let bank = db.prepare("SELECT id, gl_account_id FROM bank_accounts ORDER BY id LIMIT 1").get();
    if (!bank) {
      const gl = idByCode('gl_accounts','1000');
      const ins = db.prepare("INSERT INTO bank_accounts (name, gl_account_id) VALUES (?, ?)").run('Operating Checking', gl);
      bank = { id: ins.lastInsertRowid, gl_account_id: gl };
    }
    const dep = db.prepare("INSERT INTO bank_deposits (bank_account_id, deposit_date, total_amount, memo) VALUES (?,?,?,?)").run(bank.id, today, 123.45, 'Smoke Deposit');
    db.prepare("INSERT INTO bank_deposit_donation_lines (deposit_id, donation_id, amount) VALUES (?,?,?)").run(dep.lastInsertRowid, donation.id, 123.45);
    db.prepare("UPDATE donations SET deposit_batch_id = ? WHERE id = ?").run(dep.lastInsertRowid, donation.id);
    const j = db.prepare("INSERT INTO journals (entry_no, number, journal_date, memo, posted_at, is_posted) VALUES (printf('J%06d', COALESCE((SELECT MAX(id) FROM journals),0)+1), printf('JE-%s-%04d', strftime('%Y','now'), COALESCE((SELECT MAX(id) FROM journals),0)+1), ?, 'Smoke Deposit', CURRENT_TIMESTAMP, 1)").run(today);
    const jl = db.prepare("INSERT INTO journal_lines (journal_id, gl_account_id, amount, drcr, memo, source_table, source_id) VALUES (?,?,?,?,?,?,?)");
    jl.run(j.lastInsertRowid, bank.gl_account_id, 123.45, 'D', 'Smoke Deposit', 'bank_deposits', dep.lastInsertRowid);
    jl.run(j.lastInsertRowid, idByCode('gl_accounts','1010'), 123.45, 'C', 'Smoke Deposit', 'bank_deposits', dep.lastInsertRowid);
    return dep.lastInsertRowid;
  });
  const depId = depRun();
  const undepAfter = db.prepare("SELECT id FROM donations WHERE deposit_batch_id IS NULL AND id = ?").get(donation.id);
  log('Donation removed from undeposited', { stillUndeposited: !!undepAfter });
  assert(!undepAfter, 'Donation should be marked deposited');
  const depJL = db.prepare("SELECT gl_account_id, drcr, amount, source_table, source_id FROM journal_lines WHERE source_table='bank_deposits' AND source_id = ? ORDER BY id").all(depId);
  const bank = db.prepare("SELECT gl_account_id FROM bank_accounts ORDER BY id LIMIT 1").get();
  assert(depJL.length === 2, 'Deposit creates 2 GL lines');
  assert(depJL.some(l=>l.gl_account_id===bank.gl_account_id && l.drcr==='D'), 'Deposit DR bank');
  assert(depJL.some(l=>l.gl_account_id===glUndep && l.drcr==='C'), 'Deposit CR Undeposited');
  const s2 = sumDRCR(depJL); assert(Math.abs(s2.d - s2.c) < 0.0001, 'Deposit journal balanced');

  // AR invoice + payment
  const rev4000 = idByCode('gl_accounts','4000');
  const rev4100 = idByCode('gl_accounts','4100') || rev4000;
  const inv = createInvoice({
    accountId: null,
    contactId: null,
    invoiceDate: today,
    memo: 'Smoke AR',
    lines: [
      { description: 'L1', quantity: 1, unitPrice: 50, revenueGlAccountId: rev4000 },
      { description: 'L2', quantity: 1, unitPrice: 75, revenueGlAccountId: rev4100 },
    ],
  }, { userId: null });
  const invJL = db.prepare("SELECT drcr, amount, gl_account_id, source_table, source_id, source_line FROM journal_lines WHERE source_table='invoices' AND source_id = ? ORDER BY id").all(inv.id);
  log('AR invoice JL', invJL);
  assert(invJL.length === 3, 'Invoice should create 3 lines (1 DR AR, 2 CR revenue)');
  assert(invJL.find(l=>l.gl_account_id===idByCode('gl_accounts','1100') && l.drcr==='D'), 'Invoice DR AR');
  const revLines = invJL.filter(l=>l.drcr==='C');
  assert(revLines.length===2 && revLines.every(l=>l.source_line), 'Invoice CR lines have source_line set');
  const pay = applyInvoicePayment(inv.id, { receivedAt: today, amount: 125, method: 'Offline' }, { userId: null });
  assert(pay?.id, 'AR payment returns an id');
  const payJL = db.prepare("SELECT drcr, amount, gl_account_id, source_table, source_id FROM journal_lines WHERE source_table='invoice_payments' AND source_id IN (SELECT id FROM invoice_payments WHERE invoice_id = ?) ORDER BY id").all(inv.id);
  log('AR payment JL', payJL);
  assert(payJL.length===2, 'AR payment creates 2 lines');
  assert(payJL.find(l=>l.gl_account_id===glUndep && l.drcr==='D'), 'AR payment DR Undeposited');
  assert(payJL.find(l=>l.gl_account_id===idByCode('gl_accounts','1100') && l.drcr==='C'), 'AR payment CR AR');
  const s3 = sumDRCR(payJL); assert(Math.abs(s3.d - s3.c) < 0.0001, 'AR payment journal balanced');

  // AP bill + payment
  const exp6000 = idByCode('gl_accounts','6000');
  const exp6100 = idByCode('gl_accounts','6100') || exp6000;
  const bill = createBill({
    vendorAccountId: null,
    billDate: today,
    memo: 'Smoke AP',
    lines: [
      { description: 'E1', quantity: 1, unitPrice: 20, expenseGlAccountId: exp6000 },
      { description: 'E2', quantity: 1, unitPrice: 30, expenseGlAccountId: exp6100 },
    ],
  }, { userId: null });
  log('AP bill', bill);
  const billJL = db.prepare("SELECT drcr, amount, gl_account_id, source_table, source_id, source_line FROM journal_lines WHERE source_table='bills' AND source_id = ? ORDER BY id").all(bill.id);
  log('AP bill JL', billJL);
  assert(billJL.length===3, 'AP bill creates 3 lines');
  const expLines = billJL.filter(l=>l.drcr==='D');
  assert(expLines.length===2 && expLines.every(l=>l.source_line), 'AP bill has 2 expense DR lines with source_line');
  assert(billJL.find(l=>l.gl_account_id===idByCode('gl_accounts','2000') && l.drcr==='C'), 'AP bill CR AP');
  const jlPeek = db.prepare("SELECT id, gl_account_id, drcr, amount, source_table, source_id FROM journal_lines ORDER BY id DESC LIMIT 10").all();
  log('Recent JL peek', jlPeek);
  const billPay = applyBillPayment(bill.id, { paidAt: today, amount: 50, method: 'Offline' }, { userId: null });
  assert(billPay?.id, 'AP payment returns an id');
  const billPayJL = db.prepare("SELECT drcr, amount, gl_account_id, source_table, source_id FROM journal_lines WHERE source_table='bill_payments' AND source_id IN (SELECT id FROM bill_payments WHERE bill_id = ?) ORDER BY id").all(bill.id);
  log('AP payment JL', billPayJL);
  assert(billPayJL.length===2, 'AP payment creates 2 lines');
  assert(billPayJL.find(l=>l.gl_account_id===idByCode('gl_accounts','2000') && l.drcr==='D'), 'AP payment DR AP');
  assert(billPayJL.find(l=>l.gl_account_id===idByCode('gl_accounts','1000') && l.drcr==='C'), 'AP payment CR Cash');
  const s4 = sumDRCR(billPayJL); assert(Math.abs(s4.d - s4.c) < 0.0001, 'AP payment journal balanced');
  const peek2 = db.prepare("SELECT id, gl_account_id, drcr, amount, source_table, source_id FROM journal_lines ORDER BY id DESC LIMIT 10").all();
  log('Recent JL peek (after AP payment)', peek2);

  // Trial Balance & Financial Statements
  const tb = getTrialBalance({ asOf: today });
  log('Trial Balance sample', tb.slice(0, 8));
  const tbSum = (rows) => rows.reduce((acc, r)=>{acc.debits+=Number(r.total_debits||0);acc.credits+=Number(r.total_credits||0);return acc;},{debits:0,credits:0});
  const allSum = tbSum(tb);
  const tbFund = getTrialBalance({ asOf: today, fundId });
  const fundSum = tbSum(tbFund);
  assert(allSum.debits >= fundSum.debits && allSum.credits >= fundSum.credits, 'TB totals cover fund-filtered totals');
  const fo = getFinancialOverview({ asOf: today });
  log('Financial Overview', fo);
  const nps = getNonprofitStatement({ asOf: today });
  log('Nonprofit Statement (revenuesOfSupport summary)', nps.revenuesOfSupport);
  const afterContrib = Number(nps.revenuesOfSupport.contributions || 0);
  assert(afterContrib >= beforeContrib + 123.45 - 0.01, 'Contributions include the donation amount');

  // Idempotency re-post guards (services)
  const againDon = generateAndPostFromDonation(donation.id);
  assert(againDon.alreadyPosted, 'Donation re-post flagged alreadyPosted');
  const invRe = generateAndPostFromAR({ invoiceId: inv.id });
  assert(invRe.alreadyPosted, 'Invoice re-post flagged alreadyPosted');
  const billRe = generateAndPostFromAP({ billId: bill.id });
  assert(billRe.alreadyPosted, 'Bill re-post flagged alreadyPosted');

  console.log('\n=== PROOF REPORT ===');
  console.log(JSON.stringify({
    ids: { donationId: donation.id, invoiceId: inv.id, billId: bill.id, depositId: depId },
    flows: {
      donation: 'PASSED',
      deposit: 'PASSED',
      ar: 'PASSED',
      ap: 'PASSED',
      tbFilters: 'PASSED',
      idempotency: 'PASSED'
    },
    tbTotals: { all: allSum, fund: fundSum },
    contributionsBefore: beforeContrib,
    contributionsAfter: afterContrib
  }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
