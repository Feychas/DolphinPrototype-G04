# View & action contract (for anyone adding a screen)

The prototype is a single-page shell. `index.html` loads `js/data.js`, `js/util.js`,
`js/store.js`, `js/rules.js`, `js/ui.js`, `js/actions.js`, the view files in
`js/views/`, and finally `js/app.js`.

## 1. Registering a view

Create `js/views/sNN.js` and add a `<script>` tag for it in `index.html`
(the tag list is alphabetical at the bottom of `index.html`).

```js
/* js/views/s14.js */
(function (global) {
  'use strict';
  global.DolphinViews = global.DolphinViews || {};
  global.DolphinViews.S14 = {
    render: function (ctx) {
      return UI.pageHeader({ title: 'Bookings', subtitle: '…' }) +
        UI.card({ title: 'Day list', body: '…' });
    },
    mount: function (root, ctx) { /* optional: DOM wiring after render */ }
  };
})(window);
```

`render(ctx)` returns an HTML **string**. `mount(root, ctx)` is optional and runs
after the string is inserted — use it only when you must touch the DOM.

### ctx

| field | meaning |
|---|---|
| `ctx.state` | the live shared state (the same object `Store.state`) |
| `ctx.role` | `'Owner' \| 'Manager' \| 'Cashier' \| 'Mechanic'` |
| `ctx.user` | the active demo user `{id,name,role}` |
| `ctx.screen` | current screen id, e.g. `'S14'` |
| `ctx.params` | screen parameters (e.g. `{jobId:'JOB-2026-0008', tab:'corrections'}`) |
| `ctx.scenario` | the active scenario `{id,label,startScreen,state}` |
| `ctx.fixture` | the whole `02_Dummy_Data.json` content (`sampleInputs`, `importFixtures`, `expectedReports`, `localization`) |

## 2. Shared helpers you should use

* `Util` — `mmk(n)` (formatted MMK), `qty(n)`, `esc(s)`, `norm(s)`, `normPlate(s)`,
  `parseNum`, `parseIntStrict`, `round2`, `deepCopy`, `byId`, `sum`, `groupBy`,
  `sortBy`, `fmtDate`, `fmtDateTime`, `fmtTime`, `dayKey`, `addDays`, `toLocalInput`,
  `fromLocalInput`, `msBetween`, `daysBetween`.
* `Store` — `state`, `job(id)`, `vehicle(id)`, `customer(id)`, `item(id)`,
  `service(id)`, `bay(id)`, `supplier(id)`, `receipt(id)`, `jobReceipt(jobId)`,
  `jobPayment(jobId)`, `quote(job,version)`, `latestQuote(job)`, `activeQuote(job)`,
  `vehiclesOfCustomer(id)`, `jobsOfVehicle(id)`, `staffName(id)`, `visibleJobs()`,
  `nextId(kind)`, `log(type,message)`, `now()`, `today()`, `role`, `userId`,
  `isOwner()`, `isManager()`, `isCashier()`, `isMechanic()`, `isManagerial()`.
* `Rules` — pricing, approval, promotions, rounding, guards, reminders, bookings,
  reporting and commission calculations (see `js/rules.js`).
* `UI` — `pageHeader`, `card`, `table`, `kpi`, `badge`, `statusBadge`, `toneFor`,
  `banner`, `tabs`, `field`, `btn`, `link`, `chips`, `empty`, `note`, `dl`, `icon`.
* `App` — `go(screen, params)`, `toast(msg, tone)` where tone is
  `'info' | 'warn' | 'error'`, `modal({title, body, actions})`,
  `confirmDialog({title, message, confirmLabel, onConfirm})`, `render()`.

## 3. Registering actions

Actions live in `js/actions.js` for the core screens and in a separate file
(for example `js/act-bookings.js`) for a feature group. **Add the new file to
`index.html` after `js/actions.js`.**

```js
window.Actions.click['booking.create'] = function (el, ev) { … };
window.Actions.submit['booking.save'] = function (form, ev) { … };
window.Actions.live['booking.search'] = function (el, ev) { … };
```

