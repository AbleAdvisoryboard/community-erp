-- Add traceability and campaign dimension to journal_lines (additive)
ALTER TABLE journal_lines ADD COLUMN campaign_id INTEGER;
ALTER TABLE journal_lines ADD COLUMN source_table TEXT;
ALTER TABLE journal_lines ADD COLUMN source_id INTEGER;
ALTER TABLE journal_lines ADD COLUMN source_line INTEGER;

-- Foreign keys and indexes (SQLite doesn't support adding FK constraints post-hoc,
-- but we can still add helpful indexes)
CREATE INDEX IF NOT EXISTS idx_journal_lines_campaign ON journal_lines(campaign_id);
-- Note: class_id index omitted here to avoid failures on older DBs where class_id
-- may not yet exist. A separate migration already adds class_id and can own its index.
CREATE INDEX IF NOT EXISTS idx_journal_lines_source ON journal_lines(source_table, source_id);
