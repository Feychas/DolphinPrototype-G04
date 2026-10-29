# Dolphin AutoTrack — complete prototype build guide

For Felice • CSC213 Systems Analysis and Design • Group 4 High Five • 28 October 2026

## 1. Build this

Build a clear, polished **internal workshop management website prototype** for Dolphin AutoTrack. It demonstrates staff workflows using fictional records. Customers do not log in. Implement all 20 screens and the specified demonstration interactions, including the exception examples. Do not build the real production system.

Use HTML, CSS and simple JavaScript. Keep temporary state in browser memory. A single page shell with client-side view switching is sufficient. Do not add a database, backend, server API, authentication provider, localStorage, IndexedDB, cookies for storage, payment gateway, messaging integration, background scheduler or backup service. A local static development server is only for serving frontend files.

Deliver a runnable frontend later, with a short README explaining how to open it, the default scenario, and how to reset it. This handoff itself contains specifications, fixtures and images, **not the implemented website or completed application test results**.

### How to use the handoff

1. Read this guide, then `02_Dummy_Data.json`.
2. Follow `03_Flows_and_Demo_Script.md` to understand the demonstrations.
3. Use `05_UI_Design_Guide.md` and the 20 `UI_Pages/` images for appearance.
4. Implement the outcomes in `04_Feature_Test_Checklist.md`.
5. Use `08_Requirements_Coverage.md` to check nothing in the agreed scope was missed.

Written rules and JSON values override accidental labels or sample values in the generated images. The images show different moments and independent examples. Do not hardcode their status counts. This expanded guide supersedes the earlier suggestion that S14–S20 can be entirely static: they now need the small, testable simulations described here. Production operations remain outside scope.

## 2. Non-negotiable behaviour

| Area | Required prototype outcome |
|---|---|
| Staff only | Owner, Manager, Cashier and Mechanic demo views; no customer website or portal. |
| Completion | **Completing repair releases its bay immediately**, even while unpaid and uncollected. |
| Independent statuses | Work, approval, payment, collection and closure remain separate fields. |
| Approval | Initial repair subtotal **above** 50,000 MMK needs approval; exactly 50,000 does not. Extra work always needs new approval. |
| Quote versus stock | Editing a quote does not deduct stock. Explicit Add to job deducts approved shop material once. |
| Stock | Never negative; shortages show Waiting for Parts. Receiving physical stock increases it. A purchase order alone does not. |
| Settlement | Full payment only; reject underpayment. Cash change is allowed. Wallet confirmation is simulated. |
| Collection | Collect after full settlement; close after completed work, settlement and collection. |
| History | Lock paid price lines; use separate reasoned corrections. Cancel/archive records rather than delete them. |
| Demo | Refresh or Reset demo restores the selected scenario. No real transactions or external messages. |

Three bays, fictional contacts, stock quantities and illustrative commission settings are demo choices. They are not claims about the actual workshop. S/M/L is selected explicitly: do not infer vehicle size from sedan/SUV labels because the source has not finalized that mapping.

## 3. Page shell and navigation

Use a persistent sidebar, top bar, breadcrumb and content area. The top bar shows `Demo data`, current demo role, language preview and a compact `Demo controls` menu. The menu provides scenario selection, `Reset scenario` and `Reset all`. Show a confirmation before discarding unsaved changes. All of this is frontend presentation, not authentication.

`Reset scenario` deep-copies the current scenario's initial `state`; `Reset all` loads P01 and Cashier. Refresh starts at P01. Switching roles preserves the current scenario and edits. Switching scenarios replaces the whole state, clears unsaved forms and returns to its `startScreen`. Never merge two scenario snapshots.

Role selector options use the five fixture users: Owner Demo, Manager Demo, Cashier Demo, Aung (Demo), Min (Demo). The last two are both Mechanics; choosing one determines assigned-job visibility. Keep the role selector globally available as a clearly labelled presentation control, separate from Owner's business settings page.

### Permissions for visible actions

