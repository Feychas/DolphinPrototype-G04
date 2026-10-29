# Dolphin AutoTrack — frontend-only prototype

A working, self-contained prototype of the Dolphin AutoTrack internal workshop
management system. It is **frontend only**: plain HTML, CSS and JavaScript,
one shared in-memory state, no build step, no backend, no database and no
browser storage.

Every value in the app is fictional demo data. All money, messages, purchases,
payments and job records are simulated. Nothing is sent anywhere.

---

## 1. Running it

The app is plain static files, so any static file server works. It must be
served over HTTP (not opened as a `file://` path) so the browser will load the
scripts.

```bash
cd C:/KMUTT/DolphinPrototype
python -m http.server 8080
# or: npx serve -l 8080
```

Then open <http://127.0.0.1:8080/index.html>.

Any other static server on another port works too — change the `BASE` constant
at the top of each file in `tools/` if you want to test against a different
port.

**Requirements:** a modern browser and a static file server. No `npm install`,
no build, no dependencies. The test harness uses only Node 22's built-in
`WebSocket` and `fetch`, so there is nothing to install there either.

### First open

The app loads the **P01** fixture with the **Cashier** role on screen
`S02` (Customers). A refreshing the page resets the app to exactly that state.

---

## 2. What is in the box

```
index.html            single page shell — sidebar, topbar, content area
css/styles.css        all styling (warm ivory background, white cards,
                      dark text, restrained orange actions)
js/util.js            dates, money, deep copy, escaping, number helpers
js/store.js           the one shared in-memory state, lookups, role helpers
js/rules.js           every business rule: pricing, approval, stock, bays,
                      commission, permissions
js/ui.js              the shared component kit (cards, tables, forms, modals)
js/actions.js         click and submit handlers
js/act-*.js           feature handlers: bookings, catalogue, reminders,
                      adjustments, closing, import, reports, settings
js/views/s01..s20.js  the twenty screens, one file each
js/app.js             routing, render loop, modals, toasts, demo controls
js/data.js            the 16 scenario snapshots (generated from the fixture)
data/02_Dummy_Data.json  the original fixture, kept unchanged as the source
reference/01_Codex_Build_Guide.md  the written specification
docs/TEST_RESULTS.md     the last test run, case by case
docs/_testlogs/          the raw output of every suite
docs/VIEW_CONTRACT.md    how to add a screen or an action
docs/_*.json             the fixture fragments that js/data.js was assembled from
screenshots/          captured evidence (see section 8)
tools/                the test harness (see section 7)
```

---

## 3. The screens

All twenty screens are implemented. Screen IDs follow the build guide.

| ID | Screen | Notes |
|---|---|---|
| S01 | Dashboard | Owner/Manager see open jobs, free bays, awaiting collection, low stock. Cashier sees operational cards only. Mechanic lands on My jobs. |
| S02 | Customers | Registry and history, search, archived rows. |
| S03 | Customer detail | Vehicle history, service records, next service due. |
| S04 | Check-in | Mileage, size, service, damage, fuel, belongings. Guards: empty mileage is not zero, a vehicle with an open visit cannot get a second open job. |
| S05 | Bay board | Three illustrative bays, available/assigned, plus the completed-uncollected queue. Assignment is Manager/Owner only; booking conflicts show a replan reason. |
| S06 | Job list and detail | Filters, status chips, quote versions, activity. Manager actions: cancel, reopen, linked Redo, archive. |
| S07 | Inspection and quotation | Live quote draft. Editing a quote never touches stock. |
| S08 | Customer approval | Versioned decisions (Approved/Declined + channel + note). Mechanic sees a read-only summary. |
| S09 | Job materials | Explicit material issue against the authorised quote line. A shortage issues nothing and shows Waiting for Parts. |
| S10 | Inventory | Items, suppliers and purchase orders as tabs. |
| S11 | Receive stock | Supplier, reference, date, item, quantity, unit, cost. Duplicate receipts are refused. |
| S12 | Receipts, payment, collection, closure | Itemised draft receipt, cash/wallet payment, collection, close. |
| S13 | Reminders | Service-due and awaiting-collection queues. |
| S14 | Bookings | Requested → Booked, bay assignment, overdue/no-show. |
| S15 | Catalogue | Services, promotions, discount requests. |
| S16 | Stock adjustments | Count, consumable opened, write-off, supplier return, recoverable job return. Before/after preview, append-only ledger. |
| S17 | Daily closing and corrections | Opening float, non-sales cash, counted vs expected. Corrections keep the old value. |
| S18 | Import preview | Six import types, staging, duplicate and error handling, nothing is written until confirmed. |
| S19 | Reports and commission | Revenue, collections, material cost, service performance, inventory, illustrative commission, promotions, Redo. |
| S20 | Demo settings | Owner only. Language preview, bay names/enabled flags, role-preview explanation. |

