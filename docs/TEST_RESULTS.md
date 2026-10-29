# Test results — Dolphin AutoTrack prototype

**Run:** 28 October 2026
**Machine:** Windows 11 · Google Chrome (headless, driven over the DevTools
Protocol) · Node 22
**App under test:** the static files in this folder, served by
`python -m http.server 8080` — no build step, no bundler, no server code.

Everything below is the result of actually running the suites in this
folder. **No case is marked as passed that was not executed.** Where a case
could not be tested, it is listed in section 9 instead of being counted.

---

## 1. How to reproduce

```bash
cd C:/KMUTT/DolphinPrototype
python -m http.server 8080        # any static server works

node tools/journey.js             #  28 checks
node tools/scenarios.js           #  25 checks
node tools/exceptions.js          #  68 checks
node tools/screens.js             # 288 checks
node tools/checklist.js           #  42 checks
node tools/checklist2.js          #  28 checks
node tools/constraints.js         #   9 checks
node tools/shots.js               # writes 37 PNGs into screenshots/
```

Every suite exits non-zero when a check fails, so they can be used as a gate.
The raw output of the last run is kept in `docs/_testlogs/`.

The suites drive the **real DOM** — they click buttons, change radios and
checkboxes, type into fields and submit forms — and then assert on the
shared in-memory state (`Store.state`), never on pixels. The only direct
writes to the state are: a UI selection (`Store.state.selectedVehicleId`), a
deliberate corruption used to prove that presets are deep copies
(`Store.state.items[0].onHand = 99`), and the `Store.dirty` unsaved-input
flag used to swap scenario without a confirmation dialog.

---

## 2. Summary

| Suite | File | Checks | Result |
|---|---|---:|---|
| Main journey (P01, end to end) | `tools/journey.js` | 28 | **28 pass, 0 fail** |
| Presets, deep copy, resets, roles | `tools/scenarios.js` | 25 | **25 pass, 0 fail** |
| The P02–P16 exception presets | `tools/exceptions.js` | 68 | **68 pass, 0 fail** |
| 20 screens × 5 roles, layout and a11y sweep | `tools/screens.js` | 288 | **288 pass, 0 fail** |
| The written rules of the build guide | `tools/checklist.js` | 42 | **42 pass, 0 fail** |
| The remaining secondary paths | `tools/checklist2.js` | 28 | **28 pass, 0 fail** |
| No backend, no storage, no network | `tools/constraints.js` | 9 | **9 pass, 0 fail** |
| **Total** | | **488** | **488 pass, 0 fail** |

Each suite also ends with a "no console errors" check, so an uncaught
exception anywhere in the run fails the suite.

---

## 3. Main journey — `tools/journey.js` (28/28)

Starts from **Reset all**, then walks the P01 route: check-in → bay
assignment → inspection and quote → approval → material issue → completion →
payment → collection → closure.

| # | Check | Result |
|---|---|---|
| 1 | reset all → P01 | Pass |
| 2 | S02 shows the vehicle | Pass |
| 3 | check-in created JOB-2026-0008 | Pass |
| 4 | check-in values | Pass |
| 5 | assign modal open | Pass |
| 6 | bay 2 + Aung assigned | Pass |
| 7 | S07 draft open | Pass |
| 8 | draft seeded with brake labour 40,000 | Pass |
| 9 | brake part line added at 20,000 | Pass |
| 10 | quoting does not deduct stock | Pass |
| 11 | quote total 60,000 and approval needed | Pass |
| 12 | quote v1 submitted as Pending | Pass |
| 13 | sent to the approval screen | Pass |
| 14 | approval recorded | Pass |
| 15 | labour committed to the job | Pass |
| 16 | work started | Pass |
| 17 | issue modal open | Pass |
| 18 | one part issued, stock 5 → 4 | Pass |
| 19 | purchase cost snapshot 12,000 | Pass |
| 20 | fully issued line is disabled, stock stays 4 | Pass |
| 21 | repair completed and bay released immediately | Pass |
| 22 | payment still open after completion | Pass |
| 23 | receipt RC-2026-0002 for 60,000 | Pass |
| 24 | cash 100,000 applied 60,000 change 40,000 | Pass |
| 25 | vehicle collected | Pass |
| 26 | close dialog open | Pass |
| 27 | job closed and in history | Pass |
| 28 | no console errors | Pass |

Final state after the run: work Completed, payment Paid, vehicle Collected,
job Closed, stock 4, 2 receipts, 2 payments, 1 stock movement.

---