* `click` — fired on any element with `data-action="booking.create"`.
  Put the record id on the element, e.g. `data-booking-id="BK-01"`.
* `submit` — fired on `<form data-form="booking.save">`. Read values with
  `Actions.values(form)` which returns an object of `name → value`.
* `live` — fired on `input`/`change` of an element with `data-live="…"` or
  `data-change="…"`. Use it for filters that should not steal focus; if you
  re-render, keep the same element `id` so focus is restored.

Validation pattern used in `js/actions.js`:

```js
function fail(form, errors, message) { … }   // private helper there
```

In your own file, do the same: collect `errors = {fieldName: 'message'}`,
show them next to the fields, show an `App.toast(..., 'warn')`, and **do not
change the state** when something is invalid. On success mutate
`Store.state`, call `Store.log(type, message)` and `App.render()`.

## 4. CSS classes available

Layout: `app sidebar main topbar content page-head page-head-text page-actions`
`card card-head card-title card-sub card-body card-actions`
`grid-2 grid-2-even grid-3 grid-4 stack stack-sm row row-between`
`kpi kpi-label kpi-value kpi-sub kpi-icon kpi-blue kpi-green kpi-amber kpi-grey kpi-clickable`
`btn btn-primary btn-secondary btn-quiet btn-danger btn-ghost btn-sm icon-btn link`
`table-scroll data-table num row-active empty-cell`
`badge badge-blue badge-green badge-orange badge-grey badge-red`
`chip-row chip chip-label chip-value chip-blue chip-green chip-orange chip-grey`
`field field-hint field-error field-error-text check radio-row form-grid form-grid-3 span-2`
`banner banner-info banner-warn banner-danger banner-plain`
`tabs tab tab-active` · `detail-list` · `empty-state` · `timeline` · `checklist`
`receipt-paper preview-list preview-row copy-label` · `tag` · `note` · `mono` · `muted` · `small`

Use only these plus new ones you add to `css/styles.css` (add them there, not
inline styles, except for tiny one-off values).

## 5. Rules you must respect (from `reference/01_Codex_Build_Guide.md`)

* Staff-only product: Owner, Manager, Cashier, Mechanic. Hide actions the
  current role may not use — do not render a disabled button for them.
* Mechanic sees only jobs assigned to them (`Store.visibleJobs()`).
* Repair approval is needed when the repair subtotal (repair labour + related
  shop parts/oil, before discount and rounding) is **above** 50,000 MMK.
  Exactly 50,000 does not need approval. Every extra-work version needs approval.
* Editing a quote never changes stock. Only an explicit, approved material issue
  deducts stock, and only once. Stock never goes negative.
* Completing a repair releases its bay immediately; payment and collection stay
  separate and may still be open.
* Full payment only. Cash tendered must cover the payable; change is allowed.
  A wallet payment needs a sample reference and the “Verified (demo)” tick.
* Collect only after full settlement. Close only after completed + settled + collected.
* Paid price lines are locked; corrections keep the original entries.
* All money, messages and purchases are simulated. Say so in the copy.
* The clock is fixed at 28 October 2026, 10:00 Asia/Yangon — always use
  `Store.now()` / `Util.fmtDate(Store.now())`, never the machine date.
* Do not invent a commission rate or live business values; the demo rule in the
  fixture is explicitly illustrative.

## 6. Accessibility checklist

* Every input has a `<label for>`; every action has a visible text label.
* 16 px body text, 44 px minimum control height (the CSS handles this).
* Status is shown as text plus a colour dot, never colour alone.
* Tables live inside `.table-scroll` (already horizontally scrollable and
  keyboard focusable) and have a caption.
* Dialogs: use `App.modal`, which traps Tab, closes on Escape and returns focus.
* Do not use `window.alert`/`window.confirm` — use `App.modal` / `App.confirmDialog`.

## 7. Running it

```
cd C:\KMUTT\DolphinPrototype
python -m http.server 8080
```
then open <http://localhost:8080/>. No build step, no dependencies.
