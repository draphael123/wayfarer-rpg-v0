# Wayband Playtest Kit

## Sharing a build
Send your tester the game link (the claude.ai artifact, or the Vercel URL once
connected). Ask them to open it on a phone in landscape and play for 10 minutes
with **no coaching** — the tutorial has to carry them.

## Observation checklist (watch silently, tick what happens)
- [ ] Finds and starts the tutorial without prompting
- [ ] First unprompted move order within 30 seconds of battle 1
- [ ] Successfully casts a gesture spell on the first attempt
- [ ] Discovers the heal drag without being told
- [ ] Notices the stance chip / toggles it
- [ ] Visits the Village before being told it exists
- [ ] Understands why they lost after a defeat (ask: "what killed you?")
- [ ] Dodges the Alpha's pounce circle at least once
- [ ] Any moment of visible delight (note what caused it)
- [ ] Any moment of visible confusion (note the screen they were on)

## Collecting data
After the session: title screen → Settings → **Export playtest data** copies a
JSON log of battles (duration, result, deaths, ability usage, difficulty) to
the clipboard. Have the tester paste it back to you. **Export save** likewise
copies their progress so you can reproduce their state.

## Questions to ask afterwards
1. What were you trying to build? (checks whether classless design landed)
2. Which spell felt best to use? Which felt useless?
3. What would you spend your next 100 gold on?
4. When did you feel strongest? Weakest?
5. Would you play again tomorrow? Why / why not?