## 4. Presets, deep copy, resets and roles — `tools/scenarios.js` (25/25)

| # | Check | Result |
|---|---|---|
| 1 | 16 presets in the fixture | Pass |
| 2 | demo panel lists 16 presets | Pass |
| 3 | panel has Reset scenario and Reset all | Pass |
| 4–19 | preset P01 … P16 loads completely (one check each, 16 checks) | Pass |
| 20 | presets are deep copies, not merged | Pass |
| 21 | reset scenario restores the preset | Pass |
| 22 | reset all → P01 and Cashier | Pass |
| 23 | refresh resets to P01 | Pass |
| 24 | switching role keeps the state | Pass |
| 25 | mechanic sees only assigned jobs | Pass |

---

## 5. The exception presets — `tools/exceptions.js` (68/68)

One documented demonstration per preset.

| Preset | Checks | Result |
|---|---|---|
| P02 approval | pending 60,000 quote · approval unlocks the job · a decline blocks the work | Pass (3) |
| P03 material issue | starts with 5 on hand · one issue 5 → 4 with one movement · the movement is a signed issue | Pass (3) |
| P04 extra work, cancel, return | one part already issued · extra-work draft v2 · extra work below 50,000 still needs approval · the new version is pending while v1 continues · cancel asks for a reason · cancel releases the bay and keeps the record · the returnable issue is offered · a recoverable return puts the part back (4 → 5) | Pass (8) |
| P05 shortage | Waiting for Parts keeps the bay · the shortage is shown | Pass (2) |
| P06 completed, unpaid | bay already free · the seeded receipt is not replayed | Pass (2) |
| P07 paid, corrections | paid but not collected · no extra receipt on load · a reprint does not create a second receipt · the COPY is labelled · the charge sample prefills −5,000 / +5,000 · the correction is recorded and the effective charge is 55,000 · a method correction is recorded · a paid job offers no new quote version · the paid quote is unchanged | Pass (9) |
| P08 zero-charge Redo | opens on the linked zero-charge Redo · the link to the original is shown · a paid job can take a further linked Redo · the Redo is assigned to a bay and a mechanic · the Redo can be worked like any other job · completing the Redo releases its bay · a zero-charge Redo offers "Settle as no charge" · the zero-charge Redo gets a zero-total receipt and no payment | Pass (8) |
| P09 prices, promotions, discounts | the catalogue has the demo promotion · the S wash-and-polish promotion gives 12,000 · the discount approval action exists · the Cashier reaches the discount request but not the catalogue · the 40,000 MMK labour sample is offered · the preview shows 36,000 after 10 % · the 10 % request is recorded as pending · a Manager may approve 10 % · the preview shows 34,000 after 15 % · a Manager is told that 15 % needs the Owner · the Owner may approve 15 % · a promoted service line is quoted at 12,000 | Pass (12) |
| P10 bookings | the fixture bookings are loaded · the no-show check cancels the overdue booking once · running it twice does not cancel twice | Pass (3) |
| P11 stock | opens with 5 on hand and no replayed movement · the purchase-order form is on screen · creating a purchase order does not change stock · a count of 4 gives a −1 movement and a final balance of 4 | Pass (4) |
| P12 closing | the expected 60,000 / 30,000 / 20,000 are shown · a 500 difference is shown for WavePay · an explanation field is required when a difference exists · the closing is saved | Pass (4) |
| P13 import | the sample rows create a staging preview · valid, duplicate and error counts are shown · the import is blocked while errors remain · the corrected sample removes the blocking error · the import adds the two new vehicles and skips the duplicate | Pass (5) |
| P14/P15 reports | revenue 60,000, cost 12,000, profit 48,000, commission 4,000, 2,000 each, contribution 44,000 · shows Incomplete cost and Not configured commission | Pass (2) |
| P16 reminders | lists the service-due job and the uncollected job · the follow-up form is present | Pass (2) |
| — | no console errors during the exception run | Pass (1) |

---

## 6. Screen sweep — `tools/screens.js` (288/288)

This suite prints only its failures, so it is described by category here.
It runs **every screen for every role** (S01–S20 × Owner, Manager, Cashier,
Aung, Min).

| Category | What it asserts | Checks |
|---|---|---:|
| The view renders | the screen is implemented (no "not implemented" placeholder) and produces no console error, for each role × screen | 100 |
| The view is reachable | an allowed screen is actually entered; an unallowed one is refused | 63 |
| Desktop audit (1440 px) | no horizontal overflow, every form control has a label, every button has a visible name — on each of the 20 screens | 60 |
| Mobile audit (390 px) | the same three audits at narrow width | 60 |
| Focus and sizing | keyboard focus shows a visible focus ring · body text is 16 px · controls are at least ~32 px tall · narrow width has a menu button | 4 |
| Console | no console errors during the sweep | 1 |
| **Total** | | **288** |

