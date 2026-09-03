# Cloudflare Vite plugin for the SPA and API Worker

Research date: 2026-08-30

## Conclusion

Use one Cloudflare Vite application and one deployed Worker. In this repository, `apps/cloudflare-worker` is the deployable host. It owns `vite.config.ts`, `wrangler.jsonc`, `index.html`, development, preview, build, and deployment. `apps/web-app` provides its browser entry point and React UI as a workspace dependency.

This matches the tutorial's deployment model. Its term "API Worker" means the Worker script deployed with the SPA assets, not an auxiliary Worker or a second deployment. One Vite build produces the client and Worker outputs. See Cloudflare's [React SPA with an API Worker tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/#add-an-api-worker).

## Repository mapping

- `apps/cloudflare-worker/index.html` is the client HTML entry point.
- `apps/cloudflare-worker/src/web-app.tsx` mounts the `WebApp` component exported by `@create-audiobook-from-url/web-app/main`.
- `apps/cloudflare-worker/vite.config.ts` configures React, route generation, styling, and the Cloudflare Vite plugin.
- `apps/cloudflare-worker/wrangler.jsonc` identifies the Worker entry point and runtime bindings.
- `apps/web-app` owns the React source and exports its browser entry point.

The Cloudflare plugin finds `wrangler.jsonc` in the Vite root by default. See the [`configPath` API reference](https://developers.cloudflare.com/workers/vite-plugin/reference/api/#interface-pluginconfig).

## Static assets

Do not set `assets.directory` in the input Wrangler configuration. The Vite plugin writes the generated client directory into the output Wrangler configuration. See [Static Assets with the Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/#configuration).

Keep `run_worker_first: true` and the `ASSETS` binding. This repository's API server applies middleware and security headers to every response, then delegates non-API requests to `context.env.ASSETS.fetch(...)`. See Cloudflare's [run Worker first documentation](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/#run-your-worker-script-first).

## Output and commands

The host produces:

```text
apps/cloudflare-worker/dist/
  client/
  create_audiobook_from_url_workflow/
    wrangler.json
    ...bundled Worker files
```

Run all combined lifecycle commands from `apps/cloudflare-worker`. After `vite build`, the plugin creates `.wrangler/deploy/config.json` in that package. Wrangler uses it to find the generated deployment configuration. Cloudflare documents this build and deployment flow in [Build your application](https://developers.cloudflare.com/workers/vite-plugin/tutorial/#build-your-application).

Do not use `auxiliaryWorkers` for this setup. Auxiliary Workers are for a multi-Worker architecture with service bindings and separate deployments. See the [`auxiliaryWorkers` API reference](https://developers.cloudflare.com/workers/vite-plugin/reference/api/#interface-pluginconfig).
