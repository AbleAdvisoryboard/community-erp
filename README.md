# Community ERP for Nonprofits

Community ERP is a full-stack ERP for nonprofit organizations and social enterprises. The purpose of this project is to build high-quality open-source ERP software that helps organizations better serve their communities.

The Windows release starts with a blank database and first-run setup. Local development includes optional demo seeds for testing.

## Why This Project Exists

Many community-serving organizations need practical software for operations, finance, fundraising, volunteers, events, reporting, and internal coordination. This project brings those workflows into one open-source codebase that can be studied, improved, and adapted.

## Core Features

- First-run setup for organization profile, logo, and initial administrator
- Authentication, RBAC, audit logging, and CSRF protection
- CRM, fundraising, finance, inventory, volunteer, event, communication, reporting, settings, and meeting notes modules
- General ledger posting flows for donations, AR, AP, and bank deposits
- Financial reporting foundations including trial balance, balance sheet, and statement of activities
- Windows desktop packaging through Electron
- SQLite database with migrations, backfills, and local development seeds
- API, unit, and smoke test coverage for core backend workflows

## Current Modules

- `CRM & Fundraising` - households, contacts, donations, pledges, receipts, funds, campaigns, and campaign tracking with audit history.
- `Finance & Accounting` - chart of accounts, journals, trial balance, balance sheet, statement of activities, financial approvals, AR, AP, and bank deposits.
- `Inventory & Assets` - inventory categories, items, stock levels, adjustments, asset registry, maintenance logs, and low-stock alerts.
- `Volunteers & Programs` - volunteer profiles, interests, skills, availability, shifts, service hours, clients, cases, and service logs with restricted-field handling.
- `Events & Communications` - events, sessions, tickets, discounts, sponsors, registrations, message templates, messages, delivery logs, and calendar feeds.
- `Reports & Dashboards` - dataset builder, saved report definitions, role-aware filters, KPI cards, CSV export, and dashboard views.
- `Meeting Notes` - meeting note management with related frontend pages and API routes.
- `Settings & Setup` - organization setup, company settings, user access foundations, and desktop first-run flow.

## Architecture Overview

- Node.js 20, ES modules, and Express backend
- SQLite through `better-sqlite3`
- Layered backend structure with controllers, services, routes, middleware, validators, migrations, and tests
- Static HTML, CSS, and JavaScript frontend served from `frontend/`
- Electron desktop wrapper that runs the Express app locally and opens a native Windows app window
- Pluggable provider registry for email, SMS, and payment integrations, with mock providers as defaults
- Shared utilities for validation, authentication, CSRF, audit logging, tokens, ICS calendar generation, and GL helpers

## Screenshots

Screenshots will be added as the public release documentation matures.

## Windows App Install

Download the current Windows installer from [DOWNLOAD.md](DOWNLOAD.md).

Prebuilt Windows artifacts are written to `release/` by `npm run dist:win`:

- `Community ERP Setup 0.1.0.exe` - guided Windows installer with Start Menu and desktop shortcuts.
- `Community ERP 0.1.0.exe` - portable app executable.
- `Community ERP-0.1.0-win.zip` - zipped unpacked app folder.

On first launch, Community ERP opens a setup screen where the organization adds its name/logo and creates the first administrator. The desktop app stores its database and startup log under the user's Windows app data folder, not inside the install directory.

Uninstalling the Windows app removes the Community ERP app data folder so a reinstall starts with first-run setup again.

## Installation

For source-based development, install Node.js 20 and run:

```bash
npm install
npm run db:migrate
npm run dev
```

Then open `http://localhost:3000` and complete first-run setup.

## Developer Setup

1. Copy `.env.example` to `.env` and adjust secrets as needed.
2. Run `npm install`.
3. Run `npm run db:migrate` to create the SQLite schema. Local data is stored in `./data/app.db` unless `DB_PATH` is set.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.
6. Complete first-run setup in the browser.

For local demo data only, run `npm run db:seed` after migrations. Demo seeds are not bundled into the Windows release.

## Windows Build

1. Install Node.js 20.
2. Install Visual Studio Build Tools 2022 with the C++ workload. This is required for Electron's native SQLite dependency.
3. Run `npm ci`.
4. Run `npm run desktop:deps`.
5. Run `npm run dist:win`.
6. Run `npm run native:node` if you want to run Node-based dev/test commands in the same checkout after building.

The desktop wrapper runs the existing Express app inside Electron, opens a local app window, and writes startup details to `%APPDATA%/Community ERP/logs/startup.log`.