| Capability | Owner | Manager | Cashier | Mechanic |
|---|---|---|---|---|
| Customer registry/history/check-in | Yes | Yes | Yes | Assigned-job context only |
| Bay assignment and staff assignment | Yes | Yes | View board only | Own assignment only |
| Inspect, quote, progress, material issue | Yes | Yes | View; no repair editing | Assigned jobs only |
| Record customer's quote decision | Yes | Yes | Yes | View only |
| Receipt/payment/collection/closure | Yes | Yes | Yes | No |
| Prices/promotions/suppliers/stock/imports | Yes | Yes | No | Only own-job material picker |
| Request manual discount | Yes | Yes | Yes | No |
| Approve manual discount ≤10% | Yes | Yes | No | No |
| Approve manual discount >10% | Yes | No | No | No |
| Cancel/reopen/Redo price/corrections | Yes | Yes | No | No |
| Daily closing | Yes | Yes | Yes | No |
| Management reports/commission | Yes | Yes | No | No |
| Demo settings | Yes | No | No | No |

Hide unavailable actions. If an inaccessible view is reached through a stale selection or direct client route, show a simple access notice and return to an allowed view. This models the role flow; it is not real security. Aung must not see Min's JOB-2026-0006 details. Changing role must not carry confidential manager content into a mechanic page.

Cashier navigation: Dashboard, Customers, Jobs, Bay board, Bookings, Receipts, Reminders, Daily closing. Manager/Owner: Dashboard, Customers, Jobs, Bay board, Bookings, Inventory, Catalogue, Receipts, Reports, More. More contains Reminders, Daily closing, Corrections and Import preview. Owner also gets Settings. Mechanic: My jobs, Current job, Inspection, Approval (view), Materials, Progress.

Jobs and receipts lists are views within S06 and S12, respectively; their details use the same screen. Suppliers and purchase orders are tabs within S10/S11. No additional top-level screens are necessary.

## 4. Data and repeatable examples

`02_Dummy_Data.json` contains 16 complete starting snapshots. Each has a `state`, `startScreen`, `id` and label. Use a deep copy, not the fixture object itself. There are only two customers, four vehicles, three inventory types and five role-preview users in the common base. More rows are included only where a feature needs them, such as all three payment methods, overlapping bookings, duplicate import rows or two mechanics for commission splitting.

| Preset | Start | Demonstration |
|---|---|---|
| P01 | S02 | Full main flow from vehicle search and check-in |
| P02 | S08 | 60,000 quote awaiting customer approval |
| P03 | S09 | Approved quote, stock not yet issued |
| P04 | S06 | Work in progress, one part already issued; extra work/cancel/reopen |
| P05 | S09 | Approved six-piece requirement, only five in stock |
| P06 | S12 | Completed, unpaid, bay released |
| P07 | S12 | Paid, not collected; COPY and corrections |
| P08 | S06 | Linked zero-charge Redo |
| P09 | S15 | Services, promotions and discount approvals |
| P10 | S14 | Bookings and no-show boundaries |
| P11 | S10 | Stock, suppliers, purchasing and adjustments |
| P12 | S17 | Closing with cash and two wallet methods |
| P13 | S18 | Import validation, duplicate skip/merge |
| P14 | S19 | Report with an explicitly illustrative commission rule |
| P15 | S19 | Report with missing cost/rate inputs |
| P16 | S13 | Service due and collection reminders |

The fixture clock is **28 October 2026, 10:00, Asia/Yangon**. Display workshop dates, not the machine's current date or UTC day. Tests for no-shows and reminders change only a demo clock or load a boundary sample; no real timer is needed. Keep dates deterministic.

The base contains past JOB-2026-0005, another mechanic's open JOB-2026-0006, and completed/uncollected JOB-2026-0007. The next new job is JOB-2026-0008. Use fixture counters to create later IDs; pad to at least four digits without truncating. IDs are unique inside a scenario. Reusing them after a reset is intended.

`items[].onHand` is the opening balance already present in that snapshot. Do not replay seeded movements on load. New actions change that balance and append a movement. Likewise, seeded payments and receipts are already posted; do not post them a second time. A current job, quote, material issue and receipt reference each other by IDs.

### Canonical main job

| Field | Value |
|---|---|
| Customer / vehicle | CUS-01 Nila Demo / VEH-008 DEMO-008 |
| Vehicle | Toyota Vios, 2020; manually selected M |
| Visit | 68,000 km, half fuel, existing rear-bumper scratch, one empty bag |
| Job / assignment | JOB-2026-0008 / Bay 2 / Aung (Demo) |
| Quote v1 | Labour 40,000 + one Brake part 20,000 = 60,000 MMK |
| Stock | Brake part 5 before issue, 4 after issue |
| Purchase-cost snapshot | 12,000 MMK for the issued part |
| Cash | Tendered 100,000; applied 60,000; change 40,000 |
| Receipt | RC-2026-0002 when payment is posted |
| Optional next service | 28 November 2026 or 73,000 km, explicitly entered sample values |

