import bcrypt from "bcrypt";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "./connection.js";
import { generateToken } from "../utils/token.js";
import { seedIntelligence } from "./seeds/seed_intelligence.js";

const roles = [
  "Admin",
  "Finance",
  "Program",
  "Fundraising",
  "VolunteerMgr",
  "Intelligence",
  "ReadOnly",
];

const permissions = {
  "auth.manage_users": "Create and manage user accounts",
  "auth.view_audit": "View audit logs",
  "crm.read": "View CRM records",
  "crm.write": "Modify CRM records",
  "fundraising.read": "View fundraising data",
  "fundraising.write": "Manage fundraising data",
  "finance.read": "View financial data",
  "finance.write": "Post financial transactions",
  "inventory.read": "View inventory and assets",
  "inventory.write": "Manage inventory and assets",
  "programs.read": "View program and case data",
  "programs.write": "Manage program and case data",
  "projects.read": "View project boards and knowledge pages",
  "projects.write": "Manage projects and knowledge content",
  "events.read": "View events and registrations",
  "events.write": "Manage events and registrations",
  "volunteers.read": "View volunteer data",
  "volunteers.write": "Manage volunteers and shifts",
  "reports.run": "Run and export reports",
  "reports.manage": "Create and manage report definitions",
  "communications.send": "Send outbound communications",
  "admin.manage_settings": "Manage system settings and imports",
};

const rolePermissionMap = new Map([
  ["Admin", Object.keys(permissions)],
  [
    "Finance",
    [
      "auth.view_audit",
      "finance.read",
      "finance.write",
      "fundraising.read",
      "inventory.read",
      "reports.run",
      "reports.manage",
    ],
  ],
  [
    "Program",
    ["crm.read", "programs.read", "programs.write", "reports.run"],
  ],
  [
    "Fundraising",
    [
      "crm.read",
      "crm.write",
      "fundraising.read",
      "fundraising.write",
      "events.read",
      "events.write",
      "communications.send",
      "reports.run",
    ],
  ],
  [
    "VolunteerMgr",
    ["volunteers.read", "volunteers.write", "events.read", "events.write", "reports.run"],
  ],
  [
    "ReadOnly",
    [
      "crm.read",
      "fundraising.read",
      "finance.read",
      "inventory.read",
      "programs.read",
      "projects.read",
      "events.read",
      "volunteers.read",
      "reports.run",
    ],
  ],
]);

const defaultContactTags = [
  "Household",
  "Major Donor",
  "Donor",
  "Operations",
  "Volunteer",
  "Non-profit Rep",
  "Executive Director",
];

const adminUser = {
  email: "admin@example.com",
  password: "Passw0rd!",
  displayName: "Seeded Administrator",
};

function seedRoles(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO roles (name, description) VALUES (@name, @description)"
  );
  for (const roleName of roles) {
    insert.run({ name: roleName, description: `${roleName} role` });
  }
}

function seedPermissions(db) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO permissions (name, description) VALUES (@name, @description)"
  );
  for (const [name, description] of Object.entries(permissions)) {
    insert.run({ name, description });
  }
}

function seedRolePermissions(db) {
  const findRole = db.prepare("SELECT id FROM roles WHERE name = ?");
  const findPermission = db.prepare("SELECT id FROM permissions WHERE name = ?");
  const insert = db.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)"
  );

  for (const [roleName, permissionNames] of rolePermissionMap.entries()) {
    const role = findRole.get(roleName);
    if (!role) continue;

    for (const permName of permissionNames) {
      const perm = findPermission.get(permName);
      if (perm) {
        insert.run(role.id, perm.id);
      }
    }
  }
}

function seedAdmin(db) {
  const passwordHash = bcrypt.hashSync(adminUser.password, 10);
  const userStmt = db.prepare(
    "INSERT OR IGNORE INTO users (email, password_hash, display_name, is_active) VALUES (@email, @password_hash, @display_name, 1)"
  );
  userStmt.run({
    email: adminUser.email,
    password_hash: passwordHash,
    display_name: adminUser.displayName,
  });

  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(adminUser.email);
  const role = db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();

  if (user && role) {
    db.prepare(
      "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)"
    ).run(user.id, role.id);
  }
}

export function seedAccessCore(db = getDb()) {
  seedRoles(db);
  seedPermissions(db);
  seedRolePermissions(db);
}

function tableHasRows(db, table) {
  const row = db.prepare(`SELECT COUNT(1) AS count FROM ${table}`).get();
  return row.count > 0;
}

function seedAccountsAndContacts(db) {
  if (tableHasRows(db, "accounts")) {
    return;
  }

  const accountStmt = db.prepare(
    `INSERT INTO accounts (type, name, display_name, status, phone, email, website, notes)
     VALUES (@type, @name, @display_name, @status, @phone, @email, @website, @notes)`
  );
  const addressStmt = db.prepare(
    `INSERT INTO account_addresses (account_id, type, line1, line2, city, region, postal_code, country, is_primary)
     VALUES (@account_id, @type, @line1, @line2, @city, @region, @postal_code, @country, @is_primary)`
  );
  const contactStmt = db.prepare(
    `INSERT INTO contacts (account_id, first_name, last_name, preferred_name, email, phone, mobile, is_primary, do_not_contact)
     VALUES (@account_id, @first_name, @last_name, @preferred_name, @email, @phone, @mobile, @is_primary, @do_not_contact)`
  );
  const tagStmt = db.prepare(
    "INSERT OR IGNORE INTO contact_tags (name) VALUES (?)"
  );
  const tagLinkStmt = db.prepare(
    "INSERT OR IGNORE INTO contact_tag_links (contact_id, tag_id) VALUES (?, ?)"
  );
  const findTag = db.prepare("SELECT id FROM contact_tags WHERE name = ?");
  const updatePrimaryStmt = db.prepare(
    "UPDATE accounts SET primary_contact_id = @contactId WHERE id = @accountId"
  );
  const clearOtherPrimary = db.prepare(
    "UPDATE contacts SET is_primary = 0 WHERE account_id = @accountId AND id != @contactId"
  );

  const accounts = [
    {
      key: "sunrise",
      type: "Organization",
      name: "Sunrise Shelter",
      displayName: "Sunrise Shelter",
      status: "Active",
      phone: "555-210-0001",
      email: "info@sunriseshelter.org",
      website: "https://sunriseshelter.org",
      notes: "Emergency housing and wraparound support for families.",
      addresses: [
        {
          type: "Primary",
          line1: "120 Beacon Way",
          city: "Portsmith",
          region: "WA",
          postalCode: "98104",
          country: "US",
          isPrimary: true,
        },
      ],
    },
    {
      key: "doe_household",
      type: "Household",
      name: "Doe Household",
      displayName: "Jane & John Doe",
      status: "Prospect",
      phone: "555-320-4432",
      email: "family@doeexample.com",
      website: null,
      notes: "Interested in volunteer opportunities.",
      addresses: [
        {
          type: "Primary",
          line1: "88 Seaview Terrace",
          city: "Portsmith",
          region: "WA",
          postalCode: "98109",
          country: "US",
          isPrimary: true,
        },
      ],
    },
  ];

  const contacts = [
    {
      key: "lena",
      accountKey: "sunrise",
      firstName: "Lena",
      lastName: "Nguyen",
      preferredName: "Lena",
      email: "lena@sunriseshelter.org",
      phone: "555-210-0002",
      mobile: "555-210-4402",
      isPrimary: true,
      tags: ["Executive Director", "Major Donor"],
    },
    {
      key: "marco",
      accountKey: "sunrise",
      firstName: "Marco",
      lastName: "Santos",
      preferredName: "Marco",
      email: "marco@sunriseshelter.org",
      phone: "555-210-0003",
      mobile: null,
      isPrimary: false,
      tags: ["Operations"],
    },
    {
      key: "jane",
      accountKey: "doe_household",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.doe@example.com",
      phone: null,
      mobile: "555-320-4432",
      isPrimary: true,
      tags: ["Household"],
    },
    {
      key: "john",
      accountKey: "doe_household",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      phone: null,
      mobile: "555-320-1122",
      isPrimary: false,
      tags: ["Household", "Volunteer"],
    },
  ];

  const accountIds = new Map();
  for (const tag of defaultContactTags) {
    tagStmt.run(tag);
  }

  for (const account of accounts) {
    const result = accountStmt.run({
      type: account.type,
      name: account.name,
      display_name: account.displayName,
      status: account.status,
      phone: account.phone,
      email: account.email,
      website: account.website,
      notes: account.notes,
    });
    const accountId = result.lastInsertRowid;
    accountIds.set(account.key, accountId);

    for (const address of account.addresses ?? []) {
      addressStmt.run({
        account_id: accountId,
        type: address.type ?? "Primary",
        line1: address.line1,
        line2: address.line2 ?? null,
        city: address.city,
        region: address.region ?? null,
        postal_code: address.postalCode ?? null,
        country: address.country ?? "US",
        is_primary: address.isPrimary ? 1 : 0,
      });
    }
  }

  const contactIds = new Map();
  for (const contact of contacts) {
    const accountId = contact.accountKey ? accountIds.get(contact.accountKey) : null;
    const result = contactStmt.run({
      account_id: accountId ?? null,
      first_name: contact.firstName,
      last_name: contact.lastName,
      preferred_name: contact.preferredName ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
      mobile: contact.mobile ?? null,
      is_primary: contact.isPrimary ? 1 : 0,
      do_not_contact: 0,
    });
    const contactId = result.lastInsertRowid;
    contactIds.set(contact.key, contactId);

    if (Array.isArray(contact.tags)) {
      for (const tag of contact.tags) {
        tagStmt.run(tag);
        const tagRow = findTag.get(tag);
        if (tagRow) {
          tagLinkStmt.run(contactId, tagRow.id);
        }
      }
    }

    if (contact.isPrimary && accountId) {
      clearOtherPrimary.run({ accountId, contactId });
      updatePrimaryStmt.run({ accountId, contactId });
    }
  }

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminUser.email);
  const adminId = admin?.id ?? null;
  const activityStmt = db.prepare(
    `INSERT INTO activities (account_id, contact_id, subject, notes, activity_type, due_at, completed_at, created_by)
     VALUES (@account_id, @contact_id, @subject, @notes, @activity_type, @due_at, @completed_at, @created_by)`
  );

  activityStmt.run({
    account_id: accountIds.get("sunrise"),
    contact_id: contactIds.get("lena"),
    subject: "Strategy session scheduled",
    notes: "Confirm agenda for winter campaign planning.",
    activity_type: "Meeting",
    due_at: "2025-10-12T17:00:00.000Z",
    completed_at: null,
    created_by: adminId,
  });

  activityStmt.run({
    account_id: accountIds.get("doe_household"),
    contact_id: contactIds.get("jane"),
    subject: "Send volunteer onboarding packet",
    notes: "Jane and John requested volunteer info over the weekend.",
    activity_type: "Task",
    due_at: "2025-10-05T18:00:00.000Z",
    completed_at: null,
    created_by: adminId,
  });
}

