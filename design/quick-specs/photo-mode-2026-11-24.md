# Quick Design Spec: Photo Mode

**Type**: New Small System
**Scope**: Pause a drive, frame the player's vehicle with a free orbit camera, apply a look, and save/share a watermarked PNG. Does not record video, move the vehicle, or add depth-of-field (cost on phones).
**Date**: 2026-11-24
**Estimated Implementation**: 4–6 hours
**GDD Reference**: none (no GDD/brief in this project; this spec is the design record)

## Overview
Racing players love showing off their ride. Photo Mode opens from the pause menu: the race freezes, the HUD disappears, and a camera orbits the player's vehicle. The player drags to orbit, pinches (or scrolls) to zoom, picks one of five looks, sets the vignette, and taps the shutter. The shot is saved with a small "PICCO GARAGE" watermark and offered to the phone's share sheet.

## Core Rules
1. Entry: Pause menu → "Photo". The drive stays paused for the whole session (traffic, crowd, timers frozen).
2. Camera orbits the vehicle centre at body height: drag horizontally = yaw (full 360°), vertically = pitch (3°–75° above ground), pinch / wheel = distance (vehicle length × 0.6 to × 3). Starts behind the vehicle at the chase-camera angle.
3. The camera never goes below the ground plane (pitch floor 3°).
4. Looks (post-processing uniforms; Low quality has no post pass, so looks are unavailable there and the UI says so):
   - Natural: game grade. Vivid: saturation 1.45, contrast 1.15. Noir: saturation 0, contrast 1.3, grain 0.06.
   - Sunset: warm gain (1.12, 0.98, 0.82), saturation 1.2. Retro film: saturation 0.75, lifted blacks, warm cast, grain 0.09.
5. Vignette slider 0–1 (default: the look's value).
6. Shutter: renders one frame, copies it, adds the watermark bottom-right (≈2.2% of height), plays the shutter sound, then opens the share sheet with a PNG; if sharing is unavailable, the file downloads.
7. Exit: "Done" returns to the pause menu with the normal camera and grade restored.

## Tuning Knobs
| Knob | Default | Range | Category | Rationale |
|---|---|---|---|---|
| orbit sensitivity | 0.008 rad/px | 0.004–0.015 | feel | One thumb sweep ≈ half a turn |
| pitch limits | 3°–75° | 0–89° | feel | Keeps the camera above ground |
| zoom range | 0.6–3 × vehicle length | — | feel | Close detail to full-body shots |
| grain (Noir/Retro) | 0.06/0.09 | 0–0.15 | look | Film feel without noise mush |
Values live in `src/ui/photo.ts` (`LOOKS`, `ORBIT`) — this web game has no `data/config.json`.

## Acceptance Criteria
- [ ] Pause → Photo freezes the race; resuming continues exactly where it stopped
- [ ] One-finger drag orbits, two-finger pinch zooms (iPhone/Android); mouse drag + wheel on desktop
- [ ] Each look visibly changes the image; Noir is fully desaturated
- [ ] Shutter produces a PNG at render resolution with the watermark; share sheet or download follows
- [ ] HUD hidden during Photo Mode and restored after; no console errors
- [ ] Regression: normal driving camera, grade and pause menu unchanged after leaving Photo Mode

## Systems Index
No systems index in this project — below tracking threshold; this quick spec is sufficient.