## 5. State transitions and calculations

### Work and post-repair state

Work sequence: Check-in → Diagnose/Quote → Approved → In Progress → optionally Waiting for Parts → Completed. `Approved` means the authorization gate is satisfied, which may be `Not required` for unchanged work below the threshold. Do not claim explicit customer approval in that case.

`approvalStatus`: Not required / Pending / Approved / Declined, tied to an exact quote version. `paymentStatus`: Unpaid / Paid / No charge / Review required. No charge counts as settled. `collectionStatus`: Not collected / Collected. `lifecycleStatus`: Open / Closed / Cancelled. Paid and Collected are visible milestones but must not replace the work field.

Start work requires a bay, assigned mechanic and an authorization-satisfied scope. An initial pending/declined quote blocks starting. During extra-work approval, previously authorized work can continue, but the new scope stays blocked. Each material issue must check the approval for its quote line, not merely a global green badge.

Complete requires the required checklist and no unresolved required shortage or undecided required extra scope. If extra work is declined, explicitly remove that proposed addition from the work plan while retaining its declined quote record; completing the original scope then remains possible. Completion updates `completedAt`, `workStatus` and releases `bayId` together. Keep prior assignment in activity/history. It does not change payment or collection.

Waiting for Parts retains the currently occupied bay until Manager reassignment. Cancel releases it. Reopen requires Manager reason, resets completion/checklist for the new work cycle and requires a fresh free-bay assignment; it does not seize the previous bay. Restrict the simple Reopen demo to unpaid, uncollected, completed jobs. For a paid job, preserve financial lines and offer a linked Redo or correction instead. This is a prototype simplification of the production reopen workflow.

### Pricing and approval

Snapshot the catalogue price context at job creation. Later catalogue edits affect new jobs only. Quote edits after authorization create a new version, never rewrite the approved one. Parts and oils are separate lines. Customer-supplied material has a descriptive zero shop-charge line and no shop-stock issue; labour is charged normally.

Initial repair approval basis = repair labour + related shop parts/oil **before discount and rounding**, excluding unrelated wash services. Above 50,000 needs approval; exactly 50,000 does not. Use the guide's fixture classification of repair services solely for the demo. Every mid-job extra scope requires approval even at 1,000 MMK.

One automatic promotion per eligible service line. Match service, vehicle size and job date, inclusive of start/end dates. Types: fixed subtraction, percentage subtraction, or final set price. Reject negative results. If several promotions qualify, choose the lowest final service price, then the earliest promotion ID for a tie. No manual/promotion stacking on one line. Manual discounts apply only to service labour in this design, measured against that line's regular amount; Manager ≤10%, Owner >10%.

Sum final line charges, then round the **receipt total once** to the nearest 100 MMK; half rounds upward. Show rounding adjustment separately. For nonnegative integer MMK, use the equivalent of `floor((total + 50) / 100) * 100`. Round percentage-derived fractional MMK to a whole MMK using half-up before the final nearest-100 receipt rounding. This whole-MMK detail is a demo implementation choice. Do not round every line to 100.

Examples: 18,500 − 6,500 = 12,000 for S wash + hand polish; M 22,500 − 6,500 = 16,000; L 25,500 − 6,500 = 19,000. 60,149 becomes 60,100 (−49); 60,150 becomes 60,200 (+50). An approval basis of 50,001 still requires approval even if the rounded payable is 50,000.

### Receipt, payments and reports

Prepare receipt from authorized, completed and committed work. Do not bill an unapproved quote, an unissued shop part, or a declined addition. The receipt uses the job snapshots, not today's catalogue. No tax invoice or invented tax percentage.

Cash: tendered must cover the complete payable; applied amount equals payable; change = tendered − payable. Wallet: require a sample transfer reference and a checked `Verified (demo)` control before posting the full amount. Do not request wallet credentials or open a payment link. Zero-price Redo uses `Settle as no charge`; it creates a zero-total receipt with no fabricated cash payment.

Posting full payment creates one receipt and one payment, then locks financial lines. Double clicking or returning to the paid page must not create another. Reprinting uses the same number and a COPY label. Collected records the vehicle handover, not receipt collection. Close requires completed + settled effective balance + collected.

