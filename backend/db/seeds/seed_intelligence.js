import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../connection.js';

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function tableHasRows(db, table) {
  const sql = 'SELECT 1 FROM ' + table + ' LIMIT 1';
  const row = db.prepare(sql).get();
  return !!row;
}

function ensureAccounts(db) {
  const rows = db.prepare('SELECT id FROM accounts ORDER BY id ASC LIMIT 2').all();
  if (rows.length >= 2) {
    return [rows[0].id, rows[1].id];
  }
  if (rows.length === 1) {
    const secondId = db
      .prepare('INSERT INTO accounts(type, name) VALUES ("Organization", "Example Org B")')
      .run().lastInsertRowid;
    return [rows[0].id, secondId];
  }
  const firstId = db
    .prepare('INSERT INTO accounts(type, name) VALUES ("Organization", "Example Org A")')
    .run().lastInsertRowid;
  const secondId = db
    .prepare('INSERT INTO accounts(type, name) VALUES ("Organization", "Example Org B")')
    .run().lastInsertRowid;
  return [firstId, secondId];
}

function ensureContact(db) {
  const existing = db.prepare('SELECT id FROM contacts ORDER BY id ASC LIMIT 1').get();
  if (existing?.id) return existing.id;
  return db
    .prepare('INSERT INTO contacts(first_name, last_name, email) VALUES ("Ava", "Nguyen", "ava@example.com")')
    .run().lastInsertRowid;
}

function upsertFundingSource(db, name, category, region, website) {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO funding_sources(name, category, region, website) VALUES (?,?,?,?)'
  );
  return stmt.run(name, category, region, website).lastInsertRowid;
}

function insertGrant(db, fundingSourceId, payload) {
  const grantSql = [
    'INSERT OR IGNORE INTO grants_catalog(',
    '  funding_source_id, code, title, description, focus_areas_json,',
    '  deadline_at, typical_amount_min, typical_amount_max, url',
    ') VALUES (?,?,?,?,?,?,?,?,?)'
  ].join('\n');
  const stmt = db.prepare(grantSql);
  return stmt
    .run(
      fundingSourceId,
      payload.code || null,
      payload.title,
      payload.description || null,
      payload.focusAreas ? JSON.stringify(payload.focusAreas) : null,
      payload.deadline || null,
      payload.minAmount ?? null,
      payload.maxAmount ?? null,
      payload.url || null
    )
    .lastInsertRowid;
}

function upsertOrgInsight(db, accountId, data) {
  const select = db.prepare('SELECT id FROM org_insights WHERE account_id = ?').get(accountId);
  if (select?.id) {
    const updateSql = [
      'UPDATE org_insights',
      '   SET rating = COALESCE(?, rating),',
      '       status = COALESCE(?, status),',
      '       tags_json = COALESCE(?, tags_json),',
      '       notes = COALESCE(?, notes),',
      '       last_reviewed_at = COALESCE(?, last_reviewed_at)',
      ' WHERE id = ?'
    ].join('\n');
    db.prepare(updateSql).run(
      data.rating ?? null,
      data.status ?? null,
      data.tags ? JSON.stringify(data.tags) : null,
      data.notes ?? null,
      data.lastReviewedAt ?? null,
      select.id
    );
    return select.id;
  }
  const insertSql = [
    'INSERT INTO org_insights(account_id, rating, status, tags_json, notes, last_reviewed_at)',
    'VALUES (?,?,?,?,?,?)'
  ].join('\n');
  return db
    .prepare(insertSql)
    .run(
      accountId,
      data.rating ?? 'Stable',
      data.status ?? 'Active',
      data.tags ? JSON.stringify(data.tags) : null,
      data.notes ?? null,
      data.lastReviewedAt ?? null
    ).lastInsertRowid;
}

function insertOrgGrant(db, payload) {
  const exists = db
    .prepare('SELECT 1 FROM org_grants WHERE account_id = ? AND grant_id = ?')
    .get(payload.accountId, payload.grantId);
  if (exists) return;
  const insertSql = [
    'INSERT INTO org_grants(account_id, grant_id, stage, amount_requested, owner_user_id, notes)',
    'VALUES (?,?,?,?,?,?)'
  ].join('\n');
  db.prepare(insertSql).run(
    payload.accountId,
    payload.grantId,
    payload.stage ?? 'Prospect',
    payload.amountRequested ?? null,
    payload.ownerUserId ?? null,
    payload.notes ?? null
  );
}

