# Agent Instructions

## Package Manager

- Use pnpm. Install dependencies with `pnpm install`.

## Environment setup

On a fresh checkout or worktree, initialize the shared tooling submodule before installing dependencies. The preinstall check rejects a missing or empty `.patricktree-stack` directory:

```sh
git submodule update --init --recursive
pnpm install
```

Dependencies then install, but the postinstall check fails until you create `apps/cloudflare-worker/.env.local` and `libs/narration-content-selection/.env.evals` with matching `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_KEY` values:

```sh
node tooling/env-setup/src/cli.ts setup --from /absolute/path/to/existing.env
pnpm install
```

Use an existing credentials file or another checkout’s env file as the source. Alternatively, export `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_KEY` and run `node tooling/env-setup/src/cli.ts setup` without `--from`. Use Node for this bootstrap step: pnpm can trigger installation and fail the postinstall check before running setup. Setup preserves existing files; both files are ignored by Git. Run `pnpm run env:check` to check them manually; postinstall and `pnpm validate` also check them.

## Commands

| Task                    | Command         |
| ----------------------- | --------------- |
| Validate the repository | `pnpm validate` |

## Repository References

| Need                                | File                           |
| ----------------------------------- | ------------------------------ |
| Issue tracker and specifications    | `docs/agents/issue-tracker.md` |
| Triage labels                       | `docs/agents/triage-labels.md` |
| Domain terminology and ADR guidance | `docs/agents/domain.md`        |
