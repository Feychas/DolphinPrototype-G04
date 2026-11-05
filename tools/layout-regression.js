/* Layout regression checks for the form controls that previously collapsed
   their labels to a one-character-wide column. Run with the local server on
   port 8080: node tools/layout-regression.js */
const { Session, sleep } = require('./drive');

const BASE = process.env.DOLPHIN_BASE || 'http://127.0.0.1:8080/index.html';

function assert(condition, message, detail) {
  if (!condition) {
    throw new Error(message + (detail ? ' — ' + JSON.stringify(detail) : ''));
  }
}

(async function () {
  const session = await Session.open(BASE, { width: 1440, height: 900 });
  try {
    for (const width of [1440, 900, 620, 390]) {
      await session.setViewport(width, 900);

      const registration = await session.eval(
        'App.go("S03", {mode:"Existing"}, {force:true});' +
        'window.scrollTo(0,500);' +
        'App.go("S03", {mode:"Existing"}, {force:true});' +
        'var labels=[].slice.call(document.querySelectorAll(".radio-row label"));' +
        'return {' +
          'overflow:document.documentElement.scrollWidth-window.innerWidth,' +
          'scrollY:window.scrollY,' +
          'headingTop:document.querySelector(".page-head").getBoundingClientRect().top,' +
          'topbarBottom:document.querySelector(".topbar").getBoundingClientRect().bottom,' +
          'labels:labels.map(function(label){' +
            'var input=label.querySelector("input").getBoundingClientRect();' +
            'var text=label.querySelector("span").getBoundingClientRect();' +
            'var style=getComputedStyle(label.querySelector("input"));' +
            'return {label:label.getBoundingClientRect().width,input:input.width,text:text.width,' +
              'width:style.width,maxWidth:style.maxWidth,flex:style.flex,padding:style.padding};' +
          '})' +
        '};'
      );
      assert(registration.overflow <= 1, 'Registration page overflows the viewport at ' + width + 'px', registration);
      assert(registration.scrollY === 0 && registration.headingTop >= registration.topbarBottom,
        'New screen heading is hidden by the top bar at ' + width + 'px', registration);
      assert(registration.labels.length === 2, 'Customer type controls are missing at ' + width + 'px', registration);
      registration.labels.forEach(function (label) {
        assert(label.label >= 140 && label.text >= 100, 'Customer type label collapsed at ' + width + 'px', label);
        assert(label.input >= 19 && label.input <= 21, 'Customer type radio changed size at ' + width + 'px', label);
      });

      const checkIn = await session.eval(
        'Store.state.selectedVehicleId="VEH-008";' +
        'App.go("S04", {vehicleId:"VEH-008"}, {force:true});' +
        'var label=document.querySelector(".check");' +
        'var input=label.querySelector("input").getBoundingClientRect();' +
        'var text=label.querySelector("span").getBoundingClientRect();' +
        'return {' +
          'overflow:document.documentElement.scrollWidth-window.innerWidth,' +
          'label:label.getBoundingClientRect().width,input:input.width,text:text.width,' +
          'form:document.querySelector("#checkin-form").getBoundingClientRect().width' +
        '};'
      );
      assert(checkIn.overflow <= 1, 'Check-in page overflows the viewport at ' + width + 'px', checkIn);
      assert(checkIn.form >= 280, 'Check-in form collapsed at ' + width + 'px', checkIn);
      assert(checkIn.label >= 240 && checkIn.text >= 180, 'Mileage correction label collapsed at ' + width + 'px', checkIn);
      assert(checkIn.input >= 19 && checkIn.input <= 21, 'Mileage correction checkbox changed size at ' + width + 'px', checkIn);

      console.log('PASS  form layout at ' + width + 'px');
      await sleep(80);
    }
  } finally {
    await session.close();
  }
})().catch(function (error) {
  console.error('FAIL  ' + error.message);
  process.exitCode = 1;
});
