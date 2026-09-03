# Issue tracker: GitHub

Issues and specifications for this repository live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: use `gh issue list` with appropriate state and label filters.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. When a bare number is ambiguous, try `gh pr view <number>` and fall back to `gh issue view <number>`.

## Skill operations

When a skill says "publish to the issue tracker," create a GitHub issue.

When a skill says "fetch the relevant ticket," run `gh issue view <number> --comments`.

## Wayfinding operations

The Wayfinder map is a GitHub issue labelled `wayfinder:map`. Its decision tickets are child issues.

- **Map**: create an issue labelled `wayfinder:map`.
- **Child ticket**: create an issue carrying one `wayfinder:<type>` label: `research`, `prototype`, `grilling`, or `task`. Link it to the map using GitHub sub-issues.
- **Sub-issue fallback**: if native sub-issues are unavailable, add the child to a task list in the map and begin its body with `Part of #<map>`.
- **Blocking**: use GitHub's native issue dependencies. Add an edge with:

  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`

  Obtain the blocker's numeric database ID with:

  `gh api repos/<owner>/<repo>/issues/<number> --jq .id`

- **Blocking fallback**: if native dependencies are unavailable, begin the child body with `Blocked by: #<number>, #<number>`.
- **Frontier**: the frontier consists of the map's open, unassigned child issues that have no open blockers. The first child in map order wins.
- **Claim**: `gh issue edit <number> --add-assignee @me` must be the session's first write.
- **Resolve**: post the answer as a resolution comment, close the ticket, and append a linked one-line gist to the map's Decisions-so-far section.
