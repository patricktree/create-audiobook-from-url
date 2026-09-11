# Web App Agent Instructions

## Scope

- Applies to `apps/web-app/**`.
- Follow the root `AGENTS.md` for package manager, validation, testing, and commits.

## Layout

- `src/app/**`: React UI and styling.
- `src/app/design-system/**`: reusable UI primitives.

## Local Conventions

- Use package imports such as `#src/...`.
- Prefer `DSButton` over raw buttons for app UI.
- Use native HTML constraint validation until the form needs application-specific validation.

## Commands

- During development: `pnpm validate:fast` from the repo root. Before pushing to `main` (shipping to production): `pnpm validate`.
- Run locally through its host: `pnpm --filter '@cup/cloudflare-worker' dev`.
