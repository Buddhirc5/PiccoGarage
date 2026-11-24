# Security Audit Report

**Date**: 2026-11-24
**Scope**: full
**Engine**: web (three.js 0.187, Vite 8), TypeScript; backend Supabase (shared with KiwiPath)
**Audited by**: security-engineer via /security-audit
**Files scanned**: game + admin source under src/, supabase/migrations, vercel.json, public/sw.js, package.json/lockfile

## Executive Summary

| Severity | Count | Must Fix Before Release |
|---|---|---|
| CRITICAL | 0 | Yes — all |
| HIGH | 1 | Yes — all |
| MEDIUM | 4 | Recommended |
| LOW | 6 | Optional |

**Release recommendation**: FIX BEFORE SHIPPING (one open HIGH). Categories 1 (save/serialization), 2 (network) and 3 (input) are **NOT ASSESSED — no sourced pattern set for a web engine**; findings below in those areas were found incidentally while running categories 4–6. Scope rated single-player (online features: analytics, sync, admin); re-rate SEC-001/002/006 upward if leaderboards, multiplayer or paid currency ship.

## HIGH
- **SEC-001** Progress in plain localStorage, no integrity/type/bounds checks; parse failure silently wipes progress (src/game/progress.ts load/save). Remediation: validate + clamp on load, back up instead of overwriting a corrupt save; server-side economy before monetisation. Effort Low (1–2) / High (server).

## MEDIUM
- **SEC-002** Anonymous, unthrottled writes to the shared DB; `picco_events` accepts future-dated rows and any type (0003 insert policy, picco_sync). Remediation: ingest via SECURITY DEFINER function with server `created_at`, type allow-list, batch cap; rate limit; retention job. Effort Medium.
- **SEC-003** One malformed row breaks admin RPCs (unsafe `::numeric/::int` casts) and admin rendering (non-string labels, non-array `owned`); Live config tab blocked too. Remediation: safe casts, validation on ingest, defensive admin rendering, separate config RPC. Effort Low.
- **SEC-004** Admin email hardcoded in the public admin bundle and committed migrations. Remediation: gate the UI on `picco_is_admin()`; seed admin outside the repo by user id; enable MFA. Effort Low.
- **SEC-005** `window.nav` and `?debug` hooks in production let a console user start any spec with any reward. Remediation: dev/localhost only. Effort Low.

## LOW
- **SEC-006** Admin check keyed by JWT email in a shared auth project, no MFA (aal2) requirement. Key by `auth.uid()`, require aal2, review shared auth settings.
- **SEC-007** Gifts claimable by device id alone; claimed before client acknowledgement. Bind to auth.uid() later; rate limit.
- **SEC-008** No security headers; admin frameable; admin tokens in localStorage. Add frame-ancestors/X-Frame-Options on /admin, nosniff, Referrer-Policy, then a tested CSP.
- **SEC-009** Privacy policy doesn't describe collected anonymous data; no consent/retention/erasure. Rewrite policy, retention, delete-my-data. (Compliance: GDPR/ePrivacy, Sri Lanka PDPA 2022.)
- **SEC-010** Dev-only dependency advisories (gltf-transform CLI → glob/minimatch). Production deps: 0 vulnerabilities.
- **SEC-011** Live config values unbounded on client and server (coinMultiplier, stations, any key). Clamp on client; allow-list keys on server.

Note: migration 0001 (`picco_race_results` readable by any authenticated user) not verified as applied; client does not use it.

## Dependency Inventory
| Package | Version | Source | Known CVEs |
|---|---|---|---|
| three | 0.187.0 | npm | none |
| @supabase/supabase-js | 2.119.0 | npm | none |
| @fontsource/anton, @fontsource-variable/inter | 5.3.0 | npm | none |
| vite (dev) | 8.3.8 | npm | none |
| @gltf-transform/cli (dev) | 4.5.1 | npm | GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249 (transitive, moderate) |

## Remediation Priority Order
1. SEC-003, SEC-002 — server-side ingest validation and safe casts — Low/Medium
2. SEC-004, SEC-006 — admin hardening — Low
3. SEC-005, SEC-001 (steps 1–2) — Low
4. SEC-008 — headers — Low/Medium
5. SEC-009 — privacy/legal — Medium

## Re-Audit Trigger
Run `/security-audit quick` after remediating SEC-001. Workflow is `minimal`: the release gate does not read this report, but the open HIGH still makes the recommendation FIX BEFORE SHIPPING.

## Remediation status (2026-11-24, same day)
| Finding | Status | Change |
|---|---|---|
| SEC-001 | **Fixed (steps 1–2)** | `progress.ts` sanitize(): types, ranges, known ids only; corrupt saves backed up (`picco.progress.v3.corrupt-*`), never silently wiped. Verified with a tampered and a corrupt save. Step 4 (server-side economy) open — required before paid currency. |
| SEC-002 | **Fixed in code — pending migration** | `0004_picco_hardening.sql`: direct insert revoked; `picco_track` (server time, type allow-list, numeric props checked, 50/batch, 120/min per device). Client uses it with fallback. Retention job still open. |
| SEC-003 | **Fixed (client) — server pending migration** | Admin `label()` and `owned` defensive; 0004 type-checks props/snapshots and cleans bad/future rows. |
| SEC-004 | **Fixed (bundle)** | Email removed from the admin page; access decided by `picco_is_admin()`. Still in git history and the 0002/0003 seed lines; enable MFA. |
| SEC-005 | **Fixed** | `window.nav`, `window.drive`, `?debug` only on localhost/dev builds (`DEBUG_HOOKS`). |
| SEC-006/007 | Open (LOW) | Need the admin's user UUID / sign-in. |
| SEC-008 | **Partly fixed** | nosniff, Referrer-Policy, Permissions-Policy site-wide; `/admin` X-Frame-Options DENY + frame-ancestors 'none'. Full CSP open (needs testing). |
| SEC-009 | Open | Privacy policy rewrite + consent/retention/erasure. |
| SEC-010 | Accepted | Dev-only; no production impact. |
| SEC-011 | **Fixed (client) — server pending migration** | coinMultiplier clamped 1–3, stations validated; 0004 allow-lists config keys. |
Re-run `/security-audit quick` after 0004 is applied.