function seedFunds(db) {
  const funds = [
    {
      name: "General Operating",
      code: "GEN",
      description: "Unrestricted support for ongoing programs and operations.",
      restriction: "Unrestricted",
    },
    {
      name: "Youth Empowerment",
      code: "YTH",
      description: "Supports youth mentorship and workforce readiness.",
      restriction: "TempRestricted",
    },
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO funds (name, code, description, restriction, is_active)
     VALUES (@name, @code, @description, @restriction, 1)`
  );

  for (const fund of funds) {
    insert.run(fund);
  }
}

function seedDesignations(db) {
  const designations = [
    {
      name: "Operations",
      code: "OPS",
      description: "General operating designation",
    },
    {
      name: "Capital Improvements",
      code: "CAP",
      description: "Facility improvements and expansions",
    },
  ];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO designations (name, code, description)
     VALUES (@name, @code, @description)`
  );
  for (const designation of designations) {
    insert.run(designation);
  }
}

function seedCampaignsAndAppeals(db) {
  if (tableHasRows(db, "campaigns")) {
    return;
  }
  const campaignStmt = db.prepare(
    `INSERT INTO campaigns (name, code, goal_amount, start_date, end_date, status, description)
     VALUES (@name, @code, @goal_amount, @start_date, @end_date, @status, @description)`
  );
  const appealStmt = db.prepare(
    `INSERT INTO appeals (campaign_id, name, code, goal_amount, start_date, end_date)
     VALUES (@campaign_id, @name, @code, @goal_amount, @start_date, @end_date)`
  );

  const campaigns = [
    {
      key: "winter",
      name: "Winter Warmth 2025",
      code: "WIN25",
      goal_amount: 150000,
      start_date: "2025-10-01",
      end_date: "2026-02-28",
      status: "Active",
      description: "Cold weather relief drive providing shelter and warm supplies for families.",
    },
    {
      key: "tech",
      name: "Tech Access Initiative",
      code: "TECH",
      goal_amount: 60000,
      start_date: "2025-07-01",
      end_date: "2025-12-31",
      status: "Completed",
      description: "Campaign to expand digital access and provide devices for students.",
    },
  ];

  const appeals = [
    {
      campaignKey: "winter",
      name: "Giving Tuesday Blast",
      code: "GT25",
      goal_amount: 50000,
      start_date: "2025-11-20",
      end_date: "2025-12-05",
    },
    {
      campaignKey: "winter",
      name: "Corporate Partner Match",
      code: "CORP25",
      goal_amount: 75000,
      start_date: "2025-12-01",
      end_date: "2026-02-15",
    },
    {
      campaignKey: "tech",
      name: "Foundations Outreach",
      code: "FOUND",
      goal_amount: 25000,
      start_date: "2025-08-01",
      end_date: "2025-10-01",
    },
  ];

  const campaignIds = new Map();
  for (const campaign of campaigns) {
    const result = campaignStmt.run(campaign);
    campaignIds.set(campaign.key, result.lastInsertRowid);
  }

  for (const appeal of appeals) {
    const campaignId = campaignIds.get(appeal.campaignKey);
    appealStmt.run({
      campaign_id: campaignId,
      name: appeal.name,
      code: appeal.code,
      goal_amount: appeal.goal_amount,
      start_date: appeal.start_date,
      end_date: appeal.end_date,
    });
  }
}

function idBy(db, sql, param) {
  const row = db.prepare(sql).get(param);
  return row ? row.id : null;
}

function seedDonations(db) {
  if (tableHasRows(db, "donations")) {
    return;
  }

  const sunriseId = idBy(db, "SELECT id FROM accounts WHERE name = ?", "Sunrise Shelter");
  const doeId = idBy(db, "SELECT id FROM accounts WHERE name = ?", "Doe Household");
  const lenaId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "lena@sunriseshelter.org");
  const janeId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "jane.doe@example.com");
  const johnId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "john.doe@example.com");
  const generalFundId = idBy(db, "SELECT id FROM funds WHERE code = ?", "GEN");
  const youthFundId = idBy(db, "SELECT id FROM funds WHERE code = ?", "YTH");
  const winterCampaignId = idBy(db, "SELECT id FROM campaigns WHERE code = ?", "WIN25");
  const givingTuesdayAppealId = idBy(db, "SELECT id FROM appeals WHERE code = ?", "GT25");
  const corpAppealId = idBy(db, "SELECT id FROM appeals WHERE code = ?", "CORP25");
  const opsDesignationId = idBy(db, "SELECT id FROM designations WHERE code = ?", "OPS");

  const donationStmt = db.prepare(
    `INSERT INTO donations (account_id, contact_id, fund_id, campaign_id, appeal_id, designation_id, amount, currency_code, fx_rate, donated_at, payment_method, is_recurring, status)
     VALUES (@account_id, @contact_id, @fund_id, @campaign_id, @appeal_id, @designation_id, @amount, @currency_code, @fx_rate, @donated_at, @payment_method, @is_recurring, @status)`
  );
  const softCreditStmt = db.prepare(
    `INSERT INTO donation_soft_credits (donation_id, contact_id, amount)
     VALUES (@donation_id, @contact_id, @amount)`
  );
  const paymentTxnStmt = db.prepare(
    `INSERT INTO payment_transactions (donation_id, provider, provider_reference, status, amount, currency_code, raw_response)
     VALUES (@donation_id, @provider, @provider_reference, @status, @amount, @currency_code, @raw_response)`
  );
  const receiptStmt = db.prepare(
    `INSERT INTO donation_receipts (receipt_no, donation_id, contact_id, issued_at, delivered_at, delivery_method, template_name, metadata_json)
     VALUES (@receipt_no, @donation_id, @contact_id, @issued_at, @delivered_at, @delivery_method, @template_name, @metadata_json)`
  );

  const donations = [
    {
      key: "sunrise_match",
      account_id: sunriseId,
      contact_id: lenaId,
      fund_id: generalFundId,
      campaign_id: winterCampaignId,
      appeal_id: corpAppealId,
      designation_id: opsDesignationId,
      amount: 25000,
      donated_at: "2025-09-12T20:15:00.000Z",
      payment_method: "ACH",
      is_recurring: 0,
      status: "Posted",
      softCredits: [],
    },
    {
      key: "doe_monthly",
      account_id: doeId,
      contact_id: janeId,
      fund_id: youthFundId,
      campaign_id: winterCampaignId,
      appeal_id: givingTuesdayAppealId,
      designation_id: opsDesignationId,
      amount: 150,
      donated_at: "2025-09-25T16:00:00.000Z",
      payment_method: "CreditCard",
      is_recurring: 1,
      status: "Posted",
      softCredits: [
        { contactId: johnId, amount: 150 },
      ],
    },
    {
      key: "sunrise_gala_cash",
      account_id: sunriseId,
      contact_id: lenaId,
      fund_id: generalFundId,
      campaign_id: winterCampaignId,
      appeal_id: corpAppealId,
      designation_id: opsDesignationId,
      amount: 750,
      donated_at: "2025-09-22T18:30:00.000Z",
      payment_method: "Cash",
      is_recurring: 0,
      status: "Posted",
      softCredits: [],
    },  ];

  const donationIds = new Map();
  for (const donation of donations) {
    const result = donationStmt.run({
      account_id: donation.account_id,
      contact_id: donation.contact_id,
      fund_id: donation.fund_id,
      campaign_id: donation.campaign_id,
      appeal_id: donation.appeal_id,
      designation_id: donation.designation_id,
      amount: donation.amount,
      currency_code: "USD",
      fx_rate: 1,
      donated_at: donation.donated_at,
      payment_method: donation.payment_method,
      is_recurring: donation.is_recurring,
      status: donation.status,
    });
    const donationId = result.lastInsertRowid;
    donationIds.set(donation.key, donationId);
    if (donation.payment_method && donation.payment_method !== "Offline") {
      paymentTxnStmt.run({
        donation_id: donationId,
        provider: "mock-payments",
        provider_reference: `seed-${donation.key}`,
        status: "succeeded",
        amount: donation.amount,
        currency_code: "USD",
        raw_response: JSON.stringify({
          provider: "mock-payments",
          status: "succeeded",
          id: `seed-${donation.key}`,
          amount: donation.amount,
          currency: "USD",
        }),
      });
    }
    for (const credit of donation.softCredits ?? []) {
      softCreditStmt.run({
        donation_id: donationId,
        contact_id: credit.contactId,
        amount: credit.amount,
      });
    }
  }

  const firstDonationId = donationIds.get("sunrise_match");
  if (firstDonationId) {
    const receiptResult = receiptStmt.run({
      receipt_no: "R000001",
      donation_id: firstDonationId,
      contact_id: lenaId,
      issued_at: "2025-09-13T10:00:00.000Z",
      delivered_at: "2025-09-13T10:05:00.000Z",
      delivery_method: "Email",
      template_name: "Standard Receipt",
      metadata_json: JSON.stringify({ pdfPath: "/receipts/R000001.pdf" }),
    });
    const receiptId = receiptResult.lastInsertRowid;
    db.prepare("UPDATE donations SET receipt_id = ? WHERE id = ?").run(receiptId, firstDonationId);
  }
}