## Database & Local Demo Data

- Migrations live under `backend/db/migrations`; they are idempotent and preserve schema history.
- The Windows release creates an empty SQLite database on first launch and sends the user through setup before normal app access.
- `npm run db:reset` is a developer command that wipes and rebuilds the schema, then loads local demo data.
- Seeds (`backend/db/seed.js`) are development-only and populate CRM households, GL accounts, inventory, volunteer rosters, events, report definitions, dashboards, and sample knowledge spaces.
- Backfills (`backend/db/backfill/runBackfills.js`) ensure sensitive data like reports and dashboard cards gain the correct role visibility after upgrades.

## Testing & Quality

- `npm run lint` - static analysis with ESLint.
- `npm run test:unit` - Vitest unit coverage for services, dataset engines, and helpers.
- `npm run test:api` - Supertest assertions for auth and reporting endpoints.
- `npm run test:e2e` - Playwright smoke test for login, navigation, and reporting UI.
- `npm run test:all` - runs lint, unit, API, and e2e suites.
- `npm run test:watch` - Vitest watch mode.

## Upgrade Safety

`npm run verify:upgrade` clones the live SQLite database into a temporary location, replays the latest migrations and backfills, and reports key record counts. Use it before shipping schema changes to confirm upgrades are non-destructive.

If `data/app.db` is missing during development, run `npm run db:migrate` first; add `npm run db:seed` only when you intentionally want demo data.

## Developer Toolkit

- `docs/api.http` contains ready-to-run REST recipes for VS Code REST Client or `curl` copy/paste.
- `docs/api-intelligence.http` contains Intelligence API recipes.
- Calendar feeds available at `/api/v1/calendar/...` expose `.ics` downloads for volunteers and events.
- Pluggable providers default to mocks; override with `EMAIL_PROVIDER`, `SMS_PROVIDER`, and `PAYMENT_PROVIDER`.
- Playwright configuration (`playwright.config.mjs`) starts the dev server automatically and records HTML traces for smoke failures.
- Database helpers (`backend/db/connection.js`, `backend/tests/utils/`) expose factory functions so automated tests can bootstrap isolated SQLite files.
- `scripts/verifyUpgrade.mjs` and `backend/db/backfill/` can be extended as new migrations and backfill routines are introduced.

## Documentation

- [Download the Windows Installer](DOWNLOAD.md)
- [Accounting Posting Flows](docs/accounting-posting.md)
- [API Recipes](docs/api.http)
- [Intelligence API Recipes](docs/api-intelligence.http)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Security Policy](SECURITY.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Commercial License](COMMERCIAL-LICENSE.md)

## Project Layout

- `backend/` - Express app (`server.js` exports `createApp()`), controllers, services, validators, middleware, database layer, migrations, and tests.
- `frontend/` - HTML, CSS, and JavaScript for dashboard shell and module-specific views.
- `desktop/` - Electron desktop entry point.
- `docs/` - API recipes and technical implementation documents.
- `scripts/` - operational helpers, smoke checks, release/native rebuild tooling, and upgrade verification.
- `playwright/` - end-to-end specs and fixtures.
- `.github/` - CI workflows, release workflow, issue templates, and pull request template.

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

Contributions are welcome under the terms described in [CONTRIBUTING.md](CONTRIBUTING.md). Contributors agree that accepted contributions may be distributed under the GNU GPL v3 and under a commercial license by the project owner.

GitHub Discussions are recommended for broader questions and community planning once enabled for the repository.

## License

Community ERP uses a dual-license model.

The primary open-source license is the GNU General Public License version 3. See [LICENSE](LICENSE).

## Commercial Licensing

Commercial licensing is available for organizations wishing to use this software under proprietary or alternative licensing terms. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Commercial license inquiries: Contactus@aadvisoryboard.com

## Support

- Use GitHub Issues for reproducible bugs and focused feature requests.
- Use [SECURITY.md](SECURITY.md) for responsible security reporting.
- Do not include secrets, passwords, private donor/client information, or production database files in public reports.

## Authors

Project owner and copyright holder: Joshua Jose Vazquez

- https://joshuajosevazquez.net

Affiliated organizations:

- Celo Assets: https://celoasset.com
- Able Advisory Board: https://aadvisoryboard.com

These organizations do not own the project unless explicitly stated elsewhere.

See [AUTHORS.md](AUTHORS.md).

## Acknowledgements

This project is built with Node.js, Express, SQLite, Electron, and other open-source dependencies. Dependency licenses remain governed by their respective projects.
