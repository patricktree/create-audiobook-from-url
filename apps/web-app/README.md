# Web app

## What it does

- provides the React UI for submitting a source URL
- keeps the web source in `src/`
- uses TanStack Form for typed form state and URL validation
- exposes its browser entry point as `@create-audiobook-from-url/web-app/main`
- is hosted and bundled by `apps/cloudflare-worker`

## Development

From the repo root:

```sh
pnpm --filter '@create-audiobook-from-url/cloudflare-worker' dev
```

The Worker package owns the Vite development server and handles both the web app and
`/api` requests.

## Build

From the repo root:

```sh
pnpm --filter '@create-audiobook-from-url/cloudflare-worker' build
```

The build produces:

- `apps/web-app/dist/types`
- `apps/cloudflare-worker/dist/client`
- `apps/cloudflare-worker/dist/create_audiobook_from_url_workflow`

## Manual verification checklist

- run the build and confirm it succeeds
- open the web app in a browser
- submit an empty or malformed URL and confirm the form shows an inline validation message

## Component tests and visual coverage

Route stories in `src/routes/*.story.tsx` render the application with deterministic MSW responses. Component tests cover the landing page, open trial, URL validation, pending submission, trial errors, conversion progress and failure, and audiobook results and errors on desktop and mobile. The E2E suite keeps one screenshot assertion for the open-trial URL input screen.

Run the component tests from the repository root:

```sh
pnpm --filter '@create-audiobook-from-url/web-app' test:components
```

After intentional visual changes, regenerate the Docker baselines and review the images under `apps/web-app/snapshots`:

```sh
pnpm --filter '@create-audiobook-from-url/web-app' test:components --update-snapshots
```

Explore the stories with `pnpm --filter '@create-audiobook-from-url/web-app' dev:gallery`.