function seedPledges(db) {
  if (tableHasRows(db, "pledges")) {
    return;
  }
  const doeId = idBy(db, "SELECT id FROM accounts WHERE name = ?", "Doe Household");
  const janeId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "jane.doe@example.com");
  const youthFundId = idBy(db, "SELECT id FROM funds WHERE code = ?", "YTH");
  const pledgeStmt = db.prepare(
    `INSERT INTO pledges (account_id, contact_id, fund_id, campaign_id, total_amount, frequency, start_date, end_date, reminder_day, status)
     VALUES (@account_id, @contact_id, @fund_id, @campaign_id, @total_amount, @frequency, @start_date, @end_date, @reminder_day, @status)`
  );
  const installmentStmt = db.prepare(
    `INSERT INTO pledge_installments (pledge_id, due_date, amount_due, amount_paid, status)
     VALUES (@pledge_id, @due_date, @amount_due, @amount_paid, @status)`
  );

  const pledgeResult = pledgeStmt.run({
    account_id: doeId,
    contact_id: janeId,
    fund_id: youthFundId,
    campaign_id: null,
    total_amount: 1800,
    frequency: "Monthly",
    start_date: "2025-09-01",
    end_date: "2026-08-31",
    reminder_day: 1,
    status: "Active",
  });
  const pledgeId = pledgeResult.lastInsertRowid;

  const months = ["2025-09", "2025-10", "2025-11", "2025-12"];
  for (const month of months) {
    installmentStmt.run({
      pledge_id: pledgeId,
      due_date: `${month}-15`,
      amount_due: 150,
      amount_paid: month === "2025-09" ? 150 : 0,
      status: month === "2025-09" ? "Paid" : "Pending",
    });
  }
}



function seedGlAccounts(db) {
  if (tableHasRows(db, "gl_accounts")) {
    return;
  }
  const insert = db.prepare(
    `INSERT INTO gl_accounts (code, name, type, parent_id, description, is_active)
     VALUES (@code, @name, @type, @parent_id, @description, 1)`
  );
  const accounts = [
    { code: "1000", name: "Cash & Cash Equivalents", type: "Asset" },
    { code: "1100", name: "Accounts Receivable", type: "Asset" },
    { code: "2000", name: "Accounts Payable", type: "Liability" },
    { code: "3000", name: "Net Assets", type: "Equity" },
    { code: "4100", name: "Contributions Income", type: "Revenue" },
    { code: "5100", name: "Program Expenses", type: "Expense" },
  ];
  for (const account of accounts) {
    insert.run({
      code: account.code,
      name: account.name,
      type: account.type,
      parent_id: null,
      description: account.description ?? null,
    });
  }
}

function seedOpeningJournal(db) {
  if (tableHasRows(db, "journals")) {
    return;
  }
  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminUser.email);
  const insertJournal = db.prepare(
    `INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at)
     VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP)`
  );
  const insertLine = db.prepare(
    `INSERT INTO journal_lines (journal_id, gl_account_id, fund_id, amount, drcr, memo)
     VALUES (@journal_id, @gl_account_id, @fund_id, @amount, @drcr, @memo)`
  );
  const cashId = idBy(db, "SELECT id FROM gl_accounts WHERE code = ?", "1000");
  const revenueId = idBy(db, "SELECT id FROM gl_accounts WHERE code = ?", "4100");
  const fundId = idBy(db, "SELECT id FROM funds WHERE code = ?", "GEN");
  const journalResult = insertJournal.run({
    entry_no: "J000001",
    journal_date: "2025-09-01",
    memo: "Opening balance seed",
    created_by: admin?.id ?? null,
  });
  const journalId = journalResult.lastInsertRowid;
  insertLine.run({
    journal_id: journalId,
    gl_account_id: cashId,
    fund_id: fundId,
    amount: 50000,
    drcr: "D",
    memo: "Opening cash balance",
  });
  insertLine.run({
    journal_id: journalId,
    gl_account_id: revenueId,
    fund_id: fundId,
    amount: 50000,
    drcr: "C",
    memo: "Opening net assets",
  });
}