function insertWatchlist(db, payload) {
  const exists = db
    .prepare('SELECT 1 FROM watchlist WHERE entity_type = ? AND entity_id = ?')
    .get(payload.entityType, payload.entityId);
  if (exists) return;
  const insertSql = [
    'INSERT INTO watchlist(entity_type, entity_id, reason, priority)',
    'VALUES (?,?,?,?)'
  ].join('\n');
  db.prepare(insertSql).run(payload.entityType, payload.entityId, payload.reason ?? null, payload.priority ?? 'Low');
}

export function seedIntelligence(dbArg, options = {}) {
  const { skipIfExisting = true } = options;
  const ownsConnection = !dbArg;
  const db = dbArg ?? getDb();
  try {
    if (skipIfExisting && tableHasRows(db, 'org_insights')) {
      return;
    }

    const insertRole = db.prepare('INSERT OR IGNORE INTO roles(name) VALUES (?)');
    ['Intelligence', 'Fundraising', 'Programs'].forEach((role) => insertRole.run(role));

    const doeId = upsertFundingSource(
      db,
      'US Department of Education',
      'Federal',
      'US',
      'https://www.ed.gov'
    );
    const dcaId = upsertFundingSource(
      db,
      'NJ Department of Community Affairs',
      'State',
      'NJ',
      'https://www.nj.gov/dca/'
    );

    const grant1Id = insertGrant(db, doeId || 1, {
      code: 'ALN-84.215',
      title: 'NIA Community Programs',
      description: 'After-school enrichment',
      focusAreas: ['After-School', 'STEM'],
      deadline: '2025-11-15',
      minAmount: 25000,
      maxAmount: 150000,
      url: 'https://www.grants.gov/',
    });
    const grant2Id = insertGrant(db, dcaId || 1, {
      code: 'NJ-CBO-2025',
      title: 'Community-Based Org Support',
      description: 'Capacity grants for CBOs',
      focusAreas: ['Capacity', 'Operations'],
      deadline: '2025-10-30',
      minAmount: 10000,
      maxAmount: 50000,
      url: 'https://www.nj.gov/',
    });

    const [account1Id, account2Id] = ensureAccounts(db);

    upsertOrgInsight(db, account1Id, {
      rating: 'Strong',
      status: 'Active',
      tags: ['STEM', 'After-School'],
      notes: 'Great partner candidate.',
      lastReviewedAt: now(),
    });
    upsertOrgInsight(db, account2Id, {
      rating: 'AtRisk',
      status: 'NeedsSupport',
      tags: ['Operations'],
      notes: 'Lost prior grant; needs TA.',
      lastReviewedAt: now(),
    });

    const ownerId = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get()?.id ?? null;
    insertOrgGrant(db, {
      accountId: account1Id,
      grantId: grant1Id || 1,
      stage: 'Applied',
      amountRequested: 50000,
      ownerUserId: ownerId,
      notes: 'Applied with STEM focus',
    });
    insertOrgGrant(db, {
      accountId: account2Id,
      grantId: grant1Id || 1,
      stage: 'Prospect',
      amountRequested: 60000,
      ownerUserId: ownerId,
      notes: 'Exploring partnership',
    });
    insertOrgGrant(db, {
      accountId: account2Id,
      grantId: grant2Id || 1,
      stage: 'Awarded',
      amountRequested: 25000,
      ownerUserId: ownerId,
      notes: 'Capacity boost',
    });

    const contactId = ensureContact(db);
    const peopleSql = [
      'INSERT OR REPLACE INTO people_ratings(contact_id, score, affinity, influence_level, notes, last_touch_at)',
      'VALUES (?,?,?,?,?,?)'
    ].join('\n');
    db.prepare(peopleSql).run(contactId, 78, 'Champion', 'High', 'Introduced to DOE PM; strong ally.', now());

    insertWatchlist(db, {
      entityType: 'Org',
      entityId: account1Id,
      reason: 'Competes on ALN-84.215 with partner orgs',
      priority: 'Medium',
    });
  } finally {
    if (ownsConnection) {
      closeDb();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedIntelligence();
  console.log('Intelligence seed complete.');
}