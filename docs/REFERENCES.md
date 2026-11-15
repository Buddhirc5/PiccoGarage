# Visual references (style notes)

The owner shared reference images (bus skin templates from Sri Lankan bus-sim
communities, tuk-tuk photos, red public bus photos). The images themselves are
**not** stored in this repo: they contain other people's artwork, watermarks,
real operator / brand names and photos of real people. We use them only as
style inspiration. Every livery in the game is generated originally in code.

More references will be added over time — append notes here.

## Private Leyland-style bus

- **Skin layout (UV atlas)** used by the community: front face, rear face,
  left side, right side, roof strip. Our procedural livery generator paints the
  same five panels on a canvas so community-style "skins" map naturally.
- **Front**: curved roof dome with a destination board ("Special" style board,
  often lit), two large windscreen panes split by a pillar, a name board strip
  under the windscreen (Sinhala name of the bus), chrome grille, **quad round
  headlights** (two each side), bumper in a contrasting colour (often red),
  number plate centre-bottom, amber marker lights on the roof edge.
- **Rear**: big rear window with a name panel, tail lights in clusters,
  ladder to the roof rack.
- **Sides**: one long row of windows with a thin chrome rail above and below,
  front passenger door just behind the driver, **rear conductor door with two
  tall narrow vertical windows**, small window above the rear wheel.
- **Livery families** seen (all reproduced as original procedural styles):
  1. *Classic stripes* – white body, two-tone blue or red stripes with a
     signature downward "kink" swoosh along the side, angled colour block
     near the front.
  2. *Neon wrap* – deep blue / black base with glowing light streaks and
     bokeh dots.
  3. *Flame wrap* – red/orange/yellow flame gradients with white claw slashes.
  4. *Party pink* – magenta/purple gradient with diagonal light beams.
  5. *Night rider* – matte black with thin red "circuit" lines and red LED
     strips.
- Names on the bus are usually in **Sinhala**, big, bold, outlined (white
  outline, red/yellow fill) — our name-plate tool should support this.
- Decorations: roof marker lights, chrome trims, horn trumpets on the roof,
  side mirrors on long arms, curtain-style side window tint.

## Tuk-tuk (three-wheeler)

- Generic three-wheeler silhouette (front single wheel with a big chrome or
  painted mudguard, two rear wheels, black canvas roof with a rolled edge,
  open sides, driver bench in front, passenger bench behind).
- Common colours: maroon/red, orange-red, green, white, pink.
- Mods: **whitewall wheels**, chrome front mudguard, tall antennas and small
  flags on the roof, windscreen visor stickers (text across the top of the
  windscreen), side body stickers/art, extra round fog lamps, LED strips,
  cushioned interior, hanging dashboard decorations.
- Do **not** use real manufacturer badges or logos.

## Red public bus (SLTB-style, generic)

- Plain red body, a **horizontal blue stripe** with a thin white/silver band
  at waist height, dark window band, black grille with quad round headlights,
  a triangle reflector sign on the front, destination board above the
  windscreen (yellow/amber text, Sinhala + Tamil + route number).
- No official logos or emblems — a generic round "route" emblem only.