For a charge/refund correction: original 60,000 stays retained; charge adjustment −5,000 and refund −5,000 give effective charge 55,000 and net payment 55,000. For a method correction: reverse Cash −60,000 and record KBZPay +60,000; revenue is unchanged. Log actor/time/reason in a small in-memory activity list. A nonzero effective balance becomes Review required and blocks closure. No ordinary installment feature.

Revenue sums finalized receipt charges plus charge corrections by receipt/correction date. Collections sum signed payments, refunds and method corrections by transaction date. Never add payments to revenue as additional sales. Gross-profit estimate = receipt revenue − snapshotted material cost; missing costs show Incomplete. Show commission separately; revenue minus material cost minus commission is contribution after commission, not net profit. Overhead is not modeled.

## 6. Screen specifications

Every save updates the shared temporary state, shows a brief success message and updates related views immediately. Invalid submissions leave data unchanged and show field-specific errors. Cancel discards an unsaved form. Back returns to the prior selected record. No dead buttons; an action outside this demo must be a clearly labelled explanatory preview rather than pretend success.

### S01 — Dashboard

Manager/Owner sees open jobs, available bays, awaiting collection, low-stock items and recent jobs. Cashier sees only relevant operational cards. Mechanic lands on My jobs. Derive counts from state: open jobs exclude Closed/Cancelled; available bays are enabled bays without active assignments; awaiting collection is completed/uncollected regardless of payment; low stock means onHand ≤ reorderLevel.

Cards open the corresponding filtered list. New check-in → S02. Each job row → S06. Include simple empty states. A tiny automotive illustration is optional; work data has visual priority.

### S02 — Customers, vehicles and service history

Search plate or customer name case-insensitively. Trim outside whitespace and normalize case without removing meaningful plate characters. DEMO-008 search shows only its matching vehicle. Clicking a vehicle shows customer contact, all past/current jobs, mileage per visit, status and links. One customer may own multiple vehicles.

Register vehicle → S03. New check-in → S04 with selected vehicle. Open history job → S06 in the proper read-only/editable state. Customer edit changes the profile; past receipt snapshots remain intact. Archive with a reason, do not delete. Archived records stay accessible under an Archived filter. Block archiving a vehicle with an open active visit as a demo data-quality guard.

### S03 — Register customer and vehicle

Choose Existing customer or New customer. New customer requires name and phone; Viber/Facebook are optional. Vehicle requires unique plate, brand, model, year and explicit S/M/L for this form. The source specifically requires a unique plate and size; requiring brand/model/year here is a form-design choice. Reject empty/invalid year, future year and duplicate normalized plate. Use `sampleInputs.registration`: DEMO-030, Toyota Yaris 2021, S, existing CUS-02; optional new May Demo.

Save adds the customer only if New was selected, adds one vehicle, and opens S04. Repeated submission must not add duplicates. Do not use existing DEMO-008 for successful new registration. Cancel → S02 without saving.

### S04 — Vehicle check-in

Show vehicle/customer summary. Inputs: required mileage and S/M/L; service selection, damage, fuel, belongings; optional sample photo tile. Use a local supplied placeholder image, no upload service. Do not require real photos. Mileage is per visit, nonnegative and not below the latest recorded visit unless Manager confirms a reasoned demo correction. Empty mileage is not zero.

Create demo job produces one Check-in job and returns its detail or board. Prevent a second open visit for the same vehicle; show its existing job and Manager review notice instead. For the main walkthrough choose DEMO-008 and create JOB-2026-0008. Cashier can view S05 but must switch the demo role to Manager to assign it.

### S05 — Bay board

Three illustrative bay cards. Each shows Available or assigned job/vehicle/mechanic and an Open job link. A separate queue shows completed/uncollected vehicles. Unpaid completed jobs never occupy a bay card.

Manager Assign opens a modal: unassigned eligible job, free bay, one or more mechanics. Validate one active vehicle per bay, an enabled bay, current booking conflicts and a selected mechanic. An unavailable choice shows a reason. Booking reservation and physical occupancy are separate; a future booking does not show an occupied repair bay. If work conflicts with an upcoming booking, show Manager a replan prompt rather than silently freeing another job's bay.

Cashier sees the board without assignment controls. Mechanic uses only their own assignments. Completing JOB-2026-0008 makes Bay 2 Available immediately; its row appears in the completed queue.

### S06 — Job list and job card

