-- Orgs insights (extends accounts)
CREATE TABLE IF NOT EXISTS org_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER UNIQUE NOT NULL,
  rating TEXT CHECK(rating IN ('Strong','Stable','AtRisk','NeedsSupport')) DEFAULT 'Stable',
  status TEXT CHECK(status IN ('Active','Dormant','Competitor','NeedsSupport')) DEFAULT 'Active',
  tags_json TEXT,
  notes TEXT,
  last_reviewed_at TEXT,
  reviewer_id INTEGER,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_org_insights_status ON org_insights(status);
CREATE INDEX IF NOT EXISTS idx_org_insights_rating ON org_insights(rating);

-- People ratings (extends contacts)
CREATE TABLE IF NOT EXISTS people_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER UNIQUE NOT NULL,
  score INTEGER CHECK(score BETWEEN 0 AND 100) DEFAULT 50,
  affinity TEXT CHECK(affinity IN ('Champion','Neutral','Skeptic')) DEFAULT 'Neutral',
  influence_level TEXT CHECK(influence_level IN ('Low','Medium','High')) DEFAULT 'Low',
  last_touch_at TEXT,
  notes TEXT,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_people_ratings_score ON people_ratings(score);

-- Funding sources catalog
CREATE TABLE IF NOT EXISTS funding_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT,           -- Federal/State/Local/Private (free text to allow flexibility)
  region TEXT,             -- e.g., US, NJ, NYC
  avg_award_amount REAL,
  website TEXT,
  contact_email TEXT,
  active INTEGER DEFAULT 1
);

-- Grants catalog
CREATE TABLE IF NOT EXISTS grants_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funding_source_id INTEGER NOT NULL,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  focus_areas_json TEXT,   -- JSON array
  deadline_at TEXT,
  typical_amount_min REAL,
  typical_amount_max REAL,
  url TEXT,
  FOREIGN KEY (funding_source_id) REFERENCES funding_sources(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_grants_deadline ON grants_catalog(deadline_at);

-- Orgs mapped to grants
CREATE TABLE IF NOT EXISTS org_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  grant_id INTEGER NOT NULL,
  stage TEXT CHECK(stage IN ('Prospect','Applied','Awarded','Closed')) NOT NULL DEFAULT 'Prospect',
  amount_requested REAL,
  amount_awarded REAL,
  start_date TEXT,
  end_date TEXT,
  owner_user_id INTEGER,
  reminder_at TEXT,
  notes TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (grant_id) REFERENCES grants_catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_org_grants_account ON org_grants(account_id);
CREATE INDEX IF NOT EXISTS idx_org_grants_grant ON org_grants(grant_id);
CREATE INDEX IF NOT EXISTS idx_org_grants_stage ON org_grants(stage);

-- Watchlist across entities
CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT CHECK(entity_type IN ('Org','Person','Grant')) NOT NULL,
  entity_id INTEGER NOT NULL,
  reason TEXT,
  priority TEXT CHECK(priority IN ('High','Medium','Low')) DEFAULT 'Low',
  created_by INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolution_notes TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_watchlist_entity ON watchlist(entity_type, entity_id);

-- Overlap view: who shares a grant
CREATE VIEW IF NOT EXISTS v_grant_overlap AS
SELECT g.id AS grant_id, g.title,
       a1.id AS account_id, a1.name AS account_name,
       a2.id AS other_account_id, a2.name AS other_account_name
FROM org_grants og1
JOIN org_grants og2 ON og1.grant_id = og2.grant_id AND og1.account_id <> og2.account_id
JOIN grants_catalog g ON g.id = og1.grant_id
JOIN accounts a1 ON a1.id = og1.account_id
JOIN accounts a2 ON a2.id = og2.account_id;


