# Wayband

A Battleheart-style real-time party tactics game for the browser, built around
**elemental paths** and **gesture spellcasting**. Built with TypeScript and HTML5
canvas; no engine, no runtime dependencies. Designed for phones (touch-first,
landscape) and desktops alike.

This replaces the earlier Unity prototype (*Wayfarer: Classless RPG V0*), which
lives on in the git history and carried its freeform attribute DNA into this game.

## Play

Deployed at the project's Vercel URL. Locally:

```sh
npm install
npm run dev     # esbuild watch + local server
```

then open the printed URL. `npm run build` bundles `src/` into `dist/game.js`
(committed, so the site deploys as plain static files). `npm run check` typechecks.

## How to play

- **Drag a hero** onto open ground to move, onto an enemy to attack, onto an ally
  to channel healing (healing rate scales with that hero's Spirit).
- **Tap a hero** to select, then tap an enemy to send them in.
- **Double-tap a foe** to focus every available fighter on the same target.
- **Ability buttons** sit under each hero's portrait. Instant abilities fire on
  tap. Gesture abilities (marked with a dot) are aimed by pressing the button and
  dragging onto the field — draw a ray for Piercing Shot and Frostwake, drop a
  reticle for Fireball, release on an ally for Mend. Hold a technique to read its
  full description without casting it.
- **Pause** (top-right or Esc) for restart, retreat, and sound/music settings.

## Elemental paths

Every hero still grows through five freely trained attributes — Strength,
Dexterity, Intellect, Vitality, and Spirit — but their battle identity comes
from two readable choices:

- A **discipline** determines how they fight: Knight, Rogue, Archer, Priest, or
  Mage. It controls weapon, range, movement, and party role.
- An **attunement** determines what their power does: Flame, Frost, Storm,
  Earth, Venom, Radiant, Blood, or Shadow.
- The pairing becomes a named path. An Earth Knight is a Stonewarden; a Shadow
  Rogue is a Nightblade; a Radiant Mage is a Luminary. Every pairing has two
  normal techniques, a passive, and a charged ultimate.

Heroes choose a path at level 5. Ten levels spent with an attunement unlock its
Elemental Legacy for use with another discipline. At level 20, a mastered path
can take one of two promotions. Armor remains passive, so combat stays focused
on exactly two techniques plus one ultimate.

Enemies can have one discoverable elemental weakness and one resistance. These
are tactical advantages rather than hard counters: there are no elemental
immunities and boss modifiers are deliberately gentler. Every species also has
one fixed, readable combat role. Elemental hits build toward Burning, Frozen,
Conductive, Brittle, Poisoned, Exposed, Bleeding, or Shrouded conditions, and
counter-hits consume selected conditions for a short reaction bonus. Authored
waves cap must-answer priority enemies at one early and two later in the road.

You set out with Bram and Sol, then recruit and shape a larger company as the
road opens. Heroes earn personal XP, levels, boon choices, equipment, and one
talent point per level after the first. Each Discipline offers three connected,
five-row talent trees with ranked skills, prerequisites, and build-changing
keystones, followed later by Path promotions. The sixty-stage campaign is one continuous Long
Road across ten regions, from the South Road and Winterreach through Stormbreak,
the Cinderwild, Verdant Maw, Nightglass Waste, Shattered Reliquary, Skygrave,
Bloodwood, and the Last Meridian. Twelve great bosses and seven named late-road
elites anchor the journey, and
the illustrated atlas advances section by section instead of splitting the game
into disconnected level lists. A bestiary catalogues every foe you've slain with lore and tactical
notes. The dedicated Wayfinder's Kit separates sound, battle, readability, and
campaign settings. Combat pace, aim slowdown, warning time, AUTO defaults, health
bars, contextual hints, color-independent danger boundaries, motion, and text size
can all be tuned without changing rewards. A Field Handbook combines a quick
reference with four replayable, action-checked lessons and records completion.
Progress saves to localStorage, with six independent campaign slots plus export/import.

Before each stage, a preparation table summarizes the active band, lets you
choose an opening formation, and surfaces tactical notes for creatures already
recorded in the bestiary. The map can hold a pinned expedition goal, restored
locations change after victories, and recent clears become dated pages in the
Chronicle.

Stormbreak Coast adds twelve coastal foes and two battlefield rules: a tide that
periodically slows units caught in the flooded lower field, and telegraphed
lightning strikes that become more dangerous at high tide. Its bosses, the Bell
Widow and Stormjaw, turn those rules into position-focused encounters.

Acts IV–X each introduce three signature regular enemies, a named elite with a
dedicated rare reward, an active battlefield rule, a regional sound palette,
and a one-off final-boss silhouette. Their warnings use different shapes
and plain-language countdown labels, so eruption, roots, eclipse, verdict beams,
crystal shatters, marked charges, and voids remain readable even without color.
The final Way-Eater recalls those learned patterns as a capstone. Boss victories
grant named rare curios, while late-game Road Tutelage lets gold catch inactive
companions up one level at a time without ever pushing them past the active band.

## Architecture

- `src/data.ts` — all tuning: heroes, elemental paths and techniques,
  attributes, derived-stat formulas, enemies, and stage/wave definitions.
- `src/late-road.ts` / `src/late-content.ts` — the seven late regions, their
  atlas art, three-role enemy ecosystems, elites, bosses, affinities, and encounter promises.
- `src/battle.ts` — the simulation: orders, enemy AI (aggro, taunts, kiting
  snipers, healing shamans, a boss), abilities, projectiles, ground zones, waves.
- `src/hud.ts` — in-canvas battle UI and the drag/gesture input model.
- `src/render.ts` / `src/fx.ts` — hand-drawn vector characters, staged
  backgrounds, particles, floating text, screen shake.
- `src/menus.ts` — DOM screens: title, atlas, party, handbook, and settings ledger.
- `src/audio.ts` — regional WebAudio music/ambience with a small optional
  recorded layer and synthesized fallbacks. Track sources and licenses are
  recorded in `audio/LICENSES.md`.
- `src/save.ts` — localStorage persistence, XP/levels, respec.
- `src/main.ts` — game loop, canvas scaling, pointer wiring, screen flow.

## Quality checks

```sh
npm run validate
npm run balance
npm run economy
```

This typechecks the game, validates campaign content and cross-references, and
produces the same minified bundle used by the static deployment. GitHub Pages
runs the full validation before publishing `main`. The separate balance command
runs seeded elemental reference parties across every stage and difficulty. The
economy report models first-clear gold, XP, recruits, gear and Path-change
affordability; it is also included in the full validation.

A `window.__wayband` debug hook exposes the live battle for automated testing.
