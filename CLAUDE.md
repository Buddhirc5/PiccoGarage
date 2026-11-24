# Picco Garage – working rules

## Higgsfield credits (owner's standing order)
- **Never run anything on Higgsfield that costs credits without the owner's approval first.**
  Before every image, video, audio or 3D generation (including retries and batches),
  quote the exact credit cost (use the estimate tools) and say what will be made,
  then wait for an explicit "yes". Free calls (balance, estimates, uploads, listing) are fine.
- Prefer the cheapest model and settings that do the job; batch only after approval.

## Skills installed in this repo
- `.claude/skills` and `.claude/agents`: the Claude Code Game Studios kit
  (MIT, © Donchitos, see `.claude/GAME-STUDIOS-LICENSE`), with its `scripts`,
  `docs`, `rules`, `engines` and `genres`, plus `project.yaml`. Its hook scripts are
  present only because skills call `hooks/yaml-helper.sh`; they stay inert because
  the kit's `settings.json` and status line are deliberately NOT installed.
  Its `code-review` skill was skipped (clashes with the built-in one).

## Studio artifacts
- Balance report: `design/balance/` · quick specs: `design/quick-specs/` · security: `production/security/`.
- Debug hooks (`window.nav`, `window.drive`, `?debug`) exist only on localhost/dev builds.
