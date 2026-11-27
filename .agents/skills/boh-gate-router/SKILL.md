---
name: boh-gate-router
description: Route changes in the BOH Beta 2.5 repository to the right verification gates and browser probes. Use when a task edits UI, router, styles, BOH AI, Supabase SQL/Edge Functions, or GitHub workflows, and when the user asks to verify, self-prove, accept, release, or run gates/probes (门禁/探针/自证/验收). Runs the repository's existing gate:plan first, then follows AGENTS.md §2 and docs/guides/gate-matrix.md for the matched rows. Routes only; does not redefine gates or replace project rules.
---

# BOH Gate Router

This is a thin router for this repository. Do not copy its rules into a second table.

Single sources, in order:

1. `AGENTS.md` §2 — change → required extra commands
2. `docs/guides/gate-matrix.md` — why, `C-n` failure details, DB/CI exceptions
3. `docs/guides/PROBES.md` — how to run browser probes
4. `docs/guides/AI-ENV.md` — environment and parallel-session discipline
5. `scripts/lib/gate-map.json` — machine map consumed by `gate:plan`

If these disagree, the documents win; report the mismatch instead of inventing a rule.

## Workflow

1. Scope the change:
   ```bash
   git status --short
   git diff --name-only HEAD
   ```
   Keep only files owned by the current task. Do not attribute another session's files to this change.

2. Get the machine plan from the repository root:
   ```bash
   npm run gate:plan -- --json
   ```
   `gate:plan` only plans; it never executes and always exits 0. It is not a verdict.

3. If the working tree contains unrelated parallel-session changes, rerun with task-owned paths only:
   ```bash
   node scripts/gate-plan.mjs <path> [<path>...]
   ```
   Use the scoped list as the planning input.

4. For every planned command, read the matching `AGENTS.md` §2 row before running it. If the row points to a `C-n` detail, open that section in `docs/guides/gate-matrix.md` first. Execute the printed commands in their printed order.

5. Add the baseline chain, not a substitute for the plan:
   - CSS-only or small change: `npm run verify:fast`
   - normal change: `npm run verify`
   - before release: `npm run verify:full`
   - workflows/deploy chain when the plan calls for it: `npm run build:ci`

6. Visual/layout changes need the matching browser probe, not just `verify`. If `gate:plan` prints no probe for a visual change, locate the row in `AGENTS.md` §2 and `PROBES.md`; if none exists, report `未覆盖` instead of claiming a visual pass.

7. DB gates are deliberately outside `verify`:
   - `npm run check:db-lint`
   - `npm run check:db-advisors`

   Run them when the change touches SQL/functions/permissions, or before release as the matching row requires. If the Management API token is unavailable, report `skipped` (and why), never `pass`.

## Hard stops

- Never use `--no-verify` to turn a red gate green.
- Never run a DB deploy, Edge Function deploy, permission revoke, or publish as part of routing. Those need explicit human confirmation.
- Do not install packages or change the DSH profile to satisfy this skill.
- Do not claim a pre-existing failure without a clean baseline. If the baseline was not established, write `基线未验证`.
- `verify` green is not the same as clean; ratchets and probes still matter.

## Report format

End with the repository's evidence format:

```text
结论：pass / fail / 未覆盖
判据：<exact command(s)> → exit code, key counts (e.g. 21/21)
实测日期：YYYY-MM-DD
未覆盖：<probe not run, token skipped, manual-only visual check>
```

Keep commands verbatim. Do not replace exact counts with "全部通过" when a probe or ratchet reports a number.