function seedInventoryCategories(db) {
  const categories = [
    { name: "Program Supplies", description: "Consumable supplies for programs" },
    { name: "Technology", description: "Equipment and IT assets" }
  ];
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO item_categories (name, description)
     VALUES (@name, @description)`
  );
  for (const category of categories) {
    stmt.run(category);
  }
}

function seedInventoryItems(db) {
  if (tableHasRows(db, "inventory_items")) {
    return;
  }
  const categoryMap = new Map(
    db
      .prepare("SELECT id, name FROM item_categories")
      .all()
      .map((row) => [row.name, row.id])
  );
  const insertItem = db.prepare(
    `INSERT INTO inventory_items (sku, name, type, category_id, uom, cost_method, standard_cost, is_active, notes)
     VALUES (@sku, @name, @type, @category_id, @uom, @cost_method, @standard_cost, 1, @notes)`
  );
  const insertStock = db.prepare(
    `INSERT INTO inventory_stock (item_id, location, bin, qty_on_hand, qty_allocated, qty_on_order, min_qty, max_qty)
     VALUES (@item_id, @location, @bin, @qty_on_hand, 0, 0, @min_qty, @max_qty)`
  );
  const items = [
    {
      sku: "SUP-001",
      name: "Hygiene Kit",
      type: "Consumable",
      category: "Program Supplies",
      uom: "kit",
      cost: 12.5,
      notes: "Includes soap, toothbrush, and essentials",
      stock: [
        { location: "Main Warehouse", bin: "A1", qty: 120, min: 40, max: 200 }
      ]
    },
    {
      sku: "IT-001",
      name: "Refurbished Laptop",
      type: "Equipment",
      category: "Technology",
      uom: "each",
      cost: 450,
      notes: "Used for workforce development classes",
      stock: [
        { location: "Tech Closet", bin: "L2", qty: 8, min: 4, max: 15 }
      ]
    },
    {
      sku: "SUP-010",
      name: "Winter Coat",
      type: "Consumable",
      category: "Program Supplies",
      uom: "each",
      cost: 35,
      notes: "Adult sizes, mixed colors",
      stock: [
        { location: "Main Warehouse", bin: "B4", qty: 45, min: 30, max: 120 }
      ]
    }
  ];

  for (const item of items) {
    const categoryId = categoryMap.get(item.category) ?? null;
    const result = insertItem.run({
      sku: item.sku,
      name: item.name,
      type: item.type,
      category_id: categoryId,
      uom: item.uom,
      cost_method: item.type === "Consumable" ? "FIFO" : "Standard",
      standard_cost: item.cost,
      notes: item.notes ?? null,
    });
    const itemId = result.lastInsertRowid;
    for (const stock of item.stock ?? []) {
      insertStock.run({
        item_id: itemId,
        location: stock.location,
        bin: stock.bin ?? null,
        qty_on_hand: stock.qty ?? 0,
        min_qty: stock.min ?? 0,
        max_qty: stock.max ?? null,
      });
    }
  }
}

function seedAssets(db) {
  if (tableHasRows(db, "asset_registry")) {
    return;
  }
  const laptopId = idBy(db, "SELECT id FROM inventory_items WHERE sku = ?", "IT-001");
  const custodianId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "marco@sunriseshelter.org");
  const assetStmt = db.prepare(
    `INSERT INTO asset_registry (item_id, asset_tag, serial_number, location, custodian_contact_id, status, acquired_at, notes)
     VALUES (@item_id, @asset_tag, @serial_number, @location, @custodian_contact_id, @status, @acquired_at, @notes)`
  );
  const maintenanceStmt = db.prepare(
    `INSERT INTO asset_maintenance_logs (asset_id, performed_at, performed_by, notes, cost)
     VALUES (@asset_id, @performed_at, @performed_by, @notes, @cost)`
  );
  const assetResult = assetStmt.run({
    item_id: laptopId,
    asset_tag: "IT-001-2025-01",
    serial_number: "LTP-2025-0001",
    location: "Tech Closet",
    custodian_contact_id: custodianId,
    status: "InService",
    acquired_at: "2025-08-01",
    notes: "Assigned to digital literacy lab",
  });
  const assetId = assetResult.lastInsertRowid;
  maintenanceStmt.run({
    asset_id: assetId,
    performed_at: "2025-09-15",
    performed_by: "IT Volunteer",
    notes: "Reimaged OS and replaced battery",
    cost: 85,
  });
}


function seedVolunteers(db) {
  if (tableHasRows(db, "volunteers")) {
    return;
  }
  const johnId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "john.doe@example.com");
  const lenaId = idBy(db, "SELECT id FROM contacts WHERE email = ?", "lena@sunriseshelter.org");
  const insertVolunteer = db.prepare(
    `INSERT INTO volunteers (contact_id, skills, interests, background_check_status, available_json, notes, is_active, ical_token)
     VALUES (@contact_id, @skills, @interests, @background_check_status, @available_json, @notes, 1, @ical_token)`
  );
  const volunteers = [
    {
      contact_id: johnId,
      skills: "Logistics, Driving",
      interests: "Food Pantry, Outreach",
      background_check_status: "Approved",
      available_json: JSON.stringify({ weekdays: ["Evenings"], weekends: ["Morning"] }),
      notes: "Certified to drive agency van."
    },
    {
      contact_id: lenaId,
      skills: "Strategy, Training",
      interests: "Fundraising, Events",
      background_check_status: "Approved",
      available_json: JSON.stringify({ weekdays: ["Afternoon"] }),
      notes: "Helps coach volunteer cohort."
    }
  ];
  for (const volunteer of volunteers) {
    insertVolunteer.run({ ...volunteer, ical_token: generateToken() });
  }
}

function seedVolunteerEngagement(db) {
  if (tableHasRows(db, "volunteer_hours")) {
    return;
  }
  const volunteerIds = db.prepare("SELECT id FROM volunteers ORDER BY id").all();
  if (!volunteerIds.length) {
    return;
  }
  const [john, lena] = volunteerIds.map((row) => row.id);
  const insertShift = db.prepare(
    `INSERT INTO volunteer_shifts (volunteer_id, title, role, location, start_at, end_at, status, hours_expected, notes)
     VALUES (@volunteer_id, @title, @role, @location, @start_at, @end_at, @status, @hours_expected, @notes)`
  );
  const insertHours = db.prepare(
    `INSERT INTO volunteer_hours (volunteer_id, shift_id, service_date, hours, notes, approved_by, approved_at)
     VALUES (@volunteer_id, @shift_id, @service_date, @hours, @notes, @approved_by, @approved_at)`
  );
  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const planningShift = insertShift.run({
    volunteer_id: lena,
    title: "Winter Drive Planning",
    role: "Coordinator",
    location: "HQ",
    start_at: "2025-09-18T18:00:00.000Z",
    end_at: "2025-09-18T20:00:00.000Z",
    status: "Completed",
    hours_expected: 2,
    notes: "Agenda and task assignments"
  });
  insertHours.run({
    volunteer_id: lena,
    shift_id: planningShift.lastInsertRowid,
    service_date: "2025-09-18",
    hours: 2,
    notes: "Facilitated planning session",
    approved_by: admin?.id ?? null,
    approved_at: "2025-09-19T12:00:00.000Z"
  });
  const distributionShift = insertShift.run({
    volunteer_id: john,
    title: "Mobile Pantry Route",
    role: "Driver",
    location: "City Route A",
    start_at: "2025-09-20T14:00:00.000Z",
    end_at: "2025-09-20T17:00:00.000Z",
    status: "Completed",
    hours_expected: 3,
    notes: "Delivered 45 kits"
  });
  insertHours.run({
    volunteer_id: john,
    shift_id: distributionShift.lastInsertRowid,
    service_date: "2025-09-20",
    hours: 3,
    notes: "Route completed without issues",
    approved_by: admin?.id ?? null,
    approved_at: "2025-09-21T09:00:00.000Z"
  });
  const weatherContingencyShift = insertShift.run({
    volunteer_id: john,
    title: "Cold Weather Prep",
    role: "Driver",
    location: "City Route A",
    start_at: "2025-09-22T14:00:00.000Z",
    end_at: "2025-09-22T16:00:00.000Z",
    status: "Cancelled",
    hours_expected: 2,
    notes: "Standby shift cancelled due to weather advisory"
  });
  insertHours.run({
    volunteer_id: john,
    shift_id: weatherContingencyShift.lastInsertRowid,
    service_date: "2025-09-22",
    hours: 0,
    notes: "No hours logged - shift cancelled",
    approved_by: admin?.id ?? null,
    approved_at: null
  });
}



function seedProgramClients(db) {
  if (tableHasRows(db, "clients")) {
    return;
  }
  const insertClient = db.prepare(
    `INSERT INTO clients (code, first_name, last_name, date_of_birth, pii_json, restricted, consent_date, notes)
     VALUES (@code, @first_name, @last_name, @date_of_birth, @pii_json, @restricted, @consent_date, @notes)`
  );
  const clients = [
    {
      code: "CL-1001",
      first_name: "Maria",
      last_name: "Lopez",
      date_of_birth: "1985-04-12",
      pii_json: JSON.stringify({ address: "102 Oak Ave", phone: "555-555-1122" }),
      restricted: 1,
      consent_date: "2025-08-10",
      notes: "Domestic violence survivor receiving counseling."
    },
    {
      code: "CL-1002",
      first_name: "Darius",
      last_name: "Green",
      date_of_birth: "1999-11-03",
      pii_json: JSON.stringify({ address: "88 Harbor St", phone: "555-210-9900" }),
      restricted: 0,
      consent_date: "2025-07-22",
      notes: "Enrolled in workforce readiness track."
    }
  ];
  const clientIds = [];
  for (const client of clients) {
    const result = insertClient.run(client);
    clientIds.push(result.lastInsertRowid);
  }
  const insertCase = db.prepare(
    `INSERT INTO program_cases (client_id, program_name, status, opened_at, closed_at, outcome_json, restricted)
     VALUES (@client_id, @program_name, @status, @opened_at, @closed_at, @outcome_json, @restricted)`
  );
  const cases = [
    {
      client_id: clientIds[0],
      program_name: "Family Safety Advocacy",
      status: "Open",
      opened_at: "2025-08-15",
      closed_at: null,
      outcome_json: null,
      restricted: 1
    },
    {
      client_id: clientIds[1],
      program_name: "Career Coaching",
      status: "Open",
      opened_at: "2025-07-25",
      closed_at: null,
      outcome_json: JSON.stringify({ goals: ["Resume rewrite", "Interview skills"] }),
      restricted: 0
    }
  ];
  const caseIds = [];
  for (const programCase of cases) {
    const result = insertCase.run(programCase);
    caseIds.push(result.lastInsertRowid);
  }
  const insertService = db.prepare(
    `INSERT INTO case_services (case_id, service_date, service_type, duration_minutes, notes, staff_user_id)
     VALUES (@case_id, @service_date, @service_type, @duration_minutes, @notes, @staff_user_id)`
  );
  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  insertService.run({
    case_id: caseIds[0],
    service_date: "2025-09-05",
    service_type: "Counseling Session",
    duration_minutes: 60,
    notes: "Initial trauma-informed counseling session.",
    staff_user_id: admin?.id ?? null
  });
  insertService.run({
    case_id: caseIds[1],
    service_date: "2025-09-12",
    service_type: "Resume Workshop",
    duration_minutes: 90,
    notes: "Reviewed resume draft and set interview prep homework.",
    staff_user_id: admin?.id ?? null
  });
}


function seedProjects(db) {
  if (tableHasRows(db, "projects")) {
    return;
  }
  const adminRow = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const fallbackUser = db.prepare("SELECT id FROM users LIMIT 1").get();
  const adminId = adminRow?.id ?? fallbackUser?.id ?? null;

  const insertProject = db.prepare(
    `INSERT INTO projects (key, name, type, status, description, lead_id, default_view, settings_json)
     VALUES (@key, @name, @type, @status, @description, @lead_id, @default_view, @settings_json)`
  );
  const insertMember = db.prepare(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES (@project_id, @user_id, @role)`
  );
  const insertColumn = db.prepare(
    `INSERT INTO project_columns (project_id, name, position, wip_limit, category, is_default)
     VALUES (@project_id, @name, @position, @wip_limit, @category, @is_default)`
  );
  const insertSprint = db.prepare(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status, velocity_target)
     VALUES (@project_id, @name, @goal, @start_date, @end_date, @status, @velocity_target)`
  );
  const insertLabel = db.prepare(
    `INSERT INTO issue_labels (project_id, name, color)
     VALUES (@project_id, @name, @color)`
  );
  const insertIssue = db.prepare(
    `INSERT INTO issues (project_id, key, parent_issue_id, type, title, description, status, priority, assignee_id, reporter_id, estimate_hours, story_points, sprint_id, column_id, labels_json, sort_order)
     VALUES (@project_id, @key, @parent_issue_id, @type, @title, @description, @status, @priority, @assignee_id, @reporter_id, @estimate_hours, @story_points, @sprint_id, @column_id, @labels_json, @sort_order)`
  );
  const insertComment = db.prepare(
    `INSERT INTO issue_comments (issue_id, author_id, body)
     VALUES (@issue_id, @author_id, @body)`
  );
  const insertHistory = db.prepare(
    `INSERT INTO issue_history (issue_id, field, old_value, new_value, changed_by)
     VALUES (@issue_id, @field, @old_value, @new_value, @changed_by)`
  );

  const projects = [
    {
      key: "OPS",
      name: "Operations Kanban",
      type: "Kanban",
      status: "Active",
      description: "Facility upkeep and supply logistics for the shelter.",
      defaultView: "board",
      settings: { cardFields: ["assignee", "priority", "labels"], swimlanes: "assignee" },
      columns: [
        { name: "Backlog", position: 1, category: "backlog", wipLimit: null, isDefault: 1 },
        { name: "In Progress", position: 2, category: "active", wipLimit: 3, isDefault: 0 },
        { name: "Review", position: 3, category: "active", wipLimit: 2, isDefault: 0 },
        { name: "Done", position: 4, category: "done", wipLimit: null, isDefault: 0 },
      ],
      labels: [
        { name: "Facilities", color: "#0b6fa4" },
        { name: "Supplies", color: "#d97706" },
        { name: "Volunteer", color: "#047857" },
      ],
      members: [{ userId: adminId, role: "Lead" }],
      sprints: [],
      issues: [
        {
          number: 1,
          title: "Refresh shelter welcome packet",
          description: "Update print and digital welcome materials with 2025 service directory and FAQs.",
          status: "Todo",
          priority: "Medium",
          column: "Backlog",
          labels: ["Supplies"],
          sortOrder: 1,
        },
        {
          number: 2,
          title: "Repair laundry machines",
          description: "Coordinate technician visit and downtime schedule for the two commercial washers.",
          status: "In Progress",
          priority: "High",
          column: "In Progress",
          estimateHours: 6,
          labels: ["Facilities"],
          sortOrder: 2,
          comments: [
            {
              body: "Tech booked for Friday morning. Please block laundry room 9-11am.",
            },
          ],
          history: [
            {
              field: "status",
              oldValue: "Todo",
              newValue: "In Progress",
            },
          ],
        },
        {
          number: 3,
          title: "Volunteer onboarding checklist",
          description: "Finalize the 30-minute onboarding experience and share with volunteer coordinators.",
          status: "Review",
          priority: "Medium",
          column: "Review",
          labels: ["Volunteer"],
          sortOrder: 3,
        },
        {
          number: 4,
          title: "Stock winter clothing bins",
          description: "Order cold-weather gear and restock lobby bins before temperatures drop.",
          status: "Done",
          priority: "High",
          column: "Done",
          labels: ["Supplies"],
          sortOrder: 4,
        },
      ],
    },
    {
      key: "TECH",
      name: "Product Delivery",
      type: "Scrum",
      status: "Active",
      description: "Member-facing ERP enhancements and reporting roadmap.",
      defaultView: "board",
      settings: { estimation: "story_points", sprintLengthDays: 14 },
      columns: [
        { name: "Product Backlog", position: 1, category: "backlog", wipLimit: null, isDefault: 1 },
        { name: "Ready", position: 2, category: "active", wipLimit: 5, isDefault: 0 },
        { name: "In Development", position: 3, category: "active", wipLimit: 4, isDefault: 0 },
        { name: "QA", position: 4, category: "active", wipLimit: 3, isDefault: 0 },
        { name: "Done", position: 5, category: "done", wipLimit: null, isDefault: 0 },
      ],
      labels: [
        { name: "Analytics", color: "#2563eb" },
        { name: "UX", color: "#9333ea" },
        { name: "API", color: "#16a34a" },
      ],
      members: [{ userId: adminId, role: "Lead" }],
      sprints: [
        {
          name: "Sprint 1 - Intake Enhancements",
          goal: "Streamline program intake workflow",
          start_date: "2025-08-25",
          end_date: "2025-09-07",
          status: "Completed",
          velocity_target: 26,
        },
        {
          name: "Sprint 2 - Reporting Push",
          goal: "Deliver KPI dashboards for fundraising and programs",
          start_date: "2025-09-08",
          end_date: "2025-09-21",
          status: "Active",
          velocity_target: 30,
        },
      ],
      issues: [
        {
          number: 1,
          type: "Epic",
          title: "Modernize case intake flow",
          description: "Revamp intake UX with autosave, required fields, and eligibility prompts.",
          status: "Todo",
          priority: "High",
          column: "Product Backlog",
          labels: ["UX"],
          sortOrder: 1,
        },
        {
          number: 2,
          type: "Story",
          parentKey: "TECH-1",
          title: "Autosave draft intakes",
          description: "Persist intake forms every 30 seconds to reduce data loss.",
          status: "Ready",
          priority: "High",
          storyPoints: 5,
          column: "Ready",
          sprint: "Sprint 2 - Reporting Push",
          labels: ["API", "UX"],
          sortOrder: 2,
          comments: [
            {
              body: "Need confirmation on acceptable autosave frequency for compliance.",
            },
          ],
        },
        {
          number: 3,
          type: "Story",
          parentKey: "TECH-1",
          title: "Eligibility warning banners",
          description: "Highlight missing consent forms and expired documentation on intake.",
          status: "In Development",
          priority: "Medium",
          storyPoints: 3,
          column: "In Development",
          sprint: "Sprint 2 - Reporting Push",
          labels: ["UX"],
          sortOrder: 3,
          history: [
            {
              field: "status",
              oldValue: "Ready",
              newValue: "In Development",
            },
          ],
        },
        {
          number: 4,
          type: "Bug",
          title: "Fix double-counted pledge totals",
          description: "Resolve aggregation bug for monthly reporting export.",
          status: "QA",
          priority: "High",
          column: "QA",
          sprint: "Sprint 2 - Reporting Push",
          labels: ["Analytics"],
          sortOrder: 4,
        },
        {
          number: 5,
          type: "Story",
          title: "Add KPI cards to dashboard",
          description: "Surface fundraising, events, and volunteer metrics on landing page.",
          status: "Done",
          priority: "Medium",
          column: "Done",
          sprint: "Sprint 1 - Intake Enhancements",
          storyPoints: 8,
          labels: ["Analytics"],
          sortOrder: 5,
        },
      ],
    },
  ];

  for (const project of projects) {
    const projectResult = insertProject.run({
      key: project.key,
      name: project.name,
      type: project.type,
      status: project.status,
      description: project.description ?? null,
      lead_id: adminId,
      default_view: project.defaultView ?? "board",
      settings_json: project.settings ? JSON.stringify(project.settings) : null,
    });
    const projectId = projectResult.lastInsertRowid;

    const columnIdByName = new Map();
    for (const column of project.columns ?? []) {
      const columnResult = insertColumn.run({
        project_id: projectId,
        name: column.name,
        position: column.position ?? 0,
        wip_limit: column.wipLimit ?? null,
        category: column.category ?? "active",
        is_default: column.isDefault ? 1 : 0,
      });
      columnIdByName.set(column.name, columnResult.lastInsertRowid);
    }

    const sprintIdByName = new Map();
    for (const sprint of project.sprints ?? []) {
      const sprintResult = insertSprint.run({
        project_id: projectId,
        name: sprint.name,
        goal: sprint.goal ?? null,
        start_date: sprint.start_date ?? null,
        end_date: sprint.end_date ?? null,
        status: sprint.status ?? "Planned",
        velocity_target: sprint.velocity_target ?? null,
      });
      sprintIdByName.set(sprint.name, sprintResult.lastInsertRowid);
    }

    for (const label of project.labels ?? []) {
      insertLabel.run({
        project_id: projectId,
        name: label.name,
        color: label.color ?? "#1976d2",
      });
    }

    for (const member of project.members ?? []) {
      if (!member.userId) continue;
      insertMember.run({ project_id: projectId, user_id: member.userId, role: member.role ?? "Member" });
    }

    const issueIdByKey = new Map();
    for (const issue of project.issues ?? []) {
      const key = `${project.key}-${issue.number}`;
      const columnId = issue.column ? columnIdByName.get(issue.column) ?? null : null;
      const sprintId = issue.sprint ? sprintIdByName.get(issue.sprint) ?? null : null;
      const parentId = issue.parentKey ? issueIdByKey.get(issue.parentKey) ?? null : null;
      const issueResult = insertIssue.run({
        project_id: projectId,
        key,
        parent_issue_id: parentId,
        type: issue.type ?? "Task",
        title: issue.title,
        description: issue.description ?? null,
        status: issue.status ?? issue.column ?? "Todo",
        priority: issue.priority ?? "Medium",
        assignee_id: adminId,
        reporter_id: adminId,
        estimate_hours: issue.estimateHours ?? null,
        story_points: issue.storyPoints ?? null,
        sprint_id: sprintId,
        column_id: columnId,
        labels_json: issue.labels?.length ? JSON.stringify(issue.labels) : null,
        sort_order: issue.sortOrder ?? issue.number ?? 0,
      });
      const issueId = issueResult.lastInsertRowid;
      issueIdByKey.set(key, issueId);

      for (const comment of issue.comments ?? []) {
        insertComment.run({
          issue_id: issueId,
          author_id: adminId,
          body: comment.body,
        });
      }

      for (const history of issue.history ?? []) {
        insertHistory.run({
          issue_id: issueId,
          field: history.field,
          old_value: history.oldValue ?? null,
          new_value: history.newValue ?? null,
          changed_by: adminId,
        });
      }
    }
  }
}

function seedKnowledgeBase(db) {
  if (tableHasRows(db, "knowledge_spaces")) {
    return;
  }
  const adminRow = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const fallbackUser = db.prepare("SELECT id FROM users LIMIT 1").get();
  const adminId = adminRow?.id ?? fallbackUser?.id ?? null;

  const insertSpace = db.prepare(
    `INSERT INTO knowledge_spaces (key, name, description, is_private, created_by)
     VALUES (@key, @name, @description, @is_private, @created_by)`
  );
  const insertMember = db.prepare(
    `INSERT INTO knowledge_space_members (space_id, user_id, role)
     VALUES (@space_id, @user_id, @role)`
  );
  const insertPage = db.prepare(
    `INSERT INTO knowledge_pages (space_id, parent_id, title, slug, body_html, body_json, version, is_published, created_by, updated_by)
     VALUES (@space_id, @parent_id, @title, @slug, @body_html, @body_json, @version, @is_published, @created_by, @updated_by)`
  );
  const insertVersion = db.prepare(
    `INSERT INTO knowledge_page_versions (page_id, version, title, body_html, body_json, created_by)
     VALUES (@page_id, @version, @title, @body_html, @body_json, @created_by)`
  );
  const insertAttachment = db.prepare(
    `INSERT INTO knowledge_attachments (page_id, filename, mime_type, size_bytes, storage_path, uploaded_by)
     VALUES (@page_id, @filename, @mime_type, @size_bytes, @storage_path, @uploaded_by)`
  );

  const slugify = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  const defaultJson = (text) =>
    JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

  const spaces = [
    {
      key: "OPS",
      name: "Operations Handbook",
      description: "Reference playbook for shelter operations and facility management.",
      isPrivate: 0,
      members: [],
      pages: [
        {
          title: "Welcome",
          body: "<h2>Welcome to Operations</h2><p>This handbook outlines the procedures that keep our shelter running smoothly.</p>",
          children: [
            {
              title: "Daily Opening Checklist",
              body: "<h3>Opening Checklist</h3><ul><li>Walkthrough safety inspection</li><li>Restock lobby supplies</li><li>Review overnight incident log</li></ul>",
              attachments: [
                {
                  filename: "opening-checklist.pdf",
                  mime_type: "application/pdf",
                  size_bytes: 58214,
                  storage_path: "attachments/opening-checklist.pdf",
                },
              ],
            },
            {
              title: "Emergency Contacts",
              body: "<p>Keep this list visible near every phone. Update quarterly.</p>",
            },
          ],
        },
        {
          title: "Supply Ordering",
          body: "<p>Supplies are ordered every other Thursday. Track requests in the OPS project backlog.</p>",
        },
      ],
    },
    {
      key: "VOL",
      name: "Volunteer Playbook",
      description: "Guides for recruiting, onboarding, and recognizing volunteers.",
      isPrivate: 0,
      members: [],
      pages: [
        {
          title: "Orientation Guide",
          body: "<p>Welcome volunteers with a 30-minute walkthrough, safety briefing, and Q&A.</p>",
          children: [
            {
              title: "Shift Expectations",
              body: "<ul><li>Arrive 10 minutes early</li><li>Log hours within 24 hours</li><li>Report incidents immediately</li></ul>",
            },
          ],
        },
      ],
    },
    {
      key: "LEAD",
      name: "Leadership Notes",
      description: "Quarterly planning notes and board-ready updates.",
      isPrivate: 1,
      members: [{ userId: adminId, role: "Manager" }],
      pages: [
        {
          title: "Q4 Strategic Priorities",
          body: "<p>Focus areas: expanded rapid rehousing, volunteer retention, and data-driven fundraising.</p>",
        },
      ],
    },
  ];

  const createPageTree = (spaceId, page, parentId = null) => {
    const slug = slugify(page.slug ?? page.title);
    const bodyHtml = page.body ?? null;
    const bodyJson = page.bodyJson ? JSON.stringify(page.bodyJson) : defaultJson(page.plainText ?? page.title);
    const version = page.version ?? 1;
    const result = insertPage.run({
      space_id: spaceId,
      parent_id: parentId,
      title: page.title,
      slug,
      body_html: bodyHtml,
      body_json: bodyJson,
      version,
      is_published: page.isPublished === false ? 0 : 1,
      created_by: adminId,
      updated_by: adminId,
    });
    const pageId = result.lastInsertRowid;
    insertVersion.run({
      page_id: pageId,
      version,
      title: page.title,
      body_html: bodyHtml,
      body_json: bodyJson,
      created_by: adminId,
    });

    for (const attachment of page.attachments ?? []) {
      insertAttachment.run({
        page_id: pageId,
        filename: attachment.filename,
        mime_type: attachment.mime_type ?? null,
        size_bytes: attachment.size_bytes ?? null,
        storage_path: attachment.storage_path,
        uploaded_by: adminId,
      });
    }

    for (const child of page.children ?? []) {
      createPageTree(spaceId, child, pageId);
    }
  };

  for (const space of spaces) {
    const spaceResult = insertSpace.run({
      key: space.key,
      name: space.name,
      description: space.description ?? null,
      is_private: space.isPrivate ? 1 : 0,
      created_by: adminId,
    });
    const spaceId = spaceResult.lastInsertRowid;

    for (const member of space.members ?? []) {
      if (!member.userId) continue;
      insertMember.run({ space_id: spaceId, user_id: member.userId, role: member.role ?? "Contributor" });
    }

    for (const page of space.pages ?? []) {
      createPageTree(spaceId, page);
    }
  }
}

export function seedDatabase(options = {}) {
  const { log = true, throwOnError = true } = options;
  const db = getDb();
  db.exec("BEGIN");
  let error = null;
  try {
    seedAccessCore(db);
    seedAdmin(db);
    seedAccountsAndContacts(db);
    seedFunds(db);
    seedDesignations(db);
    seedCampaignsAndAppeals(db);
    seedDonations(db);
    seedPledges(db);

    seedGlAccounts(db);

    seedOpeningJournal(db);

    seedInventoryCategories(db);

    seedInventoryItems(db);

    seedAssets(db);

    seedVolunteers(db);
    seedVolunteerEngagement(db);
    seedProgramClients(db);
    seedEvents(db);
    seedCommunications(db);
    seedReports(db);
    seedDashboardCards(db);
    seedProjects(db);
    seedKnowledgeBase(db);
    seedIntelligence(db);
    db.exec("COMMIT");
    if (log) console.log("Seed data inserted.");
  } catch (err) {
    error = err;
    db.exec("ROLLBACK");
    if (log) {
      console.error("Seeding failed:", err.message);
    }
    if (!throwOnError) {
      process.exitCode = 1;
    }
  } finally {
    closeDb();
  }
  if (error && throwOnError) {
    throw error;
  }
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase();
}

function seedEvents(db) {
  if (tableHasRows(db, "events")) {
    return;
  }
  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const adminId = admin?.id ?? null;
  const insertEvent = db.prepare(
    `INSERT INTO events (code, name, description, start_at, end_at, timezone, venue_name, venue_address, venue_city, venue_state, venue_postal_code, venue_country, capacity, status, created_by, updated_by, ical_token)
     VALUES (@code, @name, @description, @start_at, @end_at, @timezone, @venue_name, @venue_address, @venue_city, @venue_state, @venue_postal_code, @venue_country, @capacity, @status, @created_by, @updated_by, @ical_token)`
  );
  const insertSession = db.prepare(
    `INSERT INTO event_sessions (event_id, title, description, start_at, end_at, location, capacity)
     VALUES (@event_id, @title, @description, @start_at, @end_at, @location, @capacity)`
  );
  const insertTicket = db.prepare(
    `INSERT INTO event_tickets (event_id, name, type, price, currency_code, quantity_total, quantity_sold, sales_start_at, sales_end_at)
     VALUES (@event_id, @name, @type, @price, @currency_code, @quantity_total, @quantity_sold, @sales_start_at, @sales_end_at)`
  );
  const updateTicketSold = db.prepare(
    `UPDATE event_tickets SET quantity_sold = quantity_sold + @quantity WHERE id = @ticket_id`
  );
  const insertDiscount = db.prepare(
    `INSERT INTO event_discounts (event_id, code, description, discount_type, amount_value, percent_value, max_uses)
     VALUES (@event_id, @code, @description, @discount_type, @amount_value, @percent_value, @max_uses)`
  );
  const insertSponsor = db.prepare(
    `INSERT INTO event_sponsors (event_id, contact_id, sponsor_name, sponsor_level, amount, currency_code, notes)
     VALUES (@event_id, @contact_id, @sponsor_name, @sponsor_level, @amount, @currency_code, @notes)`
  );
  const insertRegistration = db.prepare(
    `INSERT INTO event_registrations (event_id, contact_id, ticket_id, session_id, guest_name, guest_email, guest_phone, quantity, status, total_amount, currency_code, discount_code, payment_reference, registered_at, checked_in_at, notes)
     VALUES (@event_id, @contact_id, @ticket_id, @session_id, @guest_name, @guest_email, @guest_phone, @quantity, @status, @total_amount, @currency_code, @discount_code, @payment_reference, @registered_at, @checked_in_at, @notes)`
  );
  const contactIdByEmail = (email) => (email ? idBy(db, "SELECT id FROM contacts WHERE email = ?", email) : null);

  const events = [
    {
      code: "EVT-2025-GALA",
      name: "Harvest Hope Gala",
      description: "Annual gala supporting emergency shelter programs.",
      start_at: "2025-11-16T00:00:00Z",
      end_at: "2025-11-16T04:00:00Z",
      timezone: "America/Los_Angeles",
      venue: {
        name: "Grand Harbor Hotel Ballroom",
        address: "455 Market Street",
        city: "Portsmith",
        state: "WA",
        postal_code: "98104",
        country: "US",
      },
      capacity: 250,
      status: "Published",
      sessions: [
        {
          title: "Welcome Reception",
          description: "Networking with live music and hors d'oeuvres.",
          start_at: "2025-11-16T00:00:00Z",
          end_at: "2025-11-16T01:30:00Z",
          location: "Atrium",
          capacity: 250,
        },
        {
          title: "Dinner & Program",
          description: "Program updates and live auction.",
          start_at: "2025-11-16T01:30:00Z",
          end_at: "2025-11-16T04:00:00Z",
          location: "Grand Ballroom",
          capacity: 250,
        },
      ],
      tickets: [
        {
          name: "Gala Table (10)",
          type: "Sponsor",
          price: 1500,
          currency_code: "USD",
          quantity_total: 20,
          quantity_sold: 3,
          sales_start_at: "2025-08-01T08:00:00Z",
          sales_end_at: "2025-11-15T20:00:00Z",
        },
        {
          name: "Individual Ticket",
          type: "General",
          price: 175,
          currency_code: "USD",
          quantity_total: 200,
          quantity_sold: 4,
          sales_start_at: "2025-08-15T08:00:00Z",
          sales_end_at: "2025-11-15T23:00:00Z",
        },
      ],
      discounts: [
        {
          code: "EARLYBIRD",
          description: "10% off before October 1",
          discount_type: "Percent",
          amount_value: 0,
          percent_value: 10,
          max_uses: 25,
        },
        {
          code: "BOARD",
          description: "Complimentary host table",
          discount_type: "Amount",
          amount_value: 1500,
          percent_value: 0,
          max_uses: 5,
        },
      ],
      sponsors: [
        {
          contactEmail: "lena@sunriseshelter.org",
          sponsor_name: "North Sound Credit Union",
          sponsor_level: "Presenting",
          amount: 25000,
          notes: "Lead sponsor underwriting venue costs.",
        },
        {
          contactEmail: "jane.doe@example.com",
          sponsor_name: "Doe Household",
          sponsor_level: "Host Committee",
          amount: 2500,
          notes: "Host committee pledge.",
        },
      ],
      registrations: [
        {
          contactEmail: "jane.doe@example.com",
          ticketName: "Gala Table (10)",
          quantity: 1,
          status: "Confirmed",
          total_amount: 1500,
          payment_reference: "INV-2301",
          registered_at: "2025-09-05T16:00:00Z",
          notes: "Hosting corporate guests.",
        },
        {
          contactEmail: "john.doe@example.com",
          ticketName: "Individual Ticket",
          quantity: 2,
          status: "Confirmed",
          total_amount: 350,
          registered_at: "2025-09-08T18:15:00Z",
        },
        {
          contactEmail: "lena@sunriseshelter.org",
          ticketName: "Gala Table (10)",
          quantity: 1,
          status: "Confirmed",
          total_amount: 0,
          discount_code: "BOARD",
          registered_at: "2025-09-09T14:40:00Z",
          notes: "Board table comped via sponsorship.",
        },
      ],
    },
    {
      code: "EVT-2025-ORIENT",
      name: "Volunteer Onboarding Q4",
      description: "Orientation and training for new volunteers.",
      start_at: "2025-10-05T17:00:00Z",
      end_at: "2025-10-05T19:00:00Z",
      timezone: "America/Los_Angeles",
      venue: {
        name: "Sunrise Shelter Community Room",
        address: "120 Beacon Way",
        city: "Portsmith",
        state: "WA",
        postal_code: "98104",
        country: "US",
      },
      capacity: 60,
      status: "Published",
      sessions: [
        {
          title: "Facility Tour",
          description: "Walkthrough of shelter spaces and services.",
          start_at: "2025-10-05T17:00:00Z",
          end_at: "2025-10-05T17:45:00Z",
          location: "Lobby",
          capacity: 60,
        },
        {
          title: "Training Workshop",
          description: "Trauma-informed care overview and shift scheduling.",
          start_at: "2025-10-05T17:45:00Z",
          end_at: "2025-10-05T19:00:00Z",
          location: "Community Room",
          capacity: 60,
        },
      ],
      tickets: [
        {
          name: "RSVP",
          type: "General",
          price: 0,
          currency_code: "USD",
          quantity_total: 60,
          quantity_sold: 12,
          sales_start_at: "2025-08-25T15:00:00Z",
          sales_end_at: "2025-10-05T16:30:00Z",
        },
      ],
      discounts: [],
      sponsors: [],
      registrations: [
        {
          contactEmail: "john.doe@example.com",
          ticketName: "RSVP",
          quantity: 1,
          status: "Confirmed",
          total_amount: 0,
          registered_at: "2025-09-12T20:00:00Z",
          notes: "Returning volunteer refresher.",
        },
        {
          guest_name: "Tasha Reed",
          guest_email: "tasha.reed@example.com",
          guest_phone: "555-200-8844",
          ticketName: "RSVP",
          quantity: 1,
          status: "Pending",
          total_amount: 0,
          registered_at: "2025-09-14T16:30:00Z",
        },
      ],
    },
  ];

  for (const event of events) {
    const result = insertEvent.run({
      code: event.code,
      name: event.name,
      description: event.description ?? null,
      start_at: event.start_at,
      end_at: event.end_at ?? null,
      timezone: event.timezone,
      venue_name: event.venue?.name ?? null,
      venue_address: event.venue?.address ?? null,
      venue_city: event.venue?.city ?? null,
      venue_state: event.venue?.state ?? null,
      venue_postal_code: event.venue?.postal_code ?? null,
      venue_country: event.venue?.country ?? "US",
      capacity: event.capacity ?? null,
      status: event.status ?? "Draft",
      created_by: adminId,
      updated_by: adminId,
      ical_token: generateToken(),
    });
    const eventId = result.lastInsertRowid;

    const sessionIds = new Map();
    for (const session of event.sessions ?? []) {
      const sessionResult = insertSession.run({
        event_id: eventId,
        title: session.title,
        description: session.description ?? null,
        start_at: session.start_at,
        end_at: session.end_at ?? null,
        location: session.location ?? null,
        capacity: session.capacity ?? null,
      });
      sessionIds.set(session.title, sessionResult.lastInsertRowid);
    }

    const ticketIds = new Map();
    for (const ticket of event.tickets ?? []) {
      const ticketResult = insertTicket.run({
        event_id: eventId,
        name: ticket.name,
        type: ticket.type ?? "General",
        price: ticket.price ?? 0,
        currency_code: ticket.currency_code ?? "USD",
        quantity_total: ticket.quantity_total ?? 0,
        quantity_sold: ticket.quantity_sold ?? 0,
        sales_start_at: ticket.sales_start_at ?? null,
        sales_end_at: ticket.sales_end_at ?? null,
      });
      ticketIds.set(ticket.name, ticketResult.lastInsertRowid);
    }

    for (const discount of event.discounts ?? []) {
      insertDiscount.run({
        event_id: eventId,
        code: discount.code,
        description: discount.description ?? null,
        discount_type: discount.discount_type,
        amount_value: discount.amount_value ?? 0,
        percent_value: discount.percent_value ?? 0,
        max_uses: discount.max_uses ?? null,
      });
    }

    for (const sponsor of event.sponsors ?? []) {
      const contactId = contactIdByEmail(sponsor.contactEmail);
      insertSponsor.run({
        event_id: eventId,
        contact_id: contactId,
        sponsor_name: sponsor.sponsor_name,
        sponsor_level: sponsor.sponsor_level ?? null,
        amount: sponsor.amount ?? 0,
        currency_code: sponsor.currency_code ?? "USD",
        notes: sponsor.notes ?? null,
      });
    }

    for (const registration of event.registrations ?? []) {
      const contactId = contactIdByEmail(registration.contactEmail);
      const ticketId = registration.ticketName ? ticketIds.get(registration.ticketName) ?? null : null;
      const sessionId = registration.sessionTitle ? sessionIds.get(registration.sessionTitle) ?? null : null;
      insertRegistration.run({
        event_id: eventId,
        contact_id: contactId,
        ticket_id: ticketId,
        session_id: sessionId,
        guest_name: registration.guest_name ?? null,
        guest_email: registration.guest_email ?? null,
        guest_phone: registration.guest_phone ?? null,
        quantity: registration.quantity ?? 1,
        status: registration.status ?? "Pending",
        total_amount: registration.total_amount ?? 0,
        currency_code: registration.currency_code ?? "USD",
        discount_code: registration.discount_code ?? null,
        payment_reference: registration.payment_reference ?? null,
        registered_at: registration.registered_at ?? event.start_at,
        checked_in_at: registration.checked_in_at ?? null,
        notes: registration.notes ?? null,
      });
      if (ticketId) {
        updateTicketSold.run({ ticket_id: ticketId, quantity: registration.quantity ?? 1 });
      }
    }
  }
}

function seedCommunications(db) {
  if (tableHasRows(db, "message_templates")) {
    return;
  }
  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const adminId = admin?.id ?? null;
  const insertTemplate = db.prepare(
    `INSERT INTO message_templates (name, channel, subject, body_html, body_text, variables_json, is_active, created_by, updated_by)
     VALUES (@name, @channel, @subject, @body_html, @body_text, @variables_json, 1, @created_by, @updated_by)`
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (template_id, channel, subject, body_html, body_text, audience_json, status, sent_at, created_by)
     VALUES (@template_id, @channel, @subject, @body_html, @body_text, @audience_json, @status, @sent_at, @created_by)`
  );
  const insertDelivery = db.prepare(
    `INSERT INTO message_deliveries (message_id, contact_id, channel, address, status, provider_response, sent_at, delivered_at, error_message)
     VALUES (@message_id, @contact_id, @channel, @address, @status, @provider_response, @sent_at, @delivered_at, @error_message)`
  );
  const contactStmt = db.prepare(
    `SELECT id, email, phone, mobile FROM contacts WHERE id = ?`
  );
  const findContactId = (email) => (email ? idBy(db, "SELECT id FROM contacts WHERE email = ?", email) : null);

  const templateData = [
    {
      name: "Donation Thank You",
      channel: "Email",
      subject: "Thank you for your gift to Sunrise Shelter",
      body_html: "<p>Hi {{firstName}},</p><p>Thank you for your generous gift of {{amount}} to support {{fundName}}. Your compassion keeps families safe.</p><p>With gratitude,<br/>Sunrise Shelter</p>",
      body_text: "Hi {{firstName}}, thank you for your generous gift of {{amount}} to support {{fundName}}. With gratitude, Sunrise Shelter",
      variables_json: JSON.stringify(["firstName", "amount", "fundName", "receiptUrl"]),
    },
    {
      name: "Volunteer Shift Reminder",
      channel: "SMS",
      subject: null,
      body_html: null,
      body_text: "Reminder: your volunteer shift is on {{shiftDate}} at {{location}}. Reply YES to confirm.",
      variables_json: JSON.stringify(["shiftDate", "location"]),
    },
    {
      name: "Event Registration Confirmation",
      channel: "Email",
      subject: "You're registered for {{eventName}}",
      body_html: "<p>Hi {{firstName}},</p><p>Your registration for {{eventName}} on {{eventDate}} is confirmed. We'll see you at {{venueName}}!</p>",
      body_text: "Hi {{firstName}}, your registration for {{eventName}} on {{eventDate}} is confirmed. Venue: {{venueName}}.",
      variables_json: JSON.stringify(["firstName", "eventName", "eventDate", "venueName", "ticketCount"]),
    },
  ];

  const templateIds = new Map();
  for (const template of templateData) {
    const result = insertTemplate.run({
      name: template.name,
      channel: template.channel,
      subject: template.subject ?? null,
      body_html: template.body_html ?? null,
      body_text: template.body_text ?? null,
      variables_json: template.variables_json ?? null,
      created_by: adminId,
      updated_by: adminId,
    });
    templateIds.set(template.name, result.lastInsertRowid);
  }

  const janeId = findContactId("jane.doe@example.com");
  const johnId = findContactId("john.doe@example.com");
  const lenaId = findContactId("lena@sunriseshelter.org");

  const messageSeedData = [
    {
      templateName: "Donation Thank You",
      channel: "Email",
      subject: "Thank you for supporting families in crisis",
      body_html: "<p>Hi {{firstName}},</p><p>Your donation makes nights safer for families. Attached is your receipt.</p>",
      body_text: "Hi {{firstName}}, your donation keeps families safe. Receipt attached.",
      audience: { contactIds: [janeId, lenaId].filter(Boolean), segment: "recent_donors" },
      status: "Sent",
      sent_at: "2025-09-18T16:30:00Z",
    },
    {
      templateName: "Volunteer Shift Reminder",
      channel: "SMS",
      subject: null,
      body_html: null,
      body_text: "Reminder: Volunteer shift {{shiftDate}} at {{location}}. Reply YES to confirm.",
      audience: { contactIds: [johnId].filter(Boolean), segment: "upcoming_shifts" },
      status: "Sent",
      sent_at: "2025-09-19T15:00:00Z",
    },
    {
      templateName: "Event Registration Confirmation",
      channel: "Email",
      subject: "Your Harvest Hope Gala registration",
      body_html: "<p>Hi {{firstName}},</p><p>We're excited to have you at the Harvest Hope Gala. Doors open at 5pm.</p>",
      body_text: "Hi {{firstName}}, we look forward to seeing you at the Harvest Hope Gala. Doors open at 5pm.",
      audience: { contactIds: [janeId, johnId].filter(Boolean), segment: "event_attendees", eventCode: "EVT-2025-GALA" },
      status: "Sent",
      sent_at: "2025-09-20T18:45:00Z",
    },
  ];

  for (const message of messageSeedData) {
    if (!message.audience.contactIds.length) continue;
    const templateId = templateIds.get(message.templateName) ?? null;
    const result = insertMessage.run({
      template_id: templateId,
      channel: message.channel,
      subject: message.subject ?? null,
      body_html: message.body_html ?? null,
      body_text: message.body_text ?? null,
      audience_json: JSON.stringify(message.audience),
      status: message.status,
      sent_at: message.sent_at ?? null,
      created_by: adminId,
    });
    const messageId = result.lastInsertRowid;
    for (const contactId of message.audience.contactIds) {
      const contact = contactStmt.get(contactId);
      let address = null;
      if (message.channel === "Email") {
        address = contact?.email ?? null;
      } else {
        address = contact?.mobile ?? contact?.phone ?? null;
      }
      const sentAt = message.sent_at ?? null;
      const status = address ? "Delivered" : "Failed";
      const providerResponse = address ? "Mock delivery accepted" : null;
      const deliveredAt = address ? sentAt : null;
      const error = address ? null : "No delivery address on file";
  insertDelivery.run({
        message_id: messageId,
        contact_id: contactId,
        channel: message.channel,
        address,
        status,
        provider_response: providerResponse,
        sent_at: sentAt,
        delivered_at: deliveredAt,
        error_message: error,
      });
    }
  }
}

