# Wayband

A Battleheart-style real-time party tactics game for the browser — with two twists:
**classless heroes** and **gesture spellcasting**. Built with TypeScript and HTML5
canvas; no engine, no runtime dependencies. Designed for phones (touch-first,
landscape) and desktops alike.

This replaces the earlier Unity prototype (*Wayfarer: Classless RPG V0*), which
lives on in the git history and carried its classless-attribute DNA into this game.

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
- **Ability buttons** sit under each hero's portrait. Instant abilities fire on
  tap. Gesture abilities (marked with a dot) are aimed by pressing the button and
  dragging onto the field — draw a ray for Piercing Shot and Frostwake, drop a
  reticle for Fireball, release on an ally for Mend.
- **Pause** (top-right or Esc) for restart, retreat, and sound/music settings.

## Classless heroes

Every hero has five attributes — Strength, Dexterity, Intellect, Vitality,
Spirit — and you allocate points freely between battles (respec is free). There
are no classes:

- Your **auto-attack weapon morphs** with your dominant stat: Strength → sword,
  Dexterity → bow, Intellect → arcane staff.
- **Abilities unlock at stat thresholds** (Cleave at STR 6, Fireball at INT 6,
  Warcry at STR 12, Bulwark at VIT 10, ...). Any hero can learn any of the nine;
  equip up to three.
- Anyone can be molded into a tank-mage, a healing archer, or whatever the band
  needs.

The band shares XP from wave battles across a six-stage campaign; progress saves
to localStorage.

## Architecture

- `src/data.ts` — all tuning: heroes, attributes, derived-stat formulas, the nine
  abilities and their gates, enemies, and stage/wave definitions.
- `src/battle.ts` — the simulation: orders, enemy AI (aggro, taunts, kiting
  snipers, healing shamans, a boss), abilities, projectiles, ground zones, waves.
- `src/hud.ts` — in-canvas battle UI and the drag/gesture input model.
- `src/render.ts` / `src/fx.ts` — hand-drawn vector characters, staged
  backgrounds, particles, floating text, screen shake.
- `src/menus.ts` — DOM screens: title, stage map, party training.
- `src/audio.ts` — fully synthesized WebAudio sound and music (no audio assets).
- `src/save.ts` — localStorage persistence, XP/levels, respec.
- `src/main.ts` — game loop, canvas scaling, pointer wiring, screen flow.

A `window.__wayband` debug hook exposes the live battle for automated testing.