How many screens each role may open (63 in total): Owner 20, Manager 19,
Cashier 12, Aung 6, Min 6. The other 37 role/screen combinations are refused
and land the user on an allowed view.

---

## 7. The written rules of the build guide — `tools/checklist.js` (42/42)

| Group | Checks | Result |
|---|---|---|
| A — first open, demo controls, access | A1 opens on P01 with the Cashier role · A2 demo controls lists all 16 scenarios plus both resets · A3 a Manager cannot open the Owner settings screen | Pass (3) |
| B — money and approval | B1 receipt rounds once to the nearest 100, half up (60,149 → 60,100; 60,150 → 60,200) · B2 approval above 50,000 but not at exactly 50,000 · B3 a line discount counted once (40,000 − 4,000 = 36,000) · B4 a third of 33,333 rounded half up to 3,333 → 30,000 | Pass (4) |
| C — registration | C1 case-insensitive plate search · C2 a duplicate plate is rejected · C3 a future year is rejected · C4 a valid registration adds one vehicle | Pass (4) |
| D — check-in | D1 an empty mileage is not zero · D2 a vehicle with an open visit gets no second open job | Pass (2) |
| E — bay board | E1 the Cashier sees no assignment controls · E2 a bay reserved by a booking is refused with a replan reason | Pass (2) |
| F — approval and extra work | F1 a Mechanic cannot record the customer decision · F2 extra work creates v2 of 61,000 needing a new approval while v1 stays approved · F3 the authorised work continues while the extra version is pending · F4 a declined extra version leaves v1 usable until it is withdrawn · F5 a Cashier cannot withdraw declined extra work · F6 a Manager can withdraw it | Pass (6) |
| G — stock | G1 a shortage issues nothing and leaves the stock at 5 · G2 the goods-receipt form needs supplier, item and unit · G3 a count of 4 gives a −1 movement and a final balance of 4 · G4 a write-off larger than the stock on hand is refused · G5 oil accepts a fractional litre and appends one movement | Pass (5) |
| H — payment | H1 an underpayment is refused with an explanation · H2 a wallet payment asks for a demo reference and a "Verified (demo)" tick · H3 posting twice creates only one receipt and one payment | Pass (3) |
| I — reminders | I1 the service-due and awaiting-collection queues list the right jobs · I2 a completed job becomes eligible exactly three days after completion, not a minute earlier | Pass (2) |
| J — bookings | J1 a booking whose end is not after its start is refused with a reason · J2 the overdue booking is still open before the no-show check runs | Pass (2) |
| K — catalogue | K1 the catalogue lists the demo promotion and a supplied Myanmar service label | Pass (1) |
| L — import | L1 all six import types are offered | Pass (1) |
| M — commission | M1 a demo payout can be recorded from the commission tab · M2 the payout is recorded as paid out and the receipt revenue is unchanged | Pass (2) |
| N — settings and language | N1 the settings page exposes the bay enable flags · N2 the Myanmar preview is marked as a partial translation with an English fallback · N3 the supplied Myanmar service label is shown in the MM preview · N4 a job screen shows the supplied Myanmar service label in the MM preview | Pass (4) |
| — | no console errors during the checklist run | Pass (1) |

---

## 8. The remaining secondary paths — `tools/checklist2.js` (28/28)

These are the paths the two suites above did not reach: registration of a new
customer, supplier and purchase-order forms, duplicate goods receipts,
follow-up notes, catalogue price versioning, the remaining stock-adjustment
dispositions, an oversized refund, the import merge path, the commission
adjustment path, the bay-disable guard and the two reminder queues.

