const NAV_ITEMS = [
  { href: '/html/index.html', label: 'Dashboard', accessId: 'dashboard', dividerAfter: true, adminOnly: true },
  { href: '/html/fundraising.html', label: 'Donation Console', accessId: 'donation_console', dividerAfter: true },
  { href: '/html/crm.html', label: 'Constituent Relationship Management', accessId: 'crm' },
  { href: '/html/fundraising-admin.html', label: 'Fundraising Management', accessId: 'fundraising_management' },
  { href: '/html/volunteers.html', label: 'Volunteer Engagement', accessId: 'volunteer_engagement', dividerAfter: true },
  { href: '/html/events.html', label: 'Events & Ticketing', accessId: 'events_ticketing' },
  { href: '/html/calendar.html', label: 'Calendar', accessId: 'calendar', dividerAfter: true },
  { href: '/html/meeting-notes.html', label: 'Meeting Notes', accessId: 'meeting_notes', dividerAfter: true },
  { href: '/html/communications.html', label: 'Communications Center', accessId: 'communications', dividerAfter: true },
  // Inventory placed above Finance with a divider under it across all menus
  { href: '/html/inventory.html', label: 'Inventory & Assets', accessId: 'inventory_assets', dividerAfter: true },
  // Financial Statements should appear below the Inventory divider and above General Ledger
  { href: '/html/financial-statements.html', label: 'Financial Statements', accessId: 'financial_statements' },
  { href: '/html/finance.html', label: 'General Ledger', accessId: 'general_ledger' },
  { href: '/html/bank.html', label: 'Bank Deposits', accessId: 'bank_deposits' },
  { href: '/html/ar.html', label: 'Accounts Receivable', accessId: 'accounts_receivable' },
  { href: '/html/ap.html', label: 'Accounts Payable', accessId: 'accounts_payable', dividerAfter: true },
  // Divider above Reports
  { href: '/html/reports.html', label: 'Reports', accessId: 'reports', dividerAfter: true },
  { href: '/html/settings.html', label: 'Settings', accessId: 'settings', adminOnly: true },
];

function userIsAdmin(user) {
  return (user?.roles || []).some((role) => role.name === 'Admin');
}

function userCanSeeItem(user, item) {
  if (!user) return false;
  if (userIsAdmin(user)) return true;
  if (item.adminOnly) return false;
  const accessSection = user.access?.sections?.[item.accessId];
  return Boolean(accessSection?.enabled || accessSection?.features?.length);
}

function renderNav(user = window.__ERP_USER__) {
  const sidebarNav = document.querySelector('.sidebar nav');
  if (!sidebarNav) return;

  let section = sidebarNav.querySelector('.nav-section');
  if (!section) {
    section = document.createElement('div');
    section.className = 'nav-section';
    sidebarNav.appendChild(section);
  }

  const htmlParts = ['<h4>Overview</h4>'];
  const visibleItems = NAV_ITEMS.filter((item) => userCanSeeItem(user, item));
  for (const item of visibleItems) {
    htmlParts.push(`<a class="nav-link" href="${item.href}">${item.label}</a>`);
    if (item.dividerAfter) {
      htmlParts.push('<div class="nav-divider"></div>');
    }
  }
  const html = htmlParts.join('\n');
  section.innerHTML = html;

  const path = window.location.pathname || '/html/index.html';
  const normalized = path === '/' ? '/html/index.html' : path;
  const links = section.querySelectorAll('a.nav-link');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    const isActive = normalized === href;
    link.classList.toggle('active', isActive);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  document.addEventListener('auth:ready', (event) => {
    renderNav(event.detail?.user || null);
  });
});