---

## 4. Demo controls

The **Demo controls** button in the topbar opens the demo panel.

* **16 scenario presets** — P01 … P16. Each one is a complete, independent
  snapshot that is **deep-copied** into the state when selected. Presets are
  never merged with each other, and the seeded movements and payments are
  never replayed.
* **Reset scenario** — deep-copies the current preset's initial state back in.
* **Reset all** — loads P01 and the Cashier role.
* **Role selector** (topbar) — Owner Demo, Manager Demo, Cashier Demo,
  Aung (Demo), Min (Demo). The last two are both Mechanics; the choice
  decides which jobs each can see. Switching the role keeps the current
  scenario and every edit. This is a **presentation control, not
  authentication** — anyone can switch to any role.

### The scenario presets

| ID | Label | Starts on |
|---|---|---|
| P01 | Main walkthrough: before check-in | S02 |
| P02 | Approval required: 60,000 MMK | S08 |
| P03 | Approved: before material issue | S09 |
| P04 | Repair in progress / extra work / cancel | S06 |
| P05 | Shortage: need 6 pieces, have 5 | S09 |
| P06 | Completed and unpaid: bay already free | S12 |
| P07 | Paid: collection, COPY and corrections | S12 |
| P08 | Zero-charge Redo, linked to original | S06 |
| P09 | Prices, promotions and discounts | S15 |
| P10 | Bookings and overdue no-show | S14 |
| P11 | Stock receipts, counts and suppliers | S10 |
| P12 | Daily closing: three payment methods | S17 |
| P13 | Import preview and duplicate handling | S18 |
| P14 | Reports: configured illustrative commission | S19 |
| P15 | Reports: missing cost and commission rule | S19 |
| P16 | Service due and collection follow-up | S13 |

---

## 5. The main journey (P01)

1. **S02 → S04** — as Cashier, open Nila Demo → DEMO-008 (Toyota Vios) and
   check the vehicle in. Enter the mileage; the sample data suggests
   68,000 km. A vehicle that already has an open visit cannot get a second
   one.
2. **S05** — switch the demo role to **Manager Demo** and assign the new job
   to a bay and a mechanic. A bay reserved by a booking is refused with a
   replan reason.
3. **S07** — as the mechanic, start the inspection and build the quote: brake
   repair labour 40,000 + one brake part 20,000 = 60,000 MMK. The approval
   basis is 60,000 MMK, so it is **above the 50,000 MMK threshold** and needs
   a customer decision. Submitting freezes the version as Pending.
4. **S08** — as the Cashier, record the customer decision: Approved, channel
   Phone, a contact note, and tick the confirmation.
5. **S09** — as the mechanic, issue the brake part. Stock goes 5 → 4, one
   material issue and one movement are appended, and the line is disabled so
   it cannot be issued twice.
6. **S06** — complete the work (tick the checklist). **The bay is released
   immediately**, even though the payment is still Unpaid and the vehicle is
   still Not collected.
