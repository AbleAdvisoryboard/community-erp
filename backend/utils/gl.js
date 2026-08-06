export const GL_CODES = Object.freeze({
  CASH: '1000',
  UNDEPOSITED: '1010',
  AR: '1100',
  AP: '2000',
  CONTRIB_REV_BASE: '4000',
});

export function isContributionRevenue({ code, name, type }) {
  const c = String(code || '').trim();
  const n = String(name || '').toLowerCase();
  // Prefer type check when available
  if (type && String(type) !== 'Revenue') return false;
  // Typical contributions revenue codes (400x or named contributions/donations)
  if (c.startsWith('400')) return true;
  if (n.includes('contribution') || n.includes('donation')) return true;
  return false;
}

