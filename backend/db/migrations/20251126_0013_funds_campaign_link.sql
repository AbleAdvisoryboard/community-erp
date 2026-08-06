-- Link funds to campaigns so donation UI can filter funds by campaign

ALTER TABLE funds ADD COLUMN campaign_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_funds_campaign ON funds(campaign_id);