| # | Check | Result |
|---|---|---|
| O1 | registering a new customer and vehicle adds one of each | Pass |
| O2 | a registration with a missing name and a duplicate plate is refused with reasons | Pass |
| P1 | a supplier can be created with a name and a contact note | Pass |
| P2 | a supplier can be archived and the record is kept | Pass |
| P3 | the purchase-order form asks for a supplier, an item and a quantity | Pass |
| Q1 | a goods receipt of 5 pieces at 12,000 raises the balance by 5 | Pass |
| Q2 | the same supplier, reference and item is not received twice | Pass |
| R1 | the follow-up form asks for a channel, an outcome and a note | Pass |
| R2 | a follow-up note is recorded in the demo state | Pass |
| S1 | a catalogue service carries a price version and a price | Pass |
| S2 | the Owner can open a catalogue service for editing | Pass |
| T1 | a supplier return takes one piece off the balance and appends one movement | Pass |
| T2 | a supplier return larger than the stock on hand is refused | Pass |
| T3 | a count appends its own movement and sets the balance to the counted quantity | Pass |
| T4 | the same movement type for the same item is posted once per session | Pass |
| T5 | a write-off of one consumable takes the balance to zero with one movement | Pass |
| U1 | a refund larger than the amount collected is refused | Pass |
| V1 | the corrected import sample can be staged and a duplicate row can be marked for merge | Pass |
| V2 | the merge has to be confirmed row by row before the import runs | Pass |
| V3 | the simulated import creates the two new vehicles and merges the duplicate row | Pass |
| W1 | a demo payout is recorded for the earned share | Pass |
| W2 | after the rule changes the row offers an adjustment instead of a second payout | Pass |
| W3 | the adjustment records only the difference and leaves the receipt revenue unchanged | Pass |
| X1 | a bay with an active assignment cannot be switched off | Pass |
| X2 | a bay with no assignment can be switched off | Pass |
| Y1 | the service-due queue lists the job whose stored service date has passed | Pass |
| Y2 | the collection queue lists the completed job that is still uncollected | Pass |
| — | no console errors during the second checklist run | Pass |

---

## 9. The frontend-only constraints — `tools/constraints.js` (9/9)

These checks are the evidence for the "no database, no backend, no server
APIs, no real authentication, no payment integration, no messaging, no
localStorage/IndexedDB/persistent storage, no background jobs" requirement.

