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
After the session: open **Settings** from the title or bottom-bar gear, choose
**Campaign**, then **Copy playtest report**. This copies a
JSON log of battles (duration, result, deaths, ability usage, difficulty) to
the clipboard. Have the tester paste it back to you. **Export save** likewise
copies their progress so you can reproduce their state.

## Questions to ask afterwards
1. What discipline and element did you choose, and what did you expect that combination to do?
2. Which technique felt best to use? Which felt useless?
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

Run `npm run balance` to produce a deterministic six-seed report for every stage
and difficulty. The reference party earns its levels from earlier clears and
uses real Discipline + Attunement Paths with two techniques and an ultimate.
Set `BALANCE_SEEDS` to 1–24 for a faster smoke test or a denser tuning sample.
Use it to catch regressions and difficulty cliffs—not as a substitute for
players who dodge, focus targets, and choose builds deliberately.

Run `npm run economy` to audit the conservative Normal first-clear floor. It
tracks recruit timing, personal XP milestones, weapon and role-kit purchases,
Path-change costs, and the remaining purse without counting random loot or side
activities.

For Act III, verify that the tide line is readable without obscuring units, the
terrain status chip changes before high tide, lightning warnings allow time to
move, and both coast bosses remain winnable on Normal with a prepared four-hero
band. Record whether players understand that high tide turns lightning into a
brief stun without being told twice.

For Acts IV–X, sample at least one approach stage and the boss of each region.
Ask the tester to name the promised attack before it lands: eruption, roots,
eclipse, verdict beam, shatter, marked charge, or void. A warning fails if its
shape, countdown label, and safe space disagree. Confirm that each signature foe
teaches the same rule later used by its boss, and that the Way-Eater's recalled
patterns feel learned rather than random.

At the Tavern after stage 18, verify that Road Tutelage appears only for
inactive companions behind the active band, buys exactly one level, charges the
displayed amount, grants one talent mark and automatic attribute growth, and disappears when the pupil
catches the active party. It must never raise an active hero or create a new
highest-level hero.

## Path and Specialization checks

- Compare the same element on at least three Disciplines. Confirm that its name,
  targeting, resource loop, and party job read as different solutions rather
  than a damage spell, control spell, and recolored heal.
- On a level-20 hero, compare both Specializations. Each branch should change a
  decision in the three-button combat loop, not merely raise a stat.
- Advance ten levels while a Specialization is active. Its mastery bar should
  reach ten, mark the Legacy technique mastered, and add that technique to the
  Battle Bar picker on a different Path.
- Equip the mastered Legacy technique on W after changing element. Confirm it
  retains the old Discipline's geometry but applies the new Path's elemental
  condition. Q and the Path ultimate must remain unchanged.
- Verify Warrior Fury and Necromancer Remains appear on the combat portrait,
  rise from their intended actions, and are spent by their focus techniques.
- Before hiring a companion, ask the tester what the Tavern card implies about
  Q, W, R, Discipline, and element. After hiring, verify that exact Path and
  battle bar arrive equipped, with zero free mastery progress.
- Compare the sibling master specs using the Rhythm, Payoff, and Gives up rows.
  The tester should be able to explain the decision without translating a list
  of small percentage bonuses.
