# Cloudflare Worker

## Commands

| Task            | Command                                                                        |
| --------------- | ------------------------------------------------------------------------------ |
| Develop locally | `pnpm --filter '@create-audiobook-from-url/cloudflare-worker' run dev`         |
| Build           | `pnpm --filter '@create-audiobook-from-url/cloudflare-worker' run turbo:build` |
| Lint            | `pnpm --filter '@create-audiobook-from-url/cloudflare-worker' run turbo:lint`  |

- Deploy only when the user explicitly requests it.

## Cloudflare Documentation

Consult current official Cloudflare documentation before making decisions that depend on runtime behavior, configuration syntax, compatibility, limits, or quotas.

This Worker uses:

| Product           | Documentation                                              |
| ----------------- | ---------------------------------------------------------- |
| Workers           | <https://developers.cloudflare.com/workers/>               |
| Static Assets     | <https://developers.cloudflare.com/workers/static-assets/> |
| Workflows         | <https://developers.cloudflare.com/workflows/>             |
| Durable Objects   | <https://developers.cloudflare.com/durable-objects/>       |
| R2                | <https://developers.cloudflare.com/r2/>                    |
| Workers AI        | <https://developers.cloudflare.com/workers-ai/>            |
| Browser Rendering | <https://developers.cloudflare.com/browser-rendering/>     |

For design changes, consult the current best-practice documentation:

- Durable Objects: <https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/>
- Workflows: <https://developers.cloudflare.com/workflows/build/rules-of-workflows/>