7. **S12** — as the Cashier, open the draft receipt (60,000 MMK), take
   100,000 in cash, and record the full payment. Change 40,000. The receipt
   becomes RC-2026-0002 and the job becomes Paid.
8. **S12** — mark the vehicle collected, then close the job. The job moves
   into history.

Every step above is covered by an automated test (section 7).

---

## 6. The rules that are enforced

These come from the written build guide and are all enforced in `js/rules.js`.

**Access and roles**

* Staff-only views. There is no customer website or portal.
* A mechanic sees only the jobs assigned to them. Aung cannot see Min's
  JOB-2026-0006.
* The role selector is a presentation control, not authentication. Unavailable
  actions are hidden; an inaccessible view reached directly shows an access
  notice and returns to an allowed view.

**Pricing and approval**

* The approval basis is the repair labour plus the related shop parts and
  oil, measured **before** discount and before rounding.
* Above 50,000 MMK needs a customer decision. Exactly 50,000 does not.
* **Every** extra-work version needs its own decision, even a small one.
* A quote version is frozen when it is submitted. A superseded version cannot
  be approved as the current scope.
* A declined initial quote blocks starting. A declined extra-work version
  leaves the earlier approved scope visible and usable once the addition is
  explicitly withdrawn (Owner or Manager only).
* One automatic promotion per eligible service line; the lowest final price
  wins, ties go to the earliest promotion ID. No stacking with a manual
  discount. Manual discounts apply to service labour only: Manager up to
  10%, Owner above 10%.
* The receipt rounds **once** at the end, to the nearest 100 MMK, half up.
  Percentage-derived MMK is rounded half up to a whole MMK first.

**Stock**

* Quoting never deducts stock. Only an explicit approved material issue
  moves stock, and it deducts **once**.
* Stock never goes negative. A write-off or supplier return can only take what
  is on hand.
* Every movement is appended. Older movements are never rewritten.
* Receiving stock does not silently satisfy a waiting job — the mechanic has
  to retry the issue explicitly.

**Work, payment and closure**

* Completion releases the bay immediately. Payment may still be Unpaid and
  the vehicle Not collected.
* Full payment only. A part payment is refused with an explanation. Wallet
  payments need a simulated reference and a "Verified (demo)" tick.
* Collection comes after settlement. Closure comes after completion,
  settlement **and** collection.
* A paid price history stays locked; corrections retain the original entry.

**Demo data**

* The clock is fixed at 28 Oct 2026, 10:00 (Asia/Yangon). The report date
  basis is the workshop local date.
* The commission rule is **illustrative** and marked as such. There is no real
  workshop rate anywhere in the app. Commission only counts paid,
  non-Redo labour jobs; parts and oil never qualify.

---

## 7. Tests

Seven suites drive the real DOM in a headless Chrome over the DevTools
Protocol. They assert on the shared in-memory state, not on screenshots.

Start the static server first (`python -m http.server 8080`), then:

```bash
node tools/journey.js       #  28 checks — the P01 main journey, end to end
node tools/scenarios.js     #  25 checks — presets, deep copy, resets, roles
node tools/exceptions.js    #  68 checks — the P02…P16 presets
node tools/screens.js       # 288 checks — 20 screens × 5 roles: layout,
                            #   labels, focus, overflow, console errors
node tools/checklist.js     #  42 checks — the written rules from the build guide
node tools/checklist2.js    #  28 checks — the remaining secondary paths:
                            #   registration, suppliers, goods receipts,
                            #   follow-ups, adjustments, refunds, import merge,
                            #   commission adjustment, the bay guard
node tools/constraints.js   #   9 checks — no backend, no storage, no network,
                            #   no login: the frontend-only constraints
```

Total **488 checks**, all passing. Every suite exits non-zero on failure, so
they can be used as a gate.

To regenerate the screenshots:

```bash
node tools/shots.js         # writes 37 PNGs into screenshots/
```