List filters: open, waiting, completed/uncollected, closed, cancelled and Redo. Mechanic list is assigned-only. Detail shows vehicle/check-in info; four status chips; bay/staff; quote versions; service/material lines; progress checklist; activity; and links to S07/S08/S09/S12. Manager can assign multiple mechanics.

Start inspection → Diagnose/Quote. Start work validates assignment/approval. Checklist toggles affect only the selected job. Mark complete uses the guards above. Add extra work → S07 with a new draft version and prior scope displayed.

Manager actions: Cancel (reason and issued-material dispositions), Reopen (unpaid completed example with reason), Create linked Redo (original job plus Manager-set price), Archive closed record. Cancel must ask whether each issued item is recoverable or consumed/unusable; recoverable unused parts add back once, consumed oil/unusable issued items do not. Keep every original issue and cancellation event. Do not deduct an already-issued unusable part twice.

Redo is a separate job with original ID link, explicit price, normal bay assignment/checklist/completion, and no commission. A zero-charge Redo settles without a fake payment. It is a comeback record, not a warranty feature.

### S07 — Inspection and quotation

Inputs: inspection notes, service lines, shop/customer material source, quantity, price snapshot; totals and approval reason. Add/remove draft lines works before submission. Save draft preserves the temporary draft; Cancel preserves the previous saved version. Quote-only material quantities never reduce stock.

Submit computes authorization requirement and freezes that submitted version. Above-threshold repair becomes Pending; under/equal threshold becomes Not required. Cashier records customer decisions in S08. Mechanic sees a read-only decision summary. For P04 extra work, add 1,000 labour as v2: show prior 60,000 and revised 61,000; re-approval is required. Already issued v1 parts remain issued, and accepting v2 does not issue them again.

Customer-supplied example: oil-change labour 15,000 plus a zero-charge customer-oil description, four liters, no shop stock movement. Do not show four liters as a shop-sale charge.

### S08 — Customer approval

Show exact quote version, old/revised total and scope changes. Cashier/Manager/Owner inputs decision Approved/Declined, channel (Phone, Viber, Messenger or In person), contact note and confirmation. Timestamp and recorder come from the demo state. No contact is actually made.

Require a decision and channel; retain the decision against its quote version. Reject an attempt to approve a superseded version as the current scope. A declined initial quote blocks starting. A declined extra version leaves the earlier approved scope visible and usable after explicitly withdrawing the addition. A new proposal requires another version. Mechanic cannot record the customer's approval.

### S09 — Job materials

Show authorized material lines, availability, unit, quantities already issued and pending quantities. Add to job validates assigned access, appropriate approval, unpaid lock, positive quantity, unit and remaining approved quantity. Part/bottle quantities are whole numbers; liter quantities may be fractional.

P03: issue one Brake part, stock 5 → 4, append one material issue and one movement. Disable that fully issued line. Repeated click stays at 4. P05: approved requirement is six pieces, stock five; no issue/movement, show Waiting for Parts. Manager receives five in S11: stock 10. Mechanic retries six: stock four and work can resume. Do not use a shortage quantity larger than authorized quantity without also updating the quote and approval.

A Return/disposition path references the original issue and remaining returnable quantity; Manager handles it under cancellation/adjustment. Customer-supplied material never appears as a shop-stock deduction.

### S10 — Inventory, suppliers and purchase orders

Inventory table has three types: part, oil, consumable; show brand/grade where relevant, unit, on-hand, reorder level and supplier. Keep units separate. Search/filter is functional. View opens movement history. Receive → S11. Adjust → S16. Low-stock badges appear at or below the configured level.

Suppliers tab shows two sample suppliers; add/edit/archive simple forms. Purchase orders tab creates a sample order for five brake pieces at 12,000 = 60,000 from SUP-01. Status Ordered does not increase stock. Receive against order → S11; successful receipt sets Received (or Partial if demonstrating a smaller quantity). No real supplier message or purchase is sent. Archived suppliers cannot be selected for new orders but retained records still name them.

### S11 — Receive stock

Require supplier, delivery reference, date, item, positive quantity, unit and nonnegative purchase cost. Five pieces × 12,000 = 60,000 MMK. Preview uses current balance; P11 starts 5 → 10, while after the main issue it would be 4 → 9. Record receipt appends goods-receipt/movement/activity, updates on-hand and latest purchase cost, and returns to inventory. Prevent repeating the same supplier/reference/item receipt. Historic issued-cost snapshots stay unchanged.

