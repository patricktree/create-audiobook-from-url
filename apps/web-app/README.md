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
