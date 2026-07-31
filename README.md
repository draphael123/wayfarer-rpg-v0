# Wayfarer: Classless RPG V0

A playable Unity 6 vertical slice for a classless fantasy action RPG.

## Play online

[Launch Wayfarer V0](https://wayfarer-rpg-v0.vercel.app)

## Open and play

1. Open this folder in Unity Hub with Unity 6000.5.5f1 (or a compatible Unity 6 editor).
2. Open `Assets/Scenes/Arena.unity`.
3. Press Play.

The scene builds itself at runtime; there are no packages or external assets to download.

A prebuilt Windows version is available in the local workspace at `Builds/Windows/WayfarerV0.exe`; generated builds are intentionally excluded from Git.

The project also includes an editor build command for WebGL (`BuildPrototype.BuildWebGL`) for browser deployment.

## Controls

- Drag the hero — move and reposition
- Tap an enemy — target, approach, and auto-attack
- Space — dash
- Q — Power Strike (requires Strength 8)
- E — Fireball (requires Intelligence 10)
- 1–5 — spend earned attribute points on Strength, Dexterity, Intelligence, Vitality, or Spirit
- R — restart after defeat

## V0 systems

- Five attributes with meaningful derived stats
- Abilities separated from player input and gated by attribute requirements
- Three enemy behaviors: goblin pursuit, archer kiting, and slow heavy ogre
- Wave encounters, XP, levels, and attribute point allocation
- Hit flash, impact particles, trails, floating damage, emissive effects, and camera shake
- Runtime primitive art so every placeholder is editable and replaceable

## Architecture

- `CharacterStats` owns progression and derived values.
- `AbilitySystem` owns stat gates, cooldowns, melee hits, dashes, and projectiles.
- `PlayerController` translates input into movement and ability requests.
- `EnemyController` encapsulates behavior independently of presentation.
- `Health` provides a shared damage/death contract for future party members.
- `GameBootstrap` assembles only this prototype arena and can later be replaced by authored scenes/prefabs.

Party control can be added by introducing a selection/input router that targets one or more actors; stats, health, abilities, and enemy targeting do not depend on a singleton player implementation.