In shortage P05, receiving five changes 5 → 10 and still leaves the six-piece job issue pending until Mechanic explicitly retries it. Receiving does not silently deduct stock for the waiting job.

### S12 — Receipts, payment, collection and closure

Receipt list filters unpaid previews and issued receipts. A completed job opens an unnumbered draft receipt. Show itemized regular charge, discounts, parts/oil, rounding and final payable. Use a clear Demo label; no real bank/QR details or invented business address/phone. The printed title is Receipt, not Tax invoice.

P06: work Completed, Bay released, Unpaid, Not collected. Cash tendered 100,000 → change 40,000. Record full demo payment creates RC-2026-0002, Paid, and enables Mark collected. Offer cash, KBZPay and WavePay; wallet requires simulated verification. For a 60,000 bill, 20,000 is rejected and no payment is posted.

Mark collected records vehicle handover and enables Close job. Close offers optional next-service date/mileage; no automatic service interval is invented. Save/close adds the job to history. An issued receipt supports Print preview, browser Print and Reprint COPY using the same number. A simulated Share preview may show text for Viber/Messenger, but must not send anything or open a live recipient.

Manager Corrections → S17. Paid price edits are unavailable. P08 zero-charge Redo uses Settle as no charge and a zero receipt; Paid/No charge both satisfy collection. No zero-valued cash transfer is manufactured.

### S13 — Reminders

Two tabs: Service due and Awaiting collection. Collection eligibility = completedAt older than three days and not collected, independent of payment. Exactly three days is not yet eligible under the adopted design; one minute later is. P16 has JOB-2026-0007 completed 24 Oct at 10:00, now four days old. Bay remains released.

Service due uses an explicitly stored due date ≤ demo date, or latest known visit mileage ≥ due mileage. Do not infer current mileage from time. P16's historic JOB-2026-0005 has due date 27 Oct and a supplied due mileage. Saving a newer next-service plan replaces the old active plan; do not create duplicate reminders for all past jobs.

Record follow-up requires a channel and outcome, optionally next action/date. Save demo note updates a follow-up list and last-contact summary; it does not mean a message was sent. A contacted but uncollected car remains in the queue. Collection removes it. One active queue item per vehicle/job, not one per page visit.

### S14 — Bookings

Day list and selected-booking detail. Cashier chooses customer/vehicle, service, date, start and end. End must be after start. Save creates Requested with no bay. Manager assigns the bay and confirms Booked. Edit/cancel retains the booking and reason; no deletion.

Reject same-bay overlap using [start,end): 11:30–12:30 conflicts with BK-01 11:00–12:00; 12:00–13:00 is valid. Other bays can have the same time. Current physical occupancy can still prevent arrival assignment even if a reservation exists.

Check in opens S04 and links the new job; record arrival first so no-show logic cannot cancel it. Repeated Check in opens the existing linked job. P10's BK-03 started at 09:00 with no arrival. `Run demo no-show check` cancels once when demoNow ≥ start+30 minutes. This at-boundary convention is a stated prototype choice. Release its reservation, not another job's occupancy. A late arrival creates a new walk-in/rescheduled booking and retains the cancelled record. No background timer.

### S15 — Catalogue, promotions and discount requests

Services tab shows bilingual names from the source and fixed or S/M/L prices. Add/edit/archive service, validate nonnegative prices and required size variants. Updating a catalogue price increments a demo price version; existing job/receipt snapshots remain unchanged. New jobs use the changed values.

Promotions tab: name EN/MM, inclusive dates, services, sizes, type/value, active status. Add/edit/end a demo promotion. Preview all three types with `sampleInputs.promotionAlternatives`. Apply automatically by job date; one per service line. Enforce end ≥ start and price ≥0. End a promotion without altering old receipts.

Discount requests tab: a Cashier can submit a requested labour discount from a selected unpaid quote. Manager approves 10% of 40,000 → 36,000; 15% → 34,000 requires Owner. A Manager cannot self-approve the latter. Retain request/approver/reason. Applying a new discount to an already approved quote creates a new quote version for review; never edit the authorized price silently. Block discount/promotion stacking and manual parts/oil discounts.

### S16 — Stock adjustments and dispositions

Movement types: count adjustment, consumable opened, write-off, supplier return, recoverable job return. Require item, unit, valid quantity, reason, actor and timestamp. Show before/after preview.

