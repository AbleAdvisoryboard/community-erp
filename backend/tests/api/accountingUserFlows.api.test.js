import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;
let agent;
let csrfToken;
let accountsByCode;

const today = new Date().toISOString().slice(0, 10);

function expectStatus(response, status) {
  if (response.status !== status) {
    throw new Error(`Expected ${status}, received ${response.status}: ${JSON.stringify(response.body)}`);
  }
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function expectMoneyDelta(after, before, amount) {
  expect(money(after - before)).toBeCloseTo(money(amount), 2);
}

async function getData(path) {
  const response = await agent.get(path);
  expectStatus(response, 200);
  return response.body.data;
}

async function postData(path, body) {
  const response = await agent.post(path).set("x-csrf-token", csrfToken).send(body);
  expectStatus(response, 201);
  return response.body.data;
}

async function getStatements() {
  const [overview, nonprofit, position] = await Promise.all([
    getData(`/api/v1/finance/financials/overview?as_of=${today}`),
    getData(`/api/v1/finance/financials/nonprofit-statement?as_of=${today}`),
    getData(`/api/v1/finance/financials/balance-sheet-detailed?as_of=${today}`),
  ]);
  return { overview, nonprofit, position };
}

async function expectStatementBalance() {
  const { overview, position } = await getStatements();
  expect(overview.balanceSheet.assetsEqualsLiabPlusEquity).toBe(true);
  expect(money(position.totalAssets)).toBeCloseTo(money(position.totalLiabilitiesAndEquity), 2);
}

async function expectJournalSource(sourceTable, sourceId) {
  const journals = await getData("/api/v1/finance/journals?limit=200");
  const found = journals.some((entry) =>
    entry.lines?.some((line) => line.source_table === sourceTable && Number(line.source_id) === Number(sourceId))
  );
  expect(found).toBe(true);
}

async function expectJournalMemo(memo) {
  const journals = await getData("/api/v1/finance/journals?limit=200");
  expect(journals.some((entry) => entry.journal?.memo === memo)).toBe(true);
}

beforeAll(async () => {
  dbHandle = useTestDatabase({ seed: true });
  const app = createApp({ loadEnv: false, runMigrations: false });
  agent = request.agent(app);

  const login = await agent
    .post("/api/v1/auth/login")
    .send({ email: "admin@example.com", password: "Passw0rd!" });
  expectStatus(login, 200);
  csrfToken = login.body.csrfToken;

  const accounts = await getData("/api/v1/finance/gl-accounts");
  accountsByCode = new Map(accounts.map((account) => [account.code, account]));
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("user accounting workflows feed financial statements", () => {
  it("posts a manual general ledger journal and shows it in financial statements", async () => {
    const amount = 50;
    const memo = `User workflow GL ${Date.now()}`;
    const before = await getStatements();

    await postData("/api/v1/finance/journals", {
      journalDate: today,
      memo,
      lines: [
        { glAccountId: accountsByCode.get("1000").id, amount, drcr: "D" },
        { glAccountId: accountsByCode.get("4000").id, amount, drcr: "C" },
      ],
    });

    const after = await getStatements();
    await expectJournalMemo(memo);
    expectMoneyDelta(after.position.currentAssets.cash, before.position.currentAssets.cash, amount);
    expectMoneyDelta(after.overview.activities.donations, before.overview.activities.donations, amount);
    await expectStatementBalance();
  });

  it("posts accounts payable bills and payments to GL and financial statements", async () => {
    const amount = 123.45;
    const before = await getStatements();

    const bill = await postData("/api/v1/ap/bills", {
      billDate: today,
      dueDate: today,
      memo: "User workflow AP bill",
      lines: [
        {
          description: "User-facing AP expense",
          quantity: 1,
          unitPrice: amount,
          expenseGlAccountId: accountsByCode.get("5100")?.id || accountsByCode.get("6000").id,
        },
      ],
    });
    expect(bill.journal_number).toBeTruthy();

    const explicitBillPost = await postData(`/api/v1/ap/bills/${bill.id}/postToGL`, {});
    expect(explicitBillPost.alreadyPosted).toBe(true);
    await expectJournalSource("bills", bill.id);

    const afterBill = await getStatements();
    expectMoneyDelta(afterBill.position.currentLiabilities.accountsPayable, before.position.currentLiabilities.accountsPayable, amount);
    expectMoneyDelta(afterBill.nonprofit.expenses.totalExpenses, before.nonprofit.expenses.totalExpenses, amount);
    await expectStatementBalance();

    const payment = await postData(`/api/v1/ap/bills/${bill.id}/payments`, {
      paidAt: new Date(`${today}T12:00:00.000Z`).toISOString(),
      amount,
      method: "Offline",
    });
    expect(payment.payment_id).toBeTruthy();

    const explicitPaymentPost = await postData(`/api/v1/ap/payments/${payment.payment_id}/postToGL`, {});
    expect(explicitPaymentPost.alreadyPosted).toBe(true);
    await expectJournalSource("bill_payments", payment.payment_id);

    const afterPayment = await getStatements();
    expectMoneyDelta(afterPayment.position.currentLiabilities.accountsPayable, before.position.currentLiabilities.accountsPayable, 0);
    expectMoneyDelta(afterPayment.position.currentAssets.cash, afterBill.position.currentAssets.cash, -amount);
    await expectStatementBalance();
  });

  it("posts accounts receivable invoices, payments, and bank deposits to user financial statements", async () => {
    const amount = 234.56;
    const before = await getStatements();

    const invoice = await postData("/api/v1/ar/invoices", {
      invoiceDate: today,
      dueDate: today,
      memo: "User workflow AR invoice",
      lines: [
        {
          description: "User-facing AR revenue",
          quantity: 1,
          unitPrice: amount,
          revenueGlAccountId: accountsByCode.get("4000").id,
        },
      ],
    });
    expect(invoice.journal_number).toBeTruthy();

    const explicitInvoicePost = await postData(`/api/v1/ar/invoices/${invoice.id}/postToGL`, {});
    expect(explicitInvoicePost.alreadyPosted).toBe(true);
    await expectJournalSource("invoices", invoice.id);

    const afterInvoice = await getStatements();
    expectMoneyDelta(afterInvoice.position.currentAssets.receivables, before.position.currentAssets.receivables, amount);
    expectMoneyDelta(afterInvoice.overview.activities.donations, before.overview.activities.donations, amount);
    await expectStatementBalance();

    const payment = await postData(`/api/v1/ar/invoices/${invoice.id}/payments`, {
      receivedAt: new Date(`${today}T13:00:00.000Z`).toISOString(),
      amount,
      method: "Offline",
    });
    expect(payment.payment_id).toBeTruthy();

    const explicitPaymentPost = await postData(`/api/v1/ar/payments/${payment.payment_id}/postToGL`, {});
    expect(explicitPaymentPost.alreadyPosted).toBe(true);
    await expectJournalSource("invoice_payments", payment.payment_id);

    const afterPayment = await getStatements();
    expectMoneyDelta(afterPayment.position.currentAssets.receivables, before.position.currentAssets.receivables, 0);
    expectMoneyDelta(afterPayment.position.currentAssets.cash, before.position.currentAssets.cash, amount);
    await expectStatementBalance();

    const bankAccounts = await getData("/api/v1/bank/accounts");
    const operating = bankAccounts[0];
    const deposit = await postData("/api/v1/bank/deposits", {
      bankAccountId: operating.gl_account_id,
      depositDate: today,
      paymentIds: [payment.payment_id],
      memo: "User workflow bank deposit",
    });
    expect(deposit.journalNumber).toBeTruthy();
    await expectJournalSource("bank_deposits", deposit.id);

    const afterDeposit = await getStatements();
    expectMoneyDelta(afterDeposit.position.currentAssets.cash, afterPayment.position.currentAssets.cash, 0);
    expectMoneyDelta(afterDeposit.position.totalAssets, afterPayment.position.totalAssets, 0);

    const undeposited = await getData("/api/v1/bank/undeposited");
    expect(undeposited.some((row) => Number(row.id) === Number(payment.payment_id) && row.invoice_no === invoice.invoice_no)).toBe(false);
    await expectStatementBalance();
  });

  it("posts fundraising donations to GL and the Statement of Activities", async () => {
    const amount = 345.67;
    const before = await getStatements();

    const donation = await postData("/api/v1/fundraising/donations", {
      amount,
      donatedAt: today,
      paymentMethod: "Offline",
      isPledge: false,
    });

    const explicitDonationPost = await postData(`/api/v1/donations/${donation.id}/postToGL`, {});
    expect(explicitDonationPost.alreadyPosted).toBe(true);
    await expectJournalSource("donations", donation.id);

    const after = await getStatements();
    expectMoneyDelta(after.position.currentAssets.cash, before.position.currentAssets.cash, amount);
    expectMoneyDelta(after.overview.activities.donations, before.overview.activities.donations, amount);
    expectMoneyDelta(after.nonprofit.revenuesOfSupport.totalPublicSupport, before.nonprofit.revenuesOfSupport.totalPublicSupport, amount);
    await expectStatementBalance();
  });

  it("records pledge donations without using invalid donation statuses", async () => {
    const amount = 456.78;
    const before = await getStatements();

    const pledge = await postData("/api/v1/fundraising/donations", {
      amount,
      donatedAt: today,
      paymentMethod: "Offline",
      isPledge: true,
    });

    expect(pledge.paymentMethod).toBe("Pledge");
    expect(pledge.status).toBe("Posted");
    await expectJournalSource("donations", pledge.id);

    const payment = await postData(`/api/v1/fundraising/donations/${pledge.id}/pledge-payments`, {
      amount,
      receivedAt: today,
      method: "Offline",
    });

    expect(payment.status).toBe("Posted");

    const overpayment = await agent
      .post(`/api/v1/fundraising/donations/${pledge.id}/pledge-payments`)
      .set("x-csrf-token", csrfToken)
      .send({
        amount: 1,
        receivedAt: today,
        method: "Offline",
      });
    expectStatus(overpayment, 400);
    expect(overpayment.body.message).toContain("remaining pledge balance");

    const after = await getStatements();
    expectMoneyDelta(after.position.currentAssets.cash, before.position.currentAssets.cash, amount);
    expectMoneyDelta(after.position.currentAssets.receivables, before.position.currentAssets.receivables, 0);
    expectMoneyDelta(after.overview.activities.donations, before.overview.activities.donations, amount);
    await expectStatementBalance();
  });
});