function seedReports(db) {
  if (tableHasRows(db, "report_definitions")) {
    return;
  }

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const adminId = admin?.id ?? null;

  const insertReport = db.prepare(
    `INSERT INTO report_definitions (slug, name, description, dataset, columns_json, filters_json, sort_json, options_json, permission_code, created_by, updated_by)
     VALUES (@slug, @name, @description, @dataset, @columns_json, @filters_json, @sort_json, @options_json, @permission_code, @created_by, @updated_by)`
  );
  const insertRole = db.prepare(
    `INSERT INTO report_roles (report_id, role_name, filters_json)
     VALUES (@report_id, @role_name, @filters_json)`
  );
  const insertView = db.prepare(
    `INSERT INTO report_views (report_id, user_id, name, description, columns_json, filters_json, sort_json, is_default)
     VALUES (@report_id, @user_id, @name, @description, @columns_json, @filters_json, @sort_json, @is_default)`
  );

  const reportSeedData = [
    {
      slug: "donations-monthly-detail",
      name: "Monthly Donation Detail",
      description: "Donations with fund and campaign context for the current month.",
      dataset: "fundraising_donations",
      columns: [
        "donation_id",
        "donated_at",
        "account_name",
        "contact_name",
        "fund_name",
        "campaign_name",
        "payment_method",
        "amount",
      ],
      defaultFilters: { date_range: { preset: "current_month" } },
      sort: [{ column: "donated_at", direction: "desc" }],
      options: { limit: 500 },
      permission: "reports.run",
      roles: [
        { name: "Admin" },
        { name: "Fundraising" },
      ],
      views: [
        {
          name: "Major Gifts",
          description: "Gifts of $500 or more this month.",
          filters: { date_range: { preset: "current_month" }, min_amount: 500 },
          columns: null,
          sort: null,
          isDefault: 0,
        },
        {
          name: "Recurring Supporters",
          description: "Active recurring donors contributing this month.",
          filters: { date_range: { preset: "current_month" }, is_recurring: "true" },
          columns: ["donation_id", "donated_at", "contact_name", "amount", "payment_method"],
          sort: [{ column: "donated_at", direction: "desc" }],
          isDefault: 0,
        },
      ],
    },
    {
      slug: "finance-journal-detail",
      name: "Journal Entry Detail",
      description: "Posted journal lines with account balances and source entry context.",
      dataset: "finance_journal_lines",
      columns: [
        "entry_number",
        "entry_date",
        "account_code",
        "account_name",
        "debit",
        "credit",
        "description",
        "created_by",
      ],
      defaultFilters: { status: "Posted", date_range: { preset: "last_60_days" } },
      sort: [{ column: "entry_date", direction: "desc" }],
      options: { limit: 500 },
      permission: "reports.run",
      roles: [
        { name: "Admin" },
        { name: "Finance" },
      ],
      views: [],
    },
    {
      slug: "volunteer-hours-summary",
      name: "Volunteer Hours Detail",
      description: "Volunteer logged hours with shift context for the last 90 days.",
      dataset: "volunteer_hours",
      columns: [
        "log_date",
        "volunteer_name",
        "hours",
        "shift_title",
        "status",
      ],
      defaultFilters: { date_range: { preset: "last_90_days" } },
      sort: [{ column: "log_date", direction: "desc" }],
      options: { limit: 500 },
      permission: "reports.run",
      roles: [
        { name: "Admin" },
        { name: "VolunteerMgr" },
      ],
      views: [
        {
          name: "Completed Hours",
          description: "Approved volunteer hours for completed shifts.",
          filters: { status: "Completed" },
          columns: ["log_date", "volunteer_name", "hours", "shift_title"],
          sort: [{ column: "log_date", direction: "desc" }],
          isDefault: 1,
        },
        {
          name: "Cancelled Standby",
          description: "Shifts cancelled due to weather or other issues.",
          filters: { status: "Cancelled" },
          columns: ["log_date", "volunteer_name", "hours", "shift_title", "status"],
          sort: [{ column: "log_date", direction: "desc" }],
          isDefault: 0,
        },
      ],
    },
  ];

  for (const report of reportSeedData) {
    const result = insertReport.run({
      slug: report.slug,
      name: report.name,
      description: report.description ?? null,
      dataset: report.dataset,
      columns_json: JSON.stringify(report.columns),
      filters_json: report.defaultFilters ? JSON.stringify(report.defaultFilters) : null,
      sort_json: report.sort ? JSON.stringify(report.sort) : null,
      options_json: report.options ? JSON.stringify(report.options) : null,
      permission_code: report.permission ?? null,
      created_by: adminId,
      updated_by: adminId,
    });
    const reportId = result.lastInsertRowid;

    for (const role of report.roles ?? []) {
      insertRole.run({
        report_id: reportId,
        role_name: role.name,
        filters_json: role.filters ? JSON.stringify(role.filters) : null,
      });
    }

    for (const view of report.views ?? []) {
      insertView.run({
        report_id: reportId,
        user_id: adminId,
        name: view.name,
        description: view.description ?? null,
        columns_json: view.columns ? JSON.stringify(view.columns) : null,
        filters_json: view.filters ? JSON.stringify(view.filters) : null,
        sort_json: view.sort ? JSON.stringify(view.sort) : null,
        is_default: view.isDefault ? 1 : 0,
      });
    }
  }
}