P11 count Brake part 5, counted 4 → movement −1, final 4. Consumable opened: Cleaner one bottle → zero; manual deduction once, no automatic duplicate. Oil supports 0.5 liter → 3.5 from four. A write-off or supplier return deducts only stock currently on hand; block more than available.

Recoverable return needs original issue and available unreturned quantity. P04's one unused part can return 1 once, 4 → 5. A consumed/unusable already-issued item is recorded as a disposition with **zero additional stock delta**, not another deduction. Count changes always append a movement; do not rewrite older movements. Cancel leaves stock unchanged.

### S17 — Daily closing and payment corrections

Cashier sees closing; Manager/Owner also sees corrections. Closing chooses a workshop date and shows expected Cash/KBZPay/WavePay from net payment entries. Include opening float and non-sales cash movements as explicit demo inputs; P12 uses both zero. Cash counted is the actual cash drawer; expected cash = sales cash + float + signed non-sales cash. Do not count customer tendered cash without subtracting change.

P12 expected 60,000 / 30,000 / 20,000; counted 60,000 / 30,000 / 19,500; differences 0 / 0 / −500. Require an explanation when any difference exists. Save retains the closing and shows a Manager review badge in the app. It does not rewrite a receipt to force the totals to match. Amendments retain the old value and a new reason.

Corrections tab supports the two explicit samples from P07: paired −5,000 charge/refund, or Cash-to-KBZPay method correction. Preview original entries, signed changes and effective balance before Confirm. Require reason and a sample wallet reference/verification for method changes. Keep the original receipt; show separate adjustment rows in daily reports. Do not apply both samples together unless deliberately testing compounded adjustments; Reset P07 between them. Reject a refund exceeding collected money or a correction making effective charges negative.

### S18 — Import preview

Support six type choices: Customers, Vehicles, Inventory, Suppliers, Services/prices, Past jobs. Use `importFixtures`; actual file parsing is unnecessary. Download template may download a static CSV with the fixture columns. `Load sample rows` creates a staging preview only.

Vehicles shows one valid DEMO-020, one duplicate DEMO-008 and one missing plate. Counters are 1 valid / 1 duplicate / 1 error. Block Simulate import while errors remain. `Use corrected sample` gives the missing row DEMO-021. Default duplicate choice is Skip: import two new rows, skip one. Reviewed Merge shows field differences and requires a per-row confirmation; import two, merge one. Never silently overwrite paid history. Re-running the same sample recognizes newly existing keys and does not create duplicates.

Simulate import changes only the temporary records and stores a sample batch log/counts. Past-job rows appear as explicitly historical read-only history; do not replay stock issues, payment posting, commission or today's sales. This is a controlled demonstration of import results, not an Excel/CSV engine. All six type choices must have at least one sample row and a usable preview, even if only Vehicles has the full error example.

### S19 — Reports and commission

Date filters use the demo workshop date and can show an empty range. Provide Daily and Monthly summaries plus Services, Inventory, Commission, Promotions and Redo tabs. Tables are adequate; charts are optional. Show the date basis and use current in-memory data or clearly labelled preset report fixtures. Do not label fixed totals as live after changing their underlying state.

Daily: receipt revenue, distinct checked-in jobs and distinct vehicles, collections by method, closing difference, corrections. Monthly: receipt revenue, estimated gross profit, popular completed services, parts/oil usage, estimated stock value (on-hand × latest purchase cost), low stock, commission, discount amounts, Redo jobs. Keep sales and collections separate and list signed corrections.

P14 filters 28 Oct only: revenue 60,000; collections 60,000; part cost 12,000; estimated gross profit 48,000. Its **illustrative** rule is 10% of final eligible labour 40,000 = 4,000; two assigned eligible mechanics receive 2,000 each. Contribution after commission is 44,000. Historical 10 Oct receipt is outside this date range. Do not copy the image's monthly 60,000 total into a month that also includes history.

Commission preview supports fixed-per-service or % labour, regular/final labour basis, eligibility and payout period. P14's rule is a demonstrator choice, not the workshop's actual rate. Only paid, non-Redo jobs qualify; parts/oil never qualify. Split equally across eligible staff; allocate any remaining whole-MMK units by sorted staff ID. Keep earned and paid-out status separate. `Mark demo payout` records an in-memory payout without changing receipt revenue. Changes after payout show an adjustment, not a duplicate payout.

P15 has missing part cost and no rule: show Incomplete and Not configured, not invented zero cost/earnings. A charge correction recalculates affected commission only when its labour/material allocation is supplied; otherwise show Needs review. Do not invent how an unspecified refund splits across labour and parts.

