# Wayband design guardrails

These rules keep polish work pointed at the game's existing identity.

## The promise

Wayband is a readable real-time party tactics game where players command by
dragging, cast by gesturing, and build heroes without fixed classes. A new feature
must strengthen at least one of those verbs without obscuring the other two.

## First-session progression

1. Learn command and casting without build decisions.
2. Clear Millbrook and receive one understandable reward choice.
3. Meet the Village only after the player has a reason to spend or change the band.
4. Introduce additional heroes before advanced callings and deep equipment sets.
5. Let bosses test learned behaviors—movement, focus fire, threat, and telegraphs—not hidden rules.

When several rewards unlock together, present the most immediately actionable
one first and leave the rest discoverable from the map navigation.

## Combat readability

- A hero silhouette must remain recognizable at normal gameplay scale.
- Windups and dangerous ground outrank decorative particles in contrast and motion.
- Hero, enemy, target, and hazard colors must remain distinct in Safe Colors mode.
- Every gesture ability needs a visible origin, preview, destination, and release response.
- Animation should communicate state—moving, winding up, casting, hit, or disabled—before personality flourish.

The cutout-hero draft PR is compatible with this direction if its animation stays
readable at gameplay scale and its dye layers preserve team and equipment cues.

## Scope rule

Do not add another progression system until the first 20–30 minutes meet the
playtest thresholds in `PLAYTEST.md`, critical save and battle flows remain green,
and Normal difficulty has no unexplained stage cliff.