| # | Check | How it is verified | Result |
|---|---|---|---|
| 1 | the shipped source uses no browser storage, no network API, no worker and no eval | a static scan of `index.html`, `js/**` and `css/**` (37 files) for `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `serviceWorker`, `new Worker(`, `eval(`, `new Function(` — 0 hits | Pass |
| 2 | the page loads no external file, font or script | `index.html` contains no `http(s)://` source or link | Pass |
| 3 | the page writes nothing to localStorage, sessionStorage or cookies | read in the running page after a full journey | Pass |
| 4 | the page makes no request to any other origin | the DevTools Network domain is enabled for the whole run: every request went to `http://127.0.0.1:8080/` — the prototype's own files — and 0 foreign | Pass |
| 5 | no service worker controls the page | `navigator.serviceWorker.controller` is null | Pass |
| 6 | no screen asks for a password — there is no login | all 20 screens are opened and searched for `input[type="password"]` — 0 found | Pass |
| 7 | a refresh throws the session away and comes back to P01 and the Cashier role | P11 + Owner are loaded, the page is reloaded, and the app is back at P01 / Cashier | Pass |
| 8 | the storage is still empty after a reload | read again after the reload | Pass |
| 9 | no console errors during the constraint run | console and exception listener | Pass |

---

## 10. Where each written rule is checked

| Rule from the build guide | Checked by |
|---|---|
| Staff-only access views | checklist A3; screens 63 "reachable" checks; journey (Cashier/Manager/Mechanic steps) |
| A mechanic sees assigned jobs only | scenarios 25; journey 5–10 |
| Approval for an initial repair above 50,000 MMK | checklist B2; journey 11–14; exceptions P02 |
| Approval for **every** extra-work version | checklist F2, F3, F4, F6; exceptions P04 |
| Quote editing does not deduct stock | journey 10 |
| An explicit approved material issue deducts once | journey 18–20; exceptions P03; checklist G1 |
| Stock never goes negative | checklist G4; checklist2 T2 |
| Movements are appended, never rewritten | checklist G3, G5; checklist2 T1, T3, T5 |
| Completion releases the bay immediately | journey 21, 22; exceptions P06 |
| Full payment only | checklist H1 |
| Wallet needs a simulated reference and a verified tick | checklist H2 |
| Collection after settlement | journey 25 |
| Closure after completion, settlement and collection | journey 26, 27 |
| A paid price history stays locked | exceptions P07; checklist F4 |
| Corrections retain the original entries | exceptions P07; checklist2 U1 |
| Receipt rounding once, half up | checklist B1, B3, B4 |
| One promotion per line, lowest price wins, no stacking | exceptions P09; checklist K1 |
| Discounts: Manager to 10 %, Owner above | exceptions P09 |
| Full payment creates one receipt and one payment | checklist H3; journey 23, 24 |
| Presets are deep copies, never merged, never replayed | scenarios 20–23; exceptions P07, P11 |
| The commission rate is illustrative only | checklist M1, M2; checklist2 W1–W3; README §10.3 |
| Myanmar labels only where supplied, English fallback elsewhere | checklist N2–N4 |

---

## 11. What is **not** covered

Honest list of the gaps. None of these is counted as a pass above.

1. **There was no original feature-checklist file to mark off.**
   `04_Feature_Test_Checklist.md` was not included in the handoff pack (nor
   were `00_READ_ME_FIRST.md`, `03_Flows_and_Demo_Script.md`,
   `05_UI_Design_Guide.md` and `08_Requirements_Coverage.md`). The checklists
   in this folder were therefore **derived from `reference/01_Codex_Build_Guide.md`**
   — its "non-negotiable behaviour" list and its per-screen specifications.
   If the original checklist file appears later, it should be compared
   line by line against sections 3–9 above; the acceptance criteria may not
   match one to one.
2. **No real integration is tested, because the prototype must not have
   one.** There is no authentication, payment gateway, messaging, database
   or background worker to test. Section 9 verifies their *absence* instead
   — it cannot verify that a real integration behaves correctly.
3. **Only Chromium was tested.** The suites drive the Chrome DevTools
   Protocol; Firefox and Safari were not available on this machine, so no
   cross-browser result is claimed. The app uses no framework and no
   browser-specific API beyond `fetch`-free standard DOM, but that is an
   argument, not a test.
4. **The visual result was compared by eye, not pixel-diffed.** The 20
   reference PNGs were read and matched by hand (warm ivory background,
   white cards, dark text, restrained orange action, one sidebar, the same
   table and card shapes). There is no automated image comparison, so
   "matches the design guide" is a judgement, not a measurement.
5. **Some screens were opened but not every button on them was pressed.**
   The 288-check screen sweep proves every screen renders for every role,
   is reachable or refused, has no overflow, has labels and has visible
   focus. The *behaviour* of a button is covered by the journey, exception
   and checklist suites — for the buttons those suites do not exercise, the
   evidence is "the button exists and is enabled", not "the button works".
6. **Only the English interface was walked end to end.** The Myanmar
   preview is checked for the supplied service labels and the
   partial-translation notice (checklist N2–N4); the rest of the Burmese
   interface words are placeholders and were not proofread.
7. **The commission rate is a fixture value, not a business value.** The
   10 % in P14 is illustrative and labelled as such in the app. No check
   can confirm that it is a real workshop rate, because it is not one.
8. **Performance was not measured.** There are no timing assertions and no
   load tests; the prototype holds one in-memory snapshot.
9. **Nothing was deployed.** The app was served locally only. No public
   URL exists, and no deployment was requested.

---

## 12. Changes made to the app during this test round

* **S20 — the bay switch is put back when a save is refused.** Before the
  fix, unchecking a bay that still had a job in it showed the error
  *"This bay has JOB-2026-0006 in it…"* but left the switch visually off,
  while the demo state still had the bay enabled. The checkbox is now
  restored to the stored value when the save is refused
  (`js/act-settings.js`). No rule changed — the bay is still refused, and
  the state is still unchanged; only the switch no longer lies about it.
* **The demo controls panel had two nested scrollbars.** The preset list
  scrolled inside a panel that also scrolled, so on a short window the
  *Reset scenario* and *Reset all* buttons fell below the fold and the
  list was cut mid-row. The panel is now a flex column with a single
  scroll area: the head (current preset and role) and the reset buttons
  stay put, the preset list scrolls on its own with a soft fade at the cut,
  and the panel is capped to the window height so it never runs off the
  bottom (`css/styles.css`, `js/app.js`). The current preset and the role
  are now shown as readable stacked lines instead of two cramped uppercase
  labels side by side.

Everything else in the app behaved as specified and was left alone.

---

## 13. Manual and visual checks

* **Desktop 1440 px** — every screen swept for overflow, labels, button
  names and console errors (section 6).
* **Narrow mobile 390 px** — the same sweep at 390 × 844, plus the drawer
  check, and the whole main journey re-run at that width.
* **The main journey after a reset** — `tools/journey.js` starts with
  *Reset all* and walks P01 to a closed job; `tools/scenarios.js` checks
  that *Reset all* and a page refresh both return to P01 with the Cashier
  role.
* **37 screenshots** in `screenshots/`: 14 desktop journey, 15 exception
  presets (one per P02–P16), 8 narrow-mobile (390 px).
