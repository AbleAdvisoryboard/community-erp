# Contributing

Thank you for considering a contribution to Community ERP. This project exists to build high-quality open-source ERP software that helps organizations better serve their communities.

## Issues

Use GitHub Issues to report bugs, request improvements, or ask focused project questions.

Before opening an issue:

- Search existing issues to avoid duplicates.
- Include the version, operating system, browser, and whether you are using the web app or Windows desktop app.
- For bugs, include steps to reproduce, expected behavior, actual behavior, and relevant logs or screenshots when possible.
- Do not include secrets, passwords, private donor/client information, or production database files.

## Pull Requests

Pull requests are welcome when they are focused and reviewable.

Recommended flow:

1. Fork the repository.
2. Create a branch from `main`.
3. Make a focused change.
4. Run the relevant checks.
5. Open a pull request using the PR template.

## Branch Recommendations

Use short, descriptive branch names:

- `fix/login-timeout`
- `docs/release-readme`
- `feature/report-filter`
- `test/accounting-posting`

## Commit Messages

Use clear, practical commit messages. Conventional-style prefixes are recommended but not required:

- `fix: correct invoice account layout`
- `docs: add commercial license notes`
- `test: cover bank deposit posting`
- `chore: update release packaging`

## Coding Standards

- Preserve existing application behavior unless the pull request clearly explains a behavior change.
- Keep changes scoped to the problem being solved.
- Follow the existing JavaScript, HTML, and CSS patterns in the repository.
- Use clear names and avoid unnecessary abstractions.
- Add or update tests when changing shared backend behavior, financial posting logic, authentication, authorization, or release packaging.
- Run `npm run lint` before submitting.
- Run `npm test` and `npm run test:api` when backend behavior changes.

## Contributor License Agreement

By submitting a contribution to this project, you agree that:

- You have the right to submit the contribution.
- Your contribution may be distributed as part of this project under the GNU General Public License version 3.
- Your contribution may also be distributed by the project owner under a commercial license or other proprietary or alternative licensing terms.
- You are not owed compensation, royalties, or ownership rights in the project solely because your contribution is accepted.

This simple contributor license agreement is intended for an early-stage open-source project. If you cannot agree to these terms, please do not submit the contribution.

## Code of Conduct

Participation in this project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