The full results of the last run are recorded in
[`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md), including the cases that were
**not** individually exercised and the two changes made to the app during the
test round.

---

## 8. Screenshots

`screenshots/` holds 37 PNGs captured from the running app.

**Desktop journey (1440 px)** — `01-dashboard` … `14-demo-settings`
**Exception presets** — `20-exception-approval-pending` … `34-exception-reminders`
(one per preset P02–P16)
**Narrow mobile (390 px)** — `40-customers` … `47-closing`

---

## 9. Accessibility and layout notes

* 16 px body text. Buttons, form fields, tabs and navigation items are at
  least 44 px tall; the compact variants (row actions, the small number
  inputs, the EN/MM toggle) are 32–38 px, and the automated sweep holds
  every control to at least 32 px.
* Every control has a real `<label>`; every button has an accessible name.
* Visible focus ring on every interactive element.
* Escape closes a dialog and focus returns to the control that opened it.
* Warm ivory background, white cards, dark text, restrained orange for the
  primary action, one consistent sidebar.
* Responsive: full sidebar above 900 px, a drawer below it, stacked single
  column below 620 px. No horizontal overflow at 1440 px or 390 px.

---

## 10. Known limitations

These are real and are not fixed in this prototype.

1. **The pack was incomplete.** `00_READ_ME_FIRST.md`,
   `03_Flows_and_Demo_Script.md`, `04_Feature_Test_Checklist.md`,
   `05_UI_Design_Guide.md` and `08_Requirements_Coverage.md` were **not**
   included in the handoff. The implementation follows
   `reference/01_Codex_Build_Guide.md` (present and complete) and the written
   rules in it override the UI PNGs. Because the feature checklist file was
   missing, `tools/checklist.js` was derived from the build guide's own
   "non-negotiable behaviour" section and screen specifications. See
   `docs/TEST_RESULTS.md` for the cases that could not be checked against an
   original checklist.
2. **Myanmar is a partial preview.** Only `services[].nameMM` was supplied
   (12 of 12 services have one, and they are shown verbatim). Every other
   label falls back to English. The interface says
   *"Myanmar preview — partial translation"* and the Burmese interface words
   in the dictionary are placeholders kept for later completion — no official
   workshop wording is claimed.
3. **The commission rule is illustrative, not a rate.** It comes from the
   fixture (`P14`), is labelled as a demonstrator on the screen and in the
   report, and no real workshop rate is stated anywhere.
4. **The role selector is not security.** It is a clearly labelled demo
   control, exactly as the build guide asks for. It models the role flow; it
   does not protect anything.
5. **Nothing is persisted.** A refresh resets to P01 and the Cashier role.
   That is the required behaviour, but it also means a demo cannot be
   interrupted and resumed.
6. **Not every button on every screen was pressed.** The 288-check screen
   sweep proves that every screen renders for every role, is reachable or
   refused, has no horizontal overflow, has labels on its controls and has a
   visible focus ring. The *behaviour* of a control is covered by the
   journey, exception and checklist suites — for the controls those suites
   do not exercise, the evidence is "the control exists, is enabled and is
   labelled", not "the control works".
7. **Only Chromium was tested.** The suites drive Chrome over the DevTools
   Protocol; Firefox and Safari were not available here, so no cross-browser
   result is claimed.
8. **Two leftover development servers** from an earlier session were still
   listening on ports 8092 and 8093 while the tests were running. They have
   since been stopped, so only the static server on port 8080 should be
   listening now. To check and to stop them again if they ever come back:

   ```bash
   netstat -ano | findstr ":8092 :8093"   # find the PIDs
   taskkill /PID <pid> /F
   ```

9. **Not deployed.** Nothing has been published anywhere. The app is served
   locally only, and was not deployed publicly.

---

## 11. Licensing and data note

All people, vehicles, plates, phone numbers, prices, suppliers and job
records are invented for this prototype. The only external names are generic
payment method labels (Cash, KBZPay, WavePay). No real customer, staff
member, business address, phone number, bank account or QR code appears
anywhere in the app.
