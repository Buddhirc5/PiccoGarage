## Balance Check: Economy & Progression (career, garage, levels, gems)

### Data Sources Analyzed
- src/game/data.ts (vehicles, upgrade bases, upgradeCost)
- src/game/career.ts (42 events: minPR, rewards, rival skill, chapter gate)
- src/game/progress.ts (stats/PR, classes, levels, level rewards, daily rewards)
- src/game/drive.ts `end()` (per-race coin/XP/gem formulas)
- design/registry/entities.yaml: ABSENT. design/gdd/: ABSENT (no stated targets)

### Health Summary: CRITICAL ISSUES
(gem economy has a faucet and no sink; a paid vehicle is dominated by a free one)

### Outliers Detected
NOT ASSESSED — NO DATA: no GDD or registry states target ranges (run /design-system to write them).
Values below are judged on internal consistency only.

### Degenerate Strategies Found
- **Gems have no sink.** Players earn ~60 from bosses, +2 per new 3-star, level rewards (~58 by level 18) and the daily streak (15/week) — and nothing spends gems. The currency is pure decoration.
- **SLTB Red Route Bus is never worth buying.** It costs 3,000 coins and 6 stars but its PR (372 stock / 557 maxed) is below the *free* Private Coach (402 / 595) in the same bus class.
- **Repeat farming:** a re-cleared event pays its full star reward every time (e.g. ch6 boss 7,150 × 1.2 = 8,580 coins/run), so farming one boss outpaces playing the career.

### Progression Analysis
| Chapter | Recommended PR | Coins / event | Rival skill |
|---|---|---|---|
| 1 Colombo | 370–406 | 400–1,900 | 0.80–0.90 |
| 2 Kottawa | 412–448 | 820–2,950 | 0.84–0.94 |
| 3 Pannipitiya | 454–490 | 1,240–4,000 | 0.88–0.98 |
| 4 Galle | 496–532 | 1,660–5,050 | 0.93–1.02 |
| 5 Anuradhapura | 538–574 | 2,080–6,100 | 0.97–1.06 |
| 6 Kandy | 580–616 | 2,500–7,150 | 1.01–1.06 |
- Faucets: full 3-star career ≈ 101,700 coins; level rewards to ~L18 ≈ 20,400; daily ≈ 8,000/week.
- Sinks: all vehicles 68,500; maxing one vehicle 52,300 (×8 vehicles = 418k).
- PR is reachable: final event 616 needs Street King / Neon Rider (tuk) or Leyland+ (bus) upgraded — a healthy late-game gate.
- Upgrade value per 1k coins (tuk, first level): turbo 24.0, tyres 19.8, gearbox 17.7, engine 16.4, **brakes 13.3** — brakes are always the worst buy.
- Chapter gate needs 10 stars per chapter of 21 available: lenient but not broken.

### Recommendations
| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| P1 | Gems have no sink | Gem uses: unlock a car before its star gate; a "Payday" ticket that doubles one race's coins | Gives the premium currency a purpose |
| P1 | SLTB dominated by free coach | Rebalance SLTB as the sturdy, grippy bus (PR ≈ 412 stock / 615 maxed) | Every paid car earns its price |
| P2 | Repeat farming | Re-clears pay 60% of the star reward (first clears unchanged) | Career stays the fastest path |
| P3 | Brakes weakest buy | Raise brake weight in PR (4 → 6) and lower base cost (300 → 250) | No dead upgrade |

### Values That Need Attention
- SLTB base stats (data.ts) — buff as above.
- `coins += reward * (0.6 + stars*0.2)` — multiply by 0.6 when `prevStars > 0`.
- PR formula `brake * 4` → `brake * 6`; UPGRADES brakes base 300 → 250.

### Fixes applied (2026-11-24) and re-check
- Gem sinks added: early unlock (`unlockGems` = max(10, stars × 1.5): 10–78 gems) and Payday (5 gems, next event 2× coins).
- SLTB rebalanced: PR 406 stock / 603 maxed. Bus ladder now rises with price: 402 (free) → 406 (3k) → 426 (9k) → 440 (16k) → 449 (22k).
- Re-clears at the same star count pay 60% of the star reward; first clears and star improvements unchanged.
- Brakes base 300 → 200: 20.0 PR per 1k coins at level 1 (was 13.3), now mid-pack.
Re-run `/balance-check` after the next content change.
