# Domain docs

This repository uses one domain context across its applications and libraries.

## Before exploring

Read:

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.

If either location is absent, proceed silently. Domain documentation is created lazily when terminology or durable architectural decisions are resolved.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
├── apps/
└── libs/
```

## Use the glossary's vocabulary

When naming a domain concept in an issue, specification, proposal, test, or implementation, use the canonical term from `CONTEXT.md`. Avoid synonyms that the glossary explicitly rejects.

If a required concept is absent, reconsider whether new language is necessary or capture the gap through the domain-modeling workflow.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly rather than silently overriding the ADR.
