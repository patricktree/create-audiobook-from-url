# End-to-end tests

This package tests the complete local conversion path through the web app, Worker, Durable Objects, Workflow, and R2. It produces and validates a real MP3 and EPUB without calling a paid AI service or a public website.

The test-only Worker supplies deterministic fakes for source-material preparation, narration selection, and speech synthesis. Each fake belongs to the production library whose boundary it implements. The remaining application code is the production code.

## Prerequisites

- Docker with host networking support
- The repository's Node.js and pnpm versions

The first test run downloads the pinned Playwright Docker image. Later runs reuse it.

## Run the tests

From the repository root, run:

```sh
pnpm run test:e2e
```

This command builds the workspace and runs the tests with at most two parallel workers. Each test starts an isolated Wrangler process with its own port and persistence directory.

The E2E suite is intentionally separate from `pnpm validate`. It is slower and requires Docker.

## Update screenshots

After an intentional visual change, run:

```sh
pnpm run test:e2e:update
```

Review every changed image under `qa/e2e/snapshots` before accepting it. Screenshot comparisons require an exact pixel match.

## Debug a test

Run Playwright's debug mode from the repository root:

```sh
pnpm run test:e2e --debug
```

Debug mode uses the locally installed browser instead of the Docker browser. Its snapshots have a platform-specific suffix and do not replace the Docker reference images.

Playwright writes reports, traces, and failure screenshots to `qa/e2e/playwright-output`. To keep a failed test's Wrangler persistence directory for inspection, run:

```sh
E2E_RETAIN_STATE=1 pnpm run test:e2e
```

The report contains an attachment with the retained directory path.

To stream the child Wrangler logs while a test runs, add `E2E_STREAM_WRANGLER=1`.

## Cost and network boundary

The QA Worker has no Cloudflare AI binding. The harness also removes Cloudflare account credentials from each Wrangler child process and rejects unexpected browser requests. Do not add a paid-provider binding or a real provider call to this package. A local deterministic fake is the required test seam, even when it gives less confidence than a paid integration test.
