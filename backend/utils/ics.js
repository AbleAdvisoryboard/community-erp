const NEWLINE = '\r\n';
const MAX_LINE_LENGTH = 75;

function formatDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(value = '') {
  return String(value)
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line) {
  if (line.length <= MAX_LINE_LENGTH) {
    return [line];
  }
  const parts = [];
  let remaining = line;
  while (remaining.length > MAX_LINE_LENGTH) {
    parts.push(remaining.slice(0, MAX_LINE_LENGTH));
    remaining = ' ' + remaining.slice(MAX_LINE_LENGTH);
  }
  parts.push(remaining);
  return parts;
}

function pushLine(lines, value) {
  if (!value && value !== '') return;
  const folded = foldLine(value);
  for (const part of folded) {
    lines.push(part);
  }
}

export function buildICS({ name = 'Calendar', description = '', timezone = 'UTC', events = [] } = {}) {
  const safeName = escapeText(name || 'Calendar');
  const lines = [];

  pushLine(lines, 'BEGIN:VCALENDAR');
  pushLine(lines, 'PRODID:-//Community ERP//Calendar 1.0//EN');
  pushLine(lines, 'VERSION:2.0');
  pushLine(lines, 'CALSCALE:GREGORIAN');
  pushLine(lines, 'METHOD:PUBLISH');
  pushLine(lines, `NAME:${safeName}`);
  pushLine(lines, `X-WR-CALNAME:${safeName}`);
  pushLine(lines, `X-WR-TIMEZONE:${escapeText(timezone || 'UTC')}`);

  if (description) {
    pushLine(lines, `X-WR-CALDESC:${escapeText(description)}`);
  }

  const dtStamp = formatDate(new Date().toISOString());

  events.forEach((event, index) => {
    const dtStart = formatDate(event?.start);
    if (!dtStart) {
      return;
    }
    const dtEnd = formatDate(event.end);
    const uidRaw = event.uid || `${dtStart}-${index}@community-erp`;
    const summary = event.summary || event.title || 'Event';

    pushLine(lines, 'BEGIN:VEVENT');
    pushLine(lines, `UID:${escapeText(uidRaw)}`);
    if (dtStamp) {
      pushLine(lines, `DTSTAMP:${dtStamp}`);
    }
    pushLine(lines, `DTSTART:${dtStart}`);
    if (dtEnd) {
      pushLine(lines, `DTEND:${dtEnd}`);
    }
    pushLine(lines, `SUMMARY:${escapeText(summary)}`);
    if (event.description) {
      pushLine(lines, `DESCRIPTION:${escapeText(event.description)}`);
    }
    if (event.location) {
      pushLine(lines, `LOCATION:${escapeText(event.location)}`);
    }
    if (event.url) {
      pushLine(lines, `URL:${escapeText(event.url)}`);
    }
    pushLine(lines, 'END:VEVENT');
  });

  pushLine(lines, 'END:VCALENDAR');
  return `${lines.join(NEWLINE)}${NEWLINE}`;
}
