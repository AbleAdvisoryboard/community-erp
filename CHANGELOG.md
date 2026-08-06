# Changelog

## 2026-07-28 Windows Packaging & First-Run Setup
- Added first-run setup APIs and page so a fresh install creates the organization profile, logo, and first administrator without seeded demo credentials.
- Added an Electron desktop wrapper that starts the Express app locally, stores production data under Windows app data, and writes a startup log.
- Added Windows release packaging for installer, portable exe, and zip artifacts through `npm run dist:win`.
- Updated README quickstart/build notes and ignored generated release artifacts.

## 2025-09-23 Planning
- [x] Section 12.1 Repo scan: workspace previously empty except planning doc.
- [x] Section 12.2 Backend skeleton: Node/Express app, db connection, migration runner stub.
- [x] Section 12.3 Auth/RBAC/Audit: schema migrations, service layer, seed admin.
- [ ] Section 12.11 Docs/tests: README quickstart added; automated tests pending.
- [ ] Sections 12.4-12.10 Feature scaffolding: staged after core auth.

## 2025-09-24 Auth Foundations
- [x] Hardened migration reset to preserve schema history table.
- [x] Ran npm run db:migrate -- --reset and npm run db:seed to verify auth/RBAC bootstrap.


## 2025-09-24 CRM & Fundraising
- [x] Added CRM/Fundraising schema (accounts, contacts, activities, funds, campaigns, donations, pledges, receipts).
- [x] Implemented service layer + RBAC-protected REST routes with validation and audit logging.
- [x] Seeded demo records for accounts/contacts, funds/campaigns, donations, soft credits, receipts, and pledges.
- [x] Updated README quickstart with new data set.


## 2025-09-24 Frontend & Finance
- [x] Added blue/white dashboard shell with CRM and Fundraising pages wired to REST APIs and login flow.
- [x] Introduced finance schema (GL accounts, journals, balance view) with services/routes and seeded opening balances.
- [x] Created Fundraising/Finance front-end pages for donation entry and trial balance review.
- [x] Updated README with new modules and navigation notes.


## 2025-09-24 Inventory & Assets
- [x] Added inventory schema (categories, items, stock, asset registry, maintenance logs, adjustments view).
- [x] Implemented inventory services/controllers/routes with RBAC, audit, and low-stock endpoint.
- [x] Seeded demo inventory data and integrated frontend /html/inventory.html with item creation, stock adjustments, alerts, and assets.
- [x] Updated API client, README, and navigation for inventory module.



## 2025-09-24 Volunteers & Programs
- [x] Extended schema with volunteers, shifts, hours summary view, clients, cases, and service logs (migration 20250924_0005).
- [x] Added RBAC-protected volunteer/program controllers, services, and audit logging with restricted-field filtering for PHI data.
- [x] Seeded volunteer engagement records plus program clients/cases; wired new /html/volunteers.html and /html/programs.html pages.
- [x] Updated navigation, API client helpers, and README notes for the modules.

## 2025-09-24 Events & Communications
- [x] Created migration 20250924_0006 for events, sessions, tickets, discounts, sponsors, registrations, message templates, messages, and delivery logs.
- [x] Implemented event and communications service layers, controllers, and Express routes with validation, RBAC guards, and audit hooks.
- [x] Seeded gala/onboarding events with tickets, sponsors, registrations plus email/SMS templates and sent message history.
- [x] Added /html/events.html and /html/communications.html pages, JS modules, and frontend API integrations (including nav updates).
- [x] Refreshed README, CHANGES, and API client exports to document the new capabilities.



## 2025-09-25 Nice-to-Haves
- Added ICS calendar feeds (volunteer shifts, individual events, upcoming events) via `/api/v1/calendar`, plus UI links.
- Introduced pluggable email/SMS/payment providers with a mock default and payment transaction logging.
- Delivered dashboard snapshot service + homepage KPIs and API recipe.

## 2025-09-25 Calendar Feeds
- [x] Added calendar tokens migration for volunteers/events with automatic seeding updates.
- [x] Implemented calendar service/routes generating ICS feeds for events and volunteer shifts.
- [x] Exposed new calendar utilities + tokens via services and documentation hooks.

## 2025-09-25 Provider Registry
- [x] Created provider registry with mock email/SMS/payment adapters configurable via env (`EMAIL_PROVIDER`, `SMS_PROVIDER`, `PAYMENT_PROVIDER`).
- [x] Wired fundraising and messaging services to resolve providers through the registry with audit-friendly responses.
- [x] Documented new env settings in `.env.example`.

## 2025-09-25 Dashboard KPIs
- [x] Expanded dashboard snapshot service with finance, fundraising, volunteer, and event metrics.
- [x] Secured /api/v1/dashboard/snapshot under reports.run permission.
- [x] Refreshed dashboard UI with new KPI panels and supporting styles/scripts.
## 2025-10-02 Intelligence Foundation
- Added intelligence schema migration (org insights, people ratings, funding sources, grants catalog, org grants, watchlist, overlap view).
- Seeded sample insights, ratings, grants, and watchlist entries via `backend/db/seeds/seed_intelligence.js`.
- Introduced Zod validators and Express controllers/routes for Intelligence APIs with RBAC and audit logging.
- Documented new endpoints in `docs/api-intelligence.http` and wired server middleware for validation.

## 2025-10-02 Intelligence UI & Seeds
- Extended primary seeds to incorporate intelligence role, permissions, and sample insights/grant data.
- Added `/frontend/html/intelligence.html` with blue/white WordPress-style workspace and tabbed views.
- Implemented new frontend modules (intelligence-org.js, intelligence-people.js, intelligence-grants.js, intelligence-watchlist.js) plus styling and API helpers.
- Introduced `nav.js` to centralize sidebar navigation and expose the Intelligence module across pages.
