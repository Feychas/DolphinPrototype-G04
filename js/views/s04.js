/* S04 — Vehicle check-in */
(function (global) {
  'use strict';
  const E = Util.esc;
  global.DolphinViews = global.DolphinViews || {};

  global.DolphinViews.S04 = {
    render: function (ctx) {
      const state = ctx.state;
      const vehicleId = ctx.params.vehicleId || state.selectedVehicleId;
      const vehicle = vehicleId ? Store.vehicle(vehicleId) : null;
      const sample = ctx.fixture.sampleInputs.mainCheckIn;

      let out = UI.pageHeader({
        title: 'Vehicle check-in',
        subtitle: 'Record the visit details. Mileage is per visit and cannot be empty.'
      });

      if (!vehicle) {
        out += UI.card({
          title: 'No vehicle selected',
          body: '<div class="empty-state"><p>Choose a vehicle on the Customers screen first.</p>' +
            UI.btn('Go to Customers', { action: 'nav', variant: 'primary', attrs: { nav: 'S02' } }) + '</div>'
        });
        return out;
      }

      const customer = Store.customer(vehicle.customerId);
      const openVisit = Store.jobsOfVehicle(vehicle.id).filter(j => j.lifecycleStatus === 'Open')[0];
      const latest = Rules.latestMileage(vehicle.id);
      const services = state.services.filter(s => s.active);

      out += UI.card({
        title: 'Vehicle and customer',
        body: UI.dl([
          ['Plate no.', vehicle.plate],
          ['Vehicle', vehicle.brand + ' ' + vehicle.model + ' (' + vehicle.year + ')'],
          ['Customer', customer ? customer.name : '—'],
          ['Phone', customer ? customer.phone : '—'],
          ['Latest recorded mileage', latest === null ? 'No earlier visit' : latest + ' km']
        ])
      });

      if (openVisit) {
        out += UI.banner('warn', 'This vehicle already has an open visit (' + openVisit.id + ')',
          'Only one open visit per vehicle is allowed. A Manager reviews the existing job before another check-in.');
        out += UI.card({
          title: 'Open visit',
          body: '<p>' + E(Rules.jobServiceLabel(openVisit)) + ' · ' + E(openVisit.workStatus) + ' · ' + E(openVisit.paymentStatus) + '</p>' +
            UI.btn('Open ' + openVisit.id, { action: 'nav', variant: 'primary', attrs: { nav: 'S06', params: JSON.stringify({ jobId: openVisit.id }) } })
        });
        return out;
      }

      out += UI.card({
        title: 'Check-in details',
        body: '<form id="checkin-form" data-form="checkin.save" data-vehicle-id="' + E(vehicle.id) + '">' +
          '<div class="form-grid">' +
          UI.field({
            id: 'ci-mileage', name: 'mileageKm', label: 'Mileage (km)', type: 'number', min: 0, step: 1,
            required: true, value: sample.mileageKm,
            hint: 'Zero or more. A lower figure than the last visit needs a Manager.',
            tip: 'Must be zero or more and not below the latest recorded visit unless a Manager confirms it.'
          }) +
          '<div class="field"><label for="ci-size">Size <span class="req" aria-hidden="true">*</span></label>' +
          '<select id="ci-size" name="size" required>' +
          ['S', 'M', 'L'].map(sz => '<option value="' + sz + '"' + (sz === (sample.size || vehicle.size) ? ' selected' : '') + '>' + sz + '</option>').join('') +
          '</select></div>' +
          '<div class="field span-2"><label for="ci-service">Service <span class="req" aria-hidden="true">*</span></label>' +
          '<select id="ci-service" name="serviceId" required>' +
          services.map(s => '<option value="' + E(s.id) + '"' + (s.id === sample.requestedServiceIds[0] ? ' selected' : '') + '>' +
            E(s.nameEN + (s.fixedPriceMMK !== null && s.fixedPriceMMK !== undefined ? ' — ' + Util.mmk(s.fixedPriceMMK) + ' MMK' : '')) +
            '</option>').join('') + '</select>' +
          '<p class="field-hint">The first service starts the quote.<span class="hint-tip" role="img" title="More lines can be added on the Inspection screen." aria-label="More lines can be added on the Inspection screen.">' +
          UI.icon('info', 14) + '</span></p></div>' +
          '<div class="field span-2"><label for="ci-description">Job description</label>' +
          '<textarea id="ci-description" name="description" rows="2" placeholder="What the customer asked for">' +
          E(sample.description || '') + '</textarea>' +
          '<p class="field-hint">A short summary of the work requested.<span class="hint-tip" role="img" title="The mechanic adds the findings on the Inspection screen." aria-label="The mechanic adds the findings on the Inspection screen.">' +
          UI.icon('info', 14) + '</span></p></div>' +
          '<div class="field span-2"><label for="ci-complaint">Customer complaint</label>' +
          '<textarea id="ci-complaint" name="complaint" rows="2" placeholder="What the customer reported, in their own words">' +
          E(sample.complaint || '') + '</textarea>' +
          '<p class="field-hint">Optional.<span class="hint-tip" role="img" title="The customer’s own words are kept as they were said." aria-label="The customer’s own words are kept as they were said.">' +
          UI.icon('info', 14) + '</span></p></div>' +
          '<div class="field"><label for="ci-damage">Existing damage</label>' +
          '<textarea id="ci-damage" name="damage" rows="2">' + E(sample.damage) + '</textarea></div>' +
          '<div class="field"><label for="ci-fuel">Fuel level</label>' +
          '<select id="ci-fuel" name="fuelLevel">' +
          ['Full', 'Three quarters', 'Half', 'Quarter', 'Empty'].map(f => '<option value="' + E(f) + '"' + (f === sample.fuelLevel ? ' selected' : '') + '>' + E(f) + '</option>').join('') +
          '</select></div>' +
          '<div class="field span-2"><label for="ci-belongings">Belongings left in the vehicle</label>' +
          '<input type="text" id="ci-belongings" name="belongings" value="' + E(sample.belongings) + '"></div>' +
          '</div>' +
          '<div class="field"><label class="check" for="ci-confirm-mileage"><input type="checkbox" id="ci-confirm-mileage" name="confirmLowerMileage"> ' +
          '<span>Manager confirms this mileage is a correction of an earlier entry</span></label></div>' +
          '<div class="field"><label for="ci-photo">Check-in photos (optional)</label>' +
          '<input type="text" id="ci-photo" name="damagePhotoNote" placeholder="What the photo shows, e.g. front bumper scratch">' +
          '<p class="field-hint">A photo note for the check-in evidence.<span class="hint-tip" role="img" title="The prototype stores a photo record with a note, author and time. No upload service is connected, so no image file is stored." aria-label="The prototype stores a photo record with a note, author and time. No upload service is connected, so no image file is stored.">' +
          UI.icon('info', 14) + '</span></p></div>' +
          '<div class="form-actions">' +
          UI.btn('Create demo job', { variant: 'primary', icon: 'check', type: 'submit' }) +
          UI.btn('Cancel', { action: 'nav', variant: 'secondary', attrs: { nav: 'S02' } }) +
          '</div></form>'
      });

      out += UI.card({
        title: 'What happens next',
        body: '<p class="note">A Check-in job is created with no bay and no mechanic yet. A Manager assigns the bay from the Bay board, ' +
          'then the mechanic inspects the vehicle and prepares the quote.</p>'
      });

      return out;
    }
  };
})(window);
