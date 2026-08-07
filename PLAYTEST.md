# Wayband Playtest Kit

## Test format

Run at least five first-session tests before changing onboarding or early-stage
balance. Give each tester the deployed link, ask them to use a phone in landscape,
and let them play for 10 minutes with **no coaching**. The tutorial and interface
must carry them. Record the device, browser, whether they usually play RPGs, and
whether they chose practice or skipped it.

Do not explain a control until the session ends. If the tester becomes completely
stuck, record the time and screen before helping; that moment is the finding.

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

## Timing checkpoints

- Time to press **Begin Your Journey**
- Time to issue the first move or attack order
- Time to cast the first ability successfully
- Time to complete or abandon the practice lesson
- Time to start Millbrook Fields
- Result and duration of the first campaign battle
- First screen visited after that battle

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

## Decision rules

- If fewer than 4 of 5 testers finish practice, revise the lesson before combat balance.
- If fewer than 4 of 5 start Millbrook within 10 minutes, simplify the map or post-tutorial handoff.
- If fewer than 3 of 5 understand gesture aiming on the first try, change the gesture affordance and repeat the test.
- If Normal Millbrook wins fall below 3 of 5, improve feedback or early survivability before lowering the whole campaign.
- A change graduates only when it improves the observed failure without creating a new one in the same flow.

## Balance lab

Run `npm run balance` to produce a deterministic 12-seed report for every stage
and difficulty. It uses reference parties and AUTO behavior, so use it to catch
regressions and difficulty cliffs—not as a substitute for players who dodge,
focus targets, and choose builds deliberately.

For Act III, verify that the tide line is readable without obscuring units, the
terrain status chip changes before high tide, lightning warnings allow time to
move, and both coast bosses remain winnable on Normal with a prepared four-hero
band. Record whether players understand that high tide turns lightning into a
brief stun without being told twice.