### S20 — Demo settings and presentation controls

Owner view: language preview, bay names/enabled flags and role-preview explanation. Keep the light theme; the optional dark-theme control in the generated image is outside the required build. A bay with an active assignment cannot be disabled. Saving changes only temporary values. Reset restores fixture values.

Use the supplied Myanmar service labels verbatim. The rest of the UI may use an English fallback, with `Myanmar preview — partial translation` shown honestly. Keep label strings in a translation dictionary for later completion. Do not claim a fully translated interface or invent official workshop wording.

Production accounts, 30-minute logout, backups and restore are represented only by a short read-only `Production requirements` explanation if needed for the presentation. No passwords, login form, live accounts, backup buttons or working scheduler. They are deliberately excluded from prototype implementation.

## 7. Shared implementation details that make the demo reliable

Use one state source for all views. Simple functions for navigation, selected record, validation and state actions are enough. Organize code into a small shell, styles, data and views/actions; avoid a production service architecture. Do not render full-page mockup PNGs as the interactive website; build actual text, controls and tables.

Each save gets a stable submission key or action flag in the temporary state. Disable while saving and after a one-time action is complete. Guard check-in, material issue, receipt, stock receipt, correction, import and payout against double clicks. Cancel/Back must not accidentally post a pending action.

For numeric inputs, reject empty strings, NaN, infinities, negative invalid values and disallowed fractions. Use integer MMK. Retain liters with an explicit supported precision (two decimal places is sufficient for this demo). Never compare formatted strings such as `60,000` as numbers.

Receipt history retains snapshots. Movement/activity logs contain reference, actor, demo time and reason but are just arrays in memory. Production database transactions, concurrency and audited storage are not required. Still update all linked in-memory fields together so the demonstration does not show impossible states.

On an unsaved role/scenario switch, offer Discard or Stay. A normal role switch after a save keeps data. Restricted route selection resets to that role's permitted landing page. The global demo controls remain available for presentation convenience.

## 8. UX and accessibility acceptance

Prioritize readable tables, clear section titles and labelled fields. Use one orange primary action per section; white cards on warm ivory; consistent status badges with text, not colour alone. Keep 16 px body text and 44 px controls. Support keyboard tabbing, visible focus, Escape/cancel on dialogs, focus return to the invoking button and field-specific error text. Do not trap keyboard users.

At desktop width use sidebar plus content; at tablet/mobile collapse navigation and stack columns. Tables may scroll horizontally in a labelled region. Never shrink text to fit. Test desktop about 1440 px and a narrow 390 px view. No dead links, clipped actions, overlapping cards or unreadable labels. Avoid autoplay, decorative animations and oversized marketing illustrations.

## 9. Suggested build order and completion evidence

1. Shared shell, tokens, role preview, fixture loader, reset and empty states.
2. P01 core journey across S02–S09 and S12, including immediate bay release.
3. Registry/history, receipt COPY, inventory/supplier flows and reminders.
4. Exception presets: approval decline, extra work, shortage, cancel/return, reopen, Redo, correction.
5. Bookings, catalogue/promotions/discounts, closing, imports, reporting/commission, settings.
6. Run the checklist. Record Actual result and Pass/Fail only after trying the built app. Capture screenshots for the main stages and at least one exception per feature group.

The prototype is ready when every agreed screen is reachable, each specified feature has a working temporary demonstration or explicitly scoped preview, the linked data stays consistent, the core walkthrough can be repeated after reset, and test evidence identifies any remaining limitations. Do not describe fixture validation in this handoff as proof the future website passed its tests.

## 10. Requirement basis and design choices

Working sources: Amanda Business Rules v1 (27 Oct 2026), Felice's confirmed completion-based bay release and frontend-only prototype scope, the proposal, and the prepared process/sequence/UI deliverables. Source labels BR00–BR19 refer to Amanda's numbered sections. The coverage file maps each to the demo.

Adopted design interpretations, retained from the process design: approval uses pre-discount repair subtotal; no discount stacking; deterministic promotion choice; versioned approval; half-up final rounding; separate settlement/collection; append-only corrections; material issue separate from estimate; workshop local date. Additional prototype conventions are clearly stated above (no-show boundary, unpaid-only simple reopen, form validation, whole-MMK percentage rounding). They are implementation choices for a coherent demo, not newly verified owner requirements.
