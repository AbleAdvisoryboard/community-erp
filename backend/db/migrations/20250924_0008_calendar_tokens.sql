ALTER TABLE volunteers ADD COLUMN ical_token TEXT;
ALTER TABLE events ADD COLUMN ical_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteers_ical_token ON volunteers(ical_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_ical_token ON events(ical_token);

UPDATE volunteers SET ical_token = lower(hex(randomblob(16))) WHERE ical_token IS NULL;
UPDATE events SET ical_token = lower(hex(randomblob(16))) WHERE ical_token IS NULL;
