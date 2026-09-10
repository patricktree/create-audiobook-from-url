# Web app

## What it does

- provides the React UI for submitting a source URL
- keeps the web source in `src/`
- uses TanStack Form for typed form state and URL validation
- initializes native listeners and renders the app from `src/bootstrap.tsx`
- builds the shared SPA bundle consumed by `apps/cloudflare-worker` and `apps/mobile-app`

## Development

From the repo root:

```sh
pnpm --filter '@create-audiobook-from-url/cloudflare-worker' dev
```

The Worker package owns the Vite development server and handles both the web app and `/api` requests, including live reload for the web source.

## Build

From the repo root:

```sh
pnpm --filter '@create-audiobook-from-url/cloudflare-worker' build
```

Turbo builds the web package once, then the Worker build copies that bundle as static assets without compiling the SPA again. The build produces:

- `apps/web-app/dist/types`
- `apps/web-app/dist/web` — the shared SPA bundle, also consumed by Capacitor
- `apps/cloudflare-worker/dist/client` — a copy of the shared SPA bundle
- `apps/cloudflare-worker/dist/create_audiobook_from_url` — the Worker bundle and deployment configuration

The shared bundle includes a CSP nonce placeholder. The API server replaces it with a fresh nonce per HTML response; Capacitor serves the same bundle locally without the server's CSP header.

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
