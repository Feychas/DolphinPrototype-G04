/* S02 — Customers, vehicles and service history */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S02 = {
    render: function (ctx) {
      const state = ctx.state;
      const filter = ctx.params.filter || 'active';
      const vehicles = state.vehicles.filter(function (v) {
        if (filter === 'archived') return v.archived;
        if (filter === 'all') return true;
        return !v.archived;
      });
      const selected = state.selectedVehicleId ? Store.vehicle(state.selectedVehicleId) : null;

      let out = UI.pageHeader({
        title: 'Vehicles & history',
        subtitle: 'Search for a vehicle, view details and service history.',
        actions: UI.btn('Register vehicle', { action: 'nav', variant: 'primary', icon: 'plus', attrs: { nav: 'S03' } })
      });

      out += '<div class="search-bar">' +
        '<div class="field" style="flex:1 1 320px;margin-bottom:0">' +
        '<label for="vehicle-search">Search plate or customer name</label>' +
        '<input type="search" id="vehicle-search" placeholder="e.g. DEMO-008" data-live="customers.search" ' +
        'value="' + E(ctx.params.q || '') + '">' +
        '</div>' +
        '<div class="field" style="margin-bottom:0">' +
        '<label for="vehicle-filter">Show</label>' +
        '<select id="vehicle-filter" data-change="customers.filter">' +
        '<option value="active"' + (filter === 'active' ? ' selected' : '') + '>Active vehicles</option>' +
        '<option value="archived"' + (filter === 'archived' ? ' selected' : '') + '>Archived</option>' +
        '<option value="all"' + (filter === 'all' ? ' selected' : '') + '>All vehicles</option>' +
        '</select></div>' +
        '</div>';

      out += UI.card({
        title: 'Vehicles',
        subtitle: 'One customer may own several vehicles. Archived records stay available.',
        body: UI.table({
          label: 'Vehicle list',
          head: ['Plate', 'Vehicle', 'Year', 'Size', 'Customer', 'Phone', 'Status', 'Last service'],
          rows: vehicles.map(function (v) {
            const c = Store.customer(v.customerId);
            const jobs = Store.jobsOfVehicle(v.id);
            const last = jobs.length ? Util.sortBy(jobs, j => j.createdAt).pop() : null;
            const hay = (v.plate + ' ' + (c ? c.name : '') + ' ' + v.brand + ' ' + v.model).toLowerCase();
            return {
              attr: ' data-vehicle-row data-search="' + E(hay) + '"' + (selected && selected.id === v.id ? ' class="row-active"' : ''),
              cells: [
                { html: '<button type="button" class="link" data-action="customers.selectVehicle" data-vehicle-id="' + E(v.id) + '">' + E(v.plate) + '</button>' },
                E(v.brand + ' ' + v.model),
                E(String(v.year)),
                E(v.size),
                E(c ? c.name : '—'),
                E(c ? c.phone : '—'),
                { html: v.archived ? UI.badge('Archived', 'grey') : UI.badge('Active', 'green') },
                last ? E(Util.fmtDate(last.createdAt)) : '—'
              ]
            };
          }),
          empty: 'No vehicle matches this filter.'
        }) + '<p class="note" id="vehicle-count">' + vehicles.length + ' vehicles</p>'
      });

      if (!selected) {
        out += UI.card({
          title: 'Vehicle details',
          body: '<div class="empty-state"><p>Select a vehicle above to see its contact details and service history.</p></div>'
        });
        return out;
      }

      const customer = Store.customer(selected.customerId);
      const jobs = Util.sortBy(Store.jobsOfVehicle(selected.id), j => j.createdAt).reverse();
      const openJob = jobs.filter(j => j.lifecycleStatus === 'Open')[0];

      out += '<div class="grid-2-even">' +
        UI.card({
          title: 'Vehicle details',
          actions: UI.btn('Edit customer', { action: 'customers.edit', variant: 'secondary', icon: 'edit' }),
          body: UI.dl([
            ['Plate no.', selected.plate],
            ['Vehicle', selected.brand + ' ' + selected.model],
            ['Year', String(selected.year)],
            ['Size', selected.size],
            ['Customer', customer ? customer.name : '—'],
            ['Phone', customer ? customer.phone : '—'],
            ['Viber', customer && customer.viber ? customer.viber : '—'],
            ['Facebook', customer && customer.facebook ? customer.facebook : '—'],
            ['Archive', selected.archived ? 'Archived (' + E(selected.archiveReason || 'no reason stored') + ')' : 'Active']
          ]) +
          '<div class="row" style="margin-top:16px">' +
          UI.btn('New check-in', { action: 'customers.checkin', variant: 'primary' }) +
          (openJob ? UI.btn('Open job ' + openJob.id, { action: 'customers.openJob', variant: 'secondary', attrs: { jobId: openJob.id } }) : '') +
          (selected.archived
            ? UI.btn('Restore from archive', { action: 'customers.unarchiveVehicle', variant: 'secondary', attrs: { vehicleId: selected.id } })
            : UI.btn('Archive vehicle', { action: 'customers.archiveVehicle', variant: 'quiet', attrs: { vehicleId: selected.id } })) +
          '</div>'
        }) +
        UI.card({
          title: 'Service history',
          subtitle: 'Mileage and status for every visit of this vehicle.',
          body: UI.table({
            label: 'Service history for ' + selected.plate,
            head: ['Date', 'Job', 'Service', 'Mileage', 'Status'],
            rows: jobs.map(function (j) {
              return [
                E(Util.fmtDate(j.createdAt)),
                { html: UI.link(j.id, 'S06', { jobId: j.id }) },
                E(Rules.jobServiceLabel(j)),
                E(j.mileageKm !== null && j.mileageKm !== undefined ? j.mileageKm + ' km' : '—'),
                { html: UI.statusBadge(j.workStatus) + ' ' + UI.statusBadge(j.paymentStatus) }
              ];
            }),
            empty: 'This vehicle has no recorded visits.'
          })
        }) +
        '</div>';

      return out;
    }
  };
})(window);