function seedDashboardCards(db) {
  if (tableHasRows(db, "dashboard_cards")) {
    return;
  }

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
  const adminId = admin?.id ?? null;

  const insertCard = db.prepare(
    `INSERT INTO dashboard_cards (slug, title, description, dataset, query_json, permission_code, config_json, created_by, updated_by)
     VALUES (@slug, @title, @description, @dataset, @query_json, @permission_code, @config_json, @created_by, @updated_by)`
  );
  const insertRole = db.prepare(
    `INSERT INTO dashboard_card_roles (card_id, role_name, filters_json)
     VALUES (@card_id, @role_name, @filters_json)`
  );

  const cardSeedData = [
    {
      slug: "donations-mtd",
      title: "Donations Month-to-Date",
      description: "Total donations received this month.",
      dataset: "fundraising_donations",
      query: {
        type: "aggregate",
        aggregate: "sum",
        field: "amount",
        filters: { date_range: { preset: "current_month" } },
      },
      permission: "reports.run",
      config: { format: "currency", comparison: { label: "vs last month", filters: { date_range: { preset: "previous_month" } } } },
      roles: ["Admin", "Fundraising"],
    },
    {
      slug: "active-volunteers-90",
      title: "Active Volunteers (90d)",
      description: "Unique volunteers who logged hours in the last 90 days.",
      dataset: "volunteer_hours",
      query: {
        type: "aggregate",
        aggregate: "count_unique",
        field: "volunteer_id",
        filters: { date_range: { preset: "last_90_days" } },
      },
      permission: "reports.run",
      config: { format: "number" },
      roles: ["Admin", "VolunteerMgr"],
    },
    {
      slug: "open-program-cases",
      title: "Open Program Cases",
      description: "Count of program cases currently open.",
      dataset: "program_cases",
      query: {
        type: "aggregate",
        aggregate: "count",
        field: "case_id",
        filters: { status: "Open" },
      },
      permission: "reports.run",
      config: { format: "number" },
      roles: ["Admin", "Program"],
    },
  ];

  for (const card of cardSeedData) {
    const result = insertCard.run({
      slug: card.slug,
      title: card.title,
      description: card.description ?? null,
      dataset: card.dataset,
      query_json: JSON.stringify(card.query),
      permission_code: card.permission ?? null,
      config_json: card.config ? JSON.stringify(card.config) : null,
      created_by: adminId,
      updated_by: adminId,
    });
    const cardId = result.lastInsertRowid;
    for (const roleName of card.roles ?? []) {
      insertRole.run({
        card_id: cardId,
        role_name: roleName,
        filters_json: null,
      });
    }
  }
}





