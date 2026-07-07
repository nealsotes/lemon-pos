---
name: git-workflow
description: Use when creating branches, writing commit messages, or opening/reviewing pull requests. Covers branch naming, Conventional Commits style, the PR checklist, merge strategy, and code-review expectations for this repo.
---

# Git Workflow

TRIGGER when: creating a branch, committing, preparing a PR, or reviewing one.

DO NOT TRIGGER when: the question is about the content of a code review's findings (use `coding-standards` for the checklist, or the relevant stack skill).

## Branch Naming

`<type>/<short-kebab-description>` — matches existing history (e.g. `fix/discount-reporting-double-count`).

| Type | Use for |
|------|---------|
| `feat/` | new feature |
| `fix/` | bug fix |
| `chore/` | tooling, deps, renames, no behavior change |
| `refactor/` | restructuring without behavior change |
| `docs/` | documentation only |

Branch off `main`. Keep one logical change per branch.

## Commit Messages — Conventional Commits

`type(scope): summary` in the imperative, lower-case, no trailing period. Matches history:

```
feat(checkout): pick mobile provider (GCash, GoTyme, Maribank, Metrobank)
fix(reports): stop double-counting discounts in P&L and accountant summary
feat(products): show-inactive toggle + fix reactivating inactive products
chore(brand): rename app to FinnBites + clarify receipt-no label
```

- **Scope** = the feature/area touched (`checkout`, `reports`, `products`, `inventory`, `auth`).
- Body (optional) explains **why**, wraps ~72 cols.
- One concern per commit; don't mix a refactor with a fix.

## Pull Request Checklist

- [ ] Title follows Conventional Commits; description says **what** and **why**
- [ ] Scope is one logical change; unrelated edits removed
- [ ] Backend: `dotnet build` clean + `dotnet test` green
- [ ] Frontend: `npm run build` + `npm test` (headless) green
- [ ] New behavior has tests (see `testing`)
- [ ] Migration included if schema changed, and reviewed for destructive ops (see `migrations`)
- [ ] No secrets/tokens/PII in the diff (see `railway` for env-var handling)
- [ ] Docs updated if architecture, commands, or patterns changed (`docs/`, `CLAUDE.md`, `AGENTS.md`)
- [ ] Screenshots for UI changes

## Merge Strategy

- Prefer a clean, linear history: rebase your branch on `main` before merge; squash noisy WIP commits into meaningful units.
- Never merge with failing CI or unresolved conflicts.
- Delete the branch after merge.

## Code Review Expectations

- At least one approval before merge; the `lead-developer` skill performs the final review pass.
- Reviewers check correctness, layer adherence (`architecture`), security, and tests — not style bikeshedding (style is settled in `coding-standards`).
- Feedback is specific and actionable; suggest the fix, don't just flag.

## Related skills

- `lead-developer` — runs the final review before work is called done
- `coding-standards` — the review checklist for code quality
- `testing` — what "tests pass" means per stack
- `migrations`, `railway` — release-safety gates referenced above

## Behavior

- Commit and push only when the user asks. If on `main`, create a branch first.
- Never skip hooks or bypass signing unless the user explicitly requests it.
- Keep commit scope honest — if the diff does two things, make two commits.
