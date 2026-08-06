import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "../../db/connection.js";
import { createDonation } from "../../services/fundraisingService.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;
let context;
let seedAccount;
let seedContact;
let seedFund;

beforeAll(() => {
  dbHandle = useTestDatabase({ seed: true });
  const db = getDb();
  seedAccount = db.prepare("SELECT id FROM accounts LIMIT 1").get();
  seedContact = db.prepare("SELECT id FROM contacts WHERE email IS NOT NULL LIMIT 1").get();
  seedFund = db.prepare("SELECT id FROM funds LIMIT 1").get();
  context = { userId: 1 };
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("fundraising service", () => {
  it("processes an online donation with a payment transaction", async () => {
    const donation = await createDonation(
      {
        accountId: seedAccount.id,
        contactId: seedContact.id,
        fundId: seedFund.id,
        amount: 125,
        payment: {
          source: { id: "tok_seed", last4: "4242" },
        },
      },
      context
    );
    expect(donation).toBeTruthy();
    expect(donation.payments).toBeInstanceOf(Array);
    expect(donation.payments.length).toBeGreaterThan(0);
    expect(donation.payments[0].status).toBeTruthy();
  });
});
