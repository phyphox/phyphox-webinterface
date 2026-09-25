// Browser tests for the remote web interface, run with `npm test` (node --test, puppeteer-core
// driving the system Chromium/Chrome in headless mode).
//
//   Against the mock (default): the suite starts test/mock_server.js itself.
//   Against a running app:      PHYPHOX_URL=http://127.0.0.1:8080/ npm test
//                               with test/fixtures/webgraphs.phyphox open in the app and remote
//                               access enabled (see readme.md, "Tests").
//
// Graphs are looked up by their label, so the same tests run in both modes; a test whose graph is
// not part of the served experiment is skipped. Environment: PUPPETEER_EXECUTABLE_PATH or
// CHROME_PATH to pick the browser, KEEP_SCREENSHOTS=1 to save screenshots under test/out/.
'use strict';
const {test, before, after, beforeEach} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const mock = require('./mock_server.js');

const MOCK_PORT = 8081;
const BASE_URL = process.env.PHYPHOX_URL || `http://127.0.0.1:${MOCK_PORT}/`;
const DEVICE = !!process.env.PHYPHOX_URL;
const OUT = path.join(__dirname, 'out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function browserPath() {
  const candidates = [process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH,
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  throw new Error('no Chromium/Chrome found; set PUPPETEER_EXECUTABLE_PATH');
}

let server = null, browser = null, page = null, pageErrors = [];

before(async () => {
  if (!DEVICE) server = mock.start(MOCK_PORT);
  browser = await puppeteer.launch({executablePath: browserPath(), headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--window-size=1400,900']});
  if (process.env.KEEP_SCREENSHOTS) fs.mkdirSync(OUT, {recursive: true});
});

after(async () => {
  if (page) await api('control?cmd=stop').catch(() => {});
  if (browser) await browser.close();
  if (server) server.close();
});

// Every test starts from a freshly loaded page, so the order of tests does not matter
beforeEach(async () => {
  if (page) await page.close();
  page = await browser.newPage();
  await page.setViewport({width: 1400, height: 900, deviceScaleFactor: 1});
  pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) pageErrors.push(m.text()); });
  await page.goto(BASE_URL, {waitUntil: 'load'});
  await sleep(500);
  await api('control?cmd=clear'); // every test starts from an empty, stopped experiment
  await sleep(500);
});

// ---- helpers ----
const api = async p => page.evaluate(async p => (await fetch(p)).json(), p);
const shot = async name => { if (process.env.KEEP_SCREENSHOTS) await page.screenshot({path: path.join(OUT, name + '.png')}); };
const assertNoErrors = () => assert.deepEqual(pageErrors, [], 'page errors');

// Element index of the graph with this label in the current view, or null
async function graphByLabel(label) {
  return page.evaluate(label => {
    for (const el of document.querySelectorAll('#views .graphElement')) {
      if (el.querySelector('.label').textContent === label) return parseInt(el.id.substring(7));
    }
    return null;
  }, label);
}

async function requireGraph(t, label) {
  const idx = await graphByLabel(label);
  if (idx === null) { t.skip(`no graph "${label}" in the served experiment`); return null; }
  return idx;
}

const sel = (idx, s) => `#element${idx} ${s}`;
const state = idx => page.evaluate(i => PhyphoxGraph.state(i), idx);
const scales = idx => page.evaluate(i => { const c = Chart.getChart(document.querySelector('#element' + i + ' canvas')); return {x: [c.scales.x.min, c.scales.x.max], y: [c.scales.y.min, c.scales.y.max], xType: c.scales.x.type, yType: c.scales.y.type}; }, idx);
const info = idx => page.evaluate(i => document.querySelector('#element' + i + ' .graphInfo').innerText, idx);
const width = r => r[1] - r[0];

// Page position of a data point of a dataset
const pointPos = (idx, ds, i) => page.evaluate((idx, ds, i) => {
  const c = Chart.getChart(document.querySelector('#element' + idx + ' canvas'));
  const d = c.data.datasets[ds].data;
  const j = i < 0 ? d.length + i : i;
  const r = c.canvas.getBoundingClientRect();
  return {x: r.left + c.scales.x.getPixelForValue(d[j].x), y: r.top + c.scales.y.getPixelForValue(d[j].y), dx: d[j].x, dy: d[j].y};
}, idx, ds, i);

// Index of the point of dataset ds nearest to the middle of the visible x range
const visiblePoint = (idx, ds) => page.evaluate((idx, ds) => {
  const c = Chart.getChart(document.querySelector('#element' + idx + ' canvas'));
  const d = c.data.datasets[ds].data;
  const mid = (c.scales.x.min + c.scales.x.max) / 2;
  let best = 0;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i].x - mid) < Math.abs(d[best].x - mid)) best = i;
  return best;
}, idx, ds);

// The spot on a vertical line through the plot with the largest distance to any visible point
const farPosition = idx => page.evaluate(idx => {
  const c = Chart.getChart(document.querySelector('#element' + idx + ' canvas'));
  const r = c.canvas.getBoundingClientRect();
  const a = c.chartArea;
  const pts = [];
  c.data.datasets.forEach(ds => { if (ds.phyphoxStyle === 'fit') return; ds.data.forEach(p => {
    if (isFinite(p.x) && isFinite(p.y) && p.x >= c.scales.x.min && p.x <= c.scales.x.max && p.y >= c.scales.y.min && p.y <= c.scales.y.max)
      pts.push({x: c.scales.x.getPixelForValue(p.x), y: c.scales.y.getPixelForValue(p.y)});
  }); });
  let best = null;
  for (let f = 0.05; f <= 0.95; f += 0.05) {
    for (let g = 0.05; g <= 0.95; g += 0.15) {
      const x = a.left + (a.right - a.left) * g, y = a.top + (a.bottom - a.top) * f;
      let d = Infinity;
      for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
      if (!best || d > best.distance) best = {x: r.left + x, y: r.top + y, distance: d};
    }
  }
  return best;
}, idx);

// Current page position of the last pick marker (the data may have moved since the click)
const markerPos = idx => page.evaluate(idx => {
  const c = Chart.getChart(document.querySelector('#element' + idx + ' canvas'));
  const s = PhyphoxGraph.state(idx);
  const p = s.picks[s.picks.length - 1];
  const r = c.canvas.getBoundingClientRect();
  return {x: r.left + c.scales.x.getPixelForValue(p.x), y: r.top + c.scales.y.getPixelForValue(p.y)};
}, idx);

// Index of a point of dataset ds at least minPx pixels away on screen from point i, searching towards lower indices first
const pointAwayFrom = (idx, ds, i, minPx) => page.evaluate((idx, ds, i, minPx) => {
  const c = Chart.getChart(document.querySelector('#element' + idx + ' canvas'));
  const d = c.data.datasets[ds].data;
  const px = p => ({x: c.scales.x.getPixelForValue(p.x), y: c.scales.y.getPixelForValue(p.y)});
  const p0 = px(d[i]);
  for (let step = 1; step < d.length; step++) {
    for (const j of [i - step, i + step]) {
      if (j < 0 || j >= d.length || !isFinite(d[j].x) || !isFinite(d[j].y)) continue;
      const p = px(d[j]);
      if (Math.hypot(p.x - p0.x, p.y - p0.y) >= minPx) return j;
    }
  }
  return null;
}, idx, ds, i, minPx);

async function startMeasuring(seconds) {
  await api('control?cmd=start');
  await sleep(seconds * 1000);
}

async function maximize(idx) {
  await page.click(sel(idx, '.label'));
  await sleep(500);
}

async function drag(x0, y0, x1, y1, modifier) {
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, {steps: 10});
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
  await sleep(400);
}

// ---- the tests ----

test('the page loads, builds one chart per graph and raises no errors', async () => {
  const counts = await page.evaluate(() => ({graphs: document.querySelectorAll('#views .graphElement').length, canvases: document.querySelectorAll('#views canvas').length, charts: Array.from(document.querySelectorAll('#views canvas')).filter(c => Chart.getChart(c)).length}));
  assert.ok(counts.graphs >= 3, 'at least the three fixture graphs');
  assert.equal(counts.canvases, counts.graphs);
  await startMeasuring(1.5);
  const charts = await page.evaluate(() => Array.from(document.querySelectorAll('#views canvas')).filter(c => Chart.getChart(c)).length);
  assert.equal(charts, counts.graphs, 'every graph has a chart once data arrived');
  await shot('load');
  assertNoErrors();
});

test('the served page embeds the graph configuration and the translated strings', async () => {
  const html = await page.evaluate(async () => (await fetch('/')).text());
  assert.match(html, /"graph":\{/, 'graph configuration objects');
  assert.match(html, /graphStrings = Object\.assign\(graphStrings, \{/, 'graph strings block');
  assert.match(html, /"pickOutputs":\[\{"axis":"x","buffer":"pickedX"/, 'pick outputs of the picker graph');
  assert.match(html, /"followX":true/, 'followX of the follow graph');
});

test('a partial-update graph keeps growing while measuring', async t => {
  const idx = await requireGraph(t, 'Acceleration (partial, 3 datasets)');
  if (idx === null) return;
  await startMeasuring(1.5);
  const a = (await state(idx)).pointCounts[0];
  await sleep(1500);
  const b = (await state(idx)).pointCounts[0];
  assert.ok(a > 0 && b > a, `points grow: ${a} -> ${b}`);
  const s = await state(idx);
  assert.equal(s.pointCounts[1], s.pointCounts[0], 'second dataset shares the x buffer');
  assertNoErrors();
});

test('mouse: drag pans, shift+drag zooms into a box, wheel zooms, a flat shift+drag keeps the y range, reset restores', async t => {
  const idx = await requireGraph(t, 'Acceleration (partial, 3 datasets)');
  if (idx === null) return;
  await startMeasuring(2);
  await maximize(idx);
  const initial = await scales(idx);
  assert.equal(await page.$eval(sel(idx, '.graphTool_reset'), b => b.disabled), true, 'reset disabled before any zoom');

  await drag(400, 300, 800, 600, 'Shift');
  const zoomed = await scales(idx);
  assert.ok(width(zoomed.x) < width(initial.x) * 0.5 && width(zoomed.y) < width(initial.y) * 0.8, 'box zoom narrowed both axes');
  assert.ok(zoomed.x[0] > initial.x[0] && zoomed.x[1] < initial.x[1], 'inside the initial range');
  assert.equal(await page.$eval(sel(idx, '.graphTool_reset'), b => b.disabled), false, 'reset enabled');

  await page.mouse.move(600, 450);
  await page.mouse.wheel({deltaY: -300});
  await sleep(500);
  const wheeled = await scales(idx);
  assert.ok(width(wheeled.x) < width(zoomed.x), 'wheel zoomed in further');

  await drag(600, 450, 400, 450);
  const panned = await scales(idx);
  assert.ok(Math.abs(width(panned.x) - width(wheeled.x)) < width(wheeled.x) * 0.01, 'a plain drag pans and keeps the width');
  assert.ok(panned.x[0] > wheeled.x[0], 'panned towards larger x');

  await drag(500, 450, 800, 450, 'Shift');
  const flat = await scales(idx);
  assert.ok(width(flat.y) > 0 && Math.abs(width(flat.y) - width(panned.y)) < 1e-9, 'a flat zoom box does not collapse the y axis');
  await shot('zoom');

  await page.click(sel(idx, '.graphTool_reset'));
  await sleep(400);
  const reset = await scales(idx);
  assert.ok(width(reset.x) >= width(initial.x) * 0.9, 'back to the full range');
  assert.equal(await page.$eval(sel(idx, '.graphTool_reset'), b => b.disabled), true);
  assertNoErrors();
});

test('follow: switched on without a zoom the window keeps its width and slides with the newest data', async t => {
  const idx = await requireGraph(t, 'Acceleration (partial, 3 datasets)');
  if (idx === null) return;
  await startMeasuring(2);
  await maximize(idx);
  // The plot keeps growing with the data between two puppeteer calls, so the width and the click
  // that freezes it happen in one JavaScript turn - otherwise "the width at the click" is a race
  const before = await page.evaluate(i => {
    const c = Chart.getChart(document.querySelector('#element' + i + ' canvas'));
    const w = {x: [c.scales.x.min, c.scales.x.max]};
    document.querySelector('#element' + i + ' .graphTool_follow').click();
    return w;
  }, idx);
  await sleep(1200);
  const s1 = await scales(idx);
  await sleep(1200);
  const s2 = await scales(idx);
  assert.ok(Math.abs(width(s2.x) - width(s1.x)) < 1e-6, 'width unchanged while following');
  assert.ok(Math.abs(width(s1.x) - width(before.x)) < width(before.x) * 0.05, 'the width the plot had when follow was switched on');
  assert.ok(s2.x[0] > s1.x[0], `window slides: ${s1.x[0]} -> ${s2.x[0]}`);
  // a zoom while following keeps following with the new width
  await page.mouse.move(600, 450);
  await page.mouse.wheel({deltaY: -600});
  await sleep(1000);
  const z1 = await scales(idx);
  await sleep(1000);
  const z2 = await scales(idx);
  assert.ok(width(z1.x) < width(before.x) && Math.abs(width(z2.x) - width(z1.x)) < 1e-6 && z2.x[1] > z1.x[1], 'zoomed window keeps sliding');
  assertNoErrors();
});

test('followX: the configured window sits at the newest data from the first frame on', async t => {
  const idx = await requireGraph(t, 'Follow x (5 s)');
  if (idx === null) return;
  await startMeasuring(2);
  const s = await scales(idx);
  const newest = (await pointPos(idx, 0, -1)).dx;
  assert.ok(Math.abs(width(s.x) - 5) < 1e-6, 'window width 5');
  assert.ok(Math.abs(s.x[1] - newest) < 0.2, 'anchored at the newest x');
  assert.deepEqual(s.y.map(v => Math.round(v)), [-15, 15], 'fixed y range');
  assert.equal(await page.$eval(sel(idx, '.graphTool_follow'), b => b.classList.contains('active')), true);
});

test('picker: click selects the nearest point on screen, hover previews, drag spans two points, empty space deselects', async t => {
  const idx = await requireGraph(t, 'Acceleration (partial, 3 datasets)');
  if (idx === null) return;
  await startMeasuring(2);
  await api('control?cmd=stop'); // static data: points stay where they are while picking
  await sleep(500);
  await maximize(idx);
  await page.click(sel(idx, '.graphTool_pick'));
  await sleep(300);
  assert.equal((await state(idx)).mode, 'pick');

  // three curves share the x values; a click next to the second one must pick it, not the first
  const i1 = await visiblePoint(idx, 1);
  const p1 = await pointPos(idx, 1, i1);
  await page.mouse.click(p1.x + 3, p1.y + 3);
  await sleep(400);
  let s = await state(idx);
  assert.equal(s.picks.length, 1);
  assert.equal(s.picks[0].datasetIndex, 1, 'nearest on screen');
  assert.match(await info(idx), /Point: /);
  assert.doesNotMatch(await info(idx), /Difference/);
  const box = await page.$eval(sel(idx, '.graphInfo'), b => ({top: parseFloat(b.style.top), h: b.offsetHeight}));
  const canvasTop = await page.$eval(sel(idx, 'canvas'), c => c.getBoundingClientRect().top);
  assert.ok(Math.abs(box.top + box.h / 2 + canvasTop - p1.y) < box.h, 'info box next to the picked point');

  // hovering previews the nearest point without changing the selection
  const i2 = await pointAwayFrom(idx, 1, i1, 80);
  assert.notEqual(i2, null, 'a second point far enough away on screen');
  const p2 = await pointPos(idx, 1, i2);
  const painted = async () => page.evaluate((idx, x, y) => {
    const c = Chart.getChart(document.querySelector('#element' + idx + ' canvas'));
    const r = c.canvas.getBoundingClientRect();
    const d = c.ctx.getImageData(Math.round((x - r.left - 10) * window.devicePixelRatio), Math.round((y - r.top - 10) * window.devicePixelRatio), Math.round(20 * window.devicePixelRatio), Math.round(20 * window.devicePixelRatio)).data;
    let sum = 0;
    for (let k = 0; k < d.length; k += 4) sum += d[k] + d[k + 1] + d[k + 2];
    return sum;
  }, idx, p2.x, p2.y);
  const before = await painted();
  await page.mouse.move(p2.x + 2, p2.y - 2);
  await sleep(300);
  s = await state(idx);
  assert.deepEqual(s.preview, {datasetIndex: 1, index: i2}, 'preview of the point under the mouse');
  assert.equal(s.picks.length, 1, 'hover does not pick');
  assert.ok(await painted() > before * 1.2, 'the preview marker is painted around the point');

  // dragging from the picked point to another spans the two
  await drag(p1.x, p1.y, p2.x, p2.y);
  s = await state(idx);
  assert.equal(s.picks.length, 2, 'drag selected a second point');
  assert.equal(s.picks[1].index, i2);
  const text = await info(idx);
  assert.match(text, /Difference: /);
  assert.match(text, /Slope: .*m\/s³/, 'slope with unitYperX');
  await shot('pick');

  // a click in empty space deselects
  const far = await farPosition(idx);
  assert.ok(far.distance > 40, `found a spot ${far.distance.toFixed(0)} px away from all points`);
  await page.mouse.click(far.x, far.y);
  await sleep(300);
  assert.equal((await state(idx)).picks.length, 0, 'a click far from the data deselects');

  // a click on a marker removes it, the clear button clears
  await page.mouse.click(p2.x, p2.y);
  await sleep(300);
  assert.equal((await state(idx)).picks.length, 1);
  const marker = await markerPos(idx);
  await page.mouse.click(marker.x, marker.y);
  await sleep(300);
  assert.equal((await state(idx)).picks.length, 0, 'clicking the marker of the picked point removes it');
  await page.mouse.click(p2.x, p2.y);
  await sleep(300);
  await page.click(sel(idx, '.pickClear'));
  await sleep(300);
  assert.equal((await state(idx)).picks.length, 0, 'clear button');

  // a drag that starts in empty space selects nothing
  await drag(far.x, far.y, p2.x, p2.y);
  assert.equal((await state(idx)).picks.length, 0, 'drag from empty space');
  assertNoErrors();
});

test('picker outputs write the picked and the assigned value into the buffers', async t => {
  const idx = await requireGraph(t, 'Picker (dots)');
  if (idx === null) return;
  await startMeasuring(2);
  await api('control?cmd=stop'); // static data: the info box and its buttons stay put
  await sleep(500);
  await maximize(idx);
  await page.click(sel(idx, '.graphTool_pick'));
  await sleep(300);
  const i = await visiblePoint(idx, 0);
  const p = await pointPos(idx, 0, i);
  await page.mouse.click(p.x, p.y);
  await sleep(400);
  const buttons = await page.$$eval(sel(idx, '.pickOutput'), bs => bs.map(b => b.textContent));
  assert.deepEqual(buttons, ['Calibration point', 'Pick y']);

  await page.click(sel(idx, '.pickOutput:nth-child(2)'));
  await sleep(800);
  await page.click(sel(idx, '.pickOutput:nth-child(1)'));
  await sleep(300);
  assert.match(await info(idx), /Assigned wavelength in nm/, 'prompt for the assigned value');
  await page.type(sel(idx, '.pickCalInput'), 'abc');
  await page.keyboard.press('Enter');
  await sleep(300);
  assert.match(await info(idx), /Invalid value/i);
  await page.click(sel(idx, '.pickCalInput'), {clickCount: 3});
  await page.type(sel(idx, '.pickCalInput'), '532.5');
  await page.keyboard.press('Enter');
  await sleep(1000);
  assert.doesNotMatch(await info(idx), /Assigned wavelength/, 'prompt closed');

  const r = await api('get?pickedX=full&assigned=full&pickedY=full');
  assert.equal(r.buffer.pickedX.buffer.length, 1, 'replaced, not appended');
  assert.ok(Math.abs(r.buffer.pickedX.buffer[0] - p.dx) < 1e-3, 'picked x');
  assert.deepEqual(r.buffer.assigned.buffer, [532.5]);
  assert.ok(Math.abs(r.buffer.pickedY.buffer[0] - p.dy) < 1e-3, 'picked y');
  await shot('pick-outputs');
  assertNoErrors();
});

test('touch: pinch zooms, one finger pans, a tap picks', async t => {
  const idx = await requireGraph(t, 'Acceleration (partial, 3 datasets)');
  if (idx === null) return;
  await startMeasuring(2);
  await maximize(idx);
  const client = await page.target().createCDPSession();
  const touch = (type, points) => client.send('Input.dispatchTouchEvent', {type, touchPoints: points});
  const before = await scales(idx);
  await touch('touchStart', [{x: 500, y: 450, id: 1}, {x: 700, y: 450, id: 2}]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [{x: 500 - i * 15, y: 450, id: 1}, {x: 700 + i * 15, y: 450, id: 2}]); await sleep(20); }
  await touch('touchEnd', []);
  await sleep(500);
  const pinched = await scales(idx);
  assert.ok(width(pinched.x) < width(before.x) * 0.8, 'pinch zoomed in');
  assert.equal(await page.evaluate(() => window.visualViewport.scale), 1, 'the pinch went to the chart, not to the page');
  assert.equal(await page.$eval(sel(idx, 'canvas'), c => getComputedStyle(c).touchAction), 'none', 'touch-action none while zooming');

  await touch('touchStart', [{x: 700, y: 450, id: 1}]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [{x: 700 - i * 20, y: 450, id: 1}]); await sleep(20); }
  await touch('touchEnd', []);
  await sleep(500);
  const panned = await scales(idx);
  assert.ok(panned.x[0] > pinched.x[0] && Math.abs(width(panned.x) - width(pinched.x)) < width(pinched.x) * 0.02, 'panned');

  await api('control?cmd=stop'); // static data while picking
  await sleep(500);
  await page.click(sel(idx, '.graphTool_pick'));
  await sleep(300);
  const i = await visiblePoint(idx, 0);
  const p = await pointPos(idx, 0, i);
  await touch('touchStart', [{x: p.x, y: p.y, id: 1}]);
  await touch('touchEnd', []);
  await sleep(400);
  assert.equal((await state(idx)).picks.length, 1, 'tap picked a point');
  // a finger dragged from the point to another spans the two
  const j = await pointAwayFrom(idx, 0, i, 80);
  const q = await pointPos(idx, 0, j);
  await touch('touchStart', [{x: p.x, y: p.y, id: 1}]);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', [{x: p.x + (q.x - p.x) * k / 8, y: p.y + (q.y - p.y) * k / 8, id: 1}]); await sleep(20); }
  await touch('touchEnd', []);
  await sleep(400);
  const s = await state(idx);
  assert.equal(s.picks.length, 2, 'touch drag selected a second point');
  assert.equal(s.picks[1].index, j);
  // a tap in empty space deselects
  const far = await farPosition(idx);
  await touch('touchStart', [{x: far.x, y: far.y, id: 1}]);
  await touch('touchEnd', []);
  await sleep(400);
  assert.equal((await state(idx)).picks.length, 0, 'tap in empty space deselects');
  assertNoErrors();
});

test('logarithmic axis from the experiment can be switched to linear and back', async t => {
  await page.click('#viewSelector li:nth-child(2)');
  await sleep(800);
  const idx = await requireGraph(t, 'Log y');
  if (idx === null) return;
  await startMeasuring(1.5);
  await maximize(idx);
  assert.equal((await scales(idx)).yType, 'logarithmic');
  assert.equal(await page.$(sel(idx, '.graphTool_logX')), null, 'no log x toggle for a linear x axis');
  await page.click(sel(idx, '.graphTool_logY'));
  await sleep(500);
  assert.equal((await scales(idx)).yType, 'linear');
  await page.click(sel(idx, '.graphTool_logY'));
  await sleep(500);
  assert.equal((await scales(idx)).yType, 'logarithmic');
  assertNoErrors();
});

test('leaving the maximized view, switching views, bright mode and font size recreate the charts cleanly', async () => {
  await startMeasuring(1);
  const first = await page.evaluate(() => parseInt(document.querySelector('#views .graphElement').id.substring(7)));
  await maximize(first);
  assert.equal(await page.evaluate(() => document.body.classList.contains('exclusive')), true);
  await page.click(sel(first, '.label'));
  await sleep(400);
  assert.equal(await page.evaluate(() => document.body.classList.contains('exclusive')), false);
  // a click on the plot itself maximizes it as well
  await page.click(sel(first, 'canvas'));
  await sleep(400);
  assert.equal(await page.evaluate(() => document.body.classList.contains('exclusive')), true, 'click on the plot maximizes');
  assert.equal((await state(first)).interactive, true);
  await page.click(sel(first, '.label'));
  await sleep(400);
  await page.click('#viewSelector li:nth-child(2)');
  await sleep(800);
  assert.ok(await page.evaluate(() => document.querySelectorAll('#views canvas').length) >= 1);
  await page.click('#viewSelector li:nth-child(1)');
  await sleep(800);
  await page.evaluate(() => toggleBrightMode());
  await sleep(800);
  assert.equal(await page.evaluate(() => document.body.classList.contains('brightMode')), true);
  await shot('bright');
  await page.evaluate(() => toggleBrightMode());
  await page.evaluate(() => zoomLarger({stopPropagation() {}}));
  await sleep(800);
  await page.evaluate(() => zoomDefault({stopPropagation() {}}));
  await sleep(800);
  const charts = await page.evaluate(() => Array.from(document.querySelectorAll('#views canvas')).filter(c => Chart.getChart(c)).length);
  assert.ok(charts >= 3);
  assertNoErrors();
});

test('phone width: the maximized graph fills the view', async t => {
  const idx = await requireGraph(t, 'Acceleration (partial, 3 datasets)');
  if (idx === null) return;
  await page.setViewport({width: 400, height: 800, deviceScaleFactor: 1});
  await startMeasuring(1.5);
  await maximize(idx);
  const box = await page.$eval(sel(idx, '.graphBox'), b => b.getBoundingClientRect().height);
  assert.ok(box > 400, `plot box height ${box}`);
  await shot('phone');
  assertNoErrors();
});

// ---- mock-only graph variants ----

test('empty plot, out-of-range data and gaps are reported as such', async t => {
  const empty = await requireGraph(t, 'Empty');
  if (empty === null) return;
  await startMeasuring(1);
  assert.equal((await state(empty)).status, 'noData');
  assert.equal((await state(await graphByLabel('Out of range'))).status, 'noDataInRange');
  const gaps = await graphByLabel('Gaps and precision');
  assert.equal((await state(gaps)).status, 'ok');
  const ticks = await page.evaluate(i => Chart.getChart(document.querySelector('#element' + i + ' canvas')).scales.y.ticks.map(t => t.label), gaps);
  assert.ok(ticks.every(l => /^-?\d\.\d+$/.test(l)), `two significant digits on ticks: ${ticks.join(' ')}`);
});

test('color map: image, color scale and zoom', async t => {
  const idx = await requireGraph(t, 'Audio spectrum map');
  if (idx === null) return;
  await startMeasuring(3);
  assert.equal((await state(idx)).status, 'ok');
  assert.equal((await state(idx)).pointCounts[0] % 64, 0, 'whole rows');
  await maximize(idx);
  const before = await scales(idx);
  await page.mouse.move(600, 500);
  await page.mouse.wheel({deltaY: -300});
  await sleep(500);
  const after = await scales(idx);
  assert.ok(width(after.x) < width(before.x), 'wheel zoom on the map');
  await shot('map');
  assertNoErrors();
});

test('system time axis labels ticks as clock time, also after a reload while paused', async t => {
  const idx = await requireGraph(t, 'System time axis');
  if (idx === null) return;
  await startMeasuring(1.5);
  const tickLabels = () => page.evaluate(i => Chart.getChart(document.querySelector('#element' + i + ' canvas')).scales.x.ticks.map(t => t.label), idx);
  let labels = await tickLabels();
  assert.ok(labels.length > 1 && labels.every(l => /\d{1,2}:\d{2}/.test(l)), `clock labels: ${labels.join(' | ')}`);
  await api('control?cmd=stop');
  await sleep(300);
  await page.reload({waitUntil: 'load'});
  await sleep(1500);
  labels = await tickLabels();
  assert.ok(labels.length > 1 && labels.every(l => /\d{1,2}:\d{2}/.test(l)), `clock labels after a reload while paused: ${labels.join(' | ')}`);
  const title = await page.evaluate(i => Chart.getChart(document.querySelector('#element' + i + ' canvas')).options.scales.x.title.text, idx);
  assert.match(title, /UTC/);
});

test('legacy elements with app-generated functions still update', async t => {
  if (DEVICE) { t.skip('mock only'); return; }
  await startMeasuring(1.5);
  const text = await page.evaluate(() => Array.from(document.querySelectorAll('.valueElement')).map(e => e.innerText.replace(/\s+/g, ' ')).join(' | '));
  assert.match(text, /Current value\s*\d+\.\d\d m\/s²/);
});

// ---- view groups, transforms, alpha colours and the fixed plot area (file format 1.21) ----
// The "Groups" view exists in the mock and in fixtures/webgroups.phyphox; against an app serving another experiment
// these tests skip.

const post = (p, body) => page.evaluate(async (p, body) => (await fetch(p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})).json(), p, body);
const rect = sel => page.evaluate(sel => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height};
}, sel);
const rects = sel => page.evaluate(sel => Array.from(document.querySelectorAll(sel)).map(el => {
  const r = el.getBoundingClientRect();
  return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, display: getComputedStyle(el).display};
}), sel);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
// The 2D matrix of an element's computed transform as [a, b, c, d, e, f]; identity for "none"
const matrix = sel => page.evaluate(sel => {
  const t = getComputedStyle(document.querySelector(sel)).transform;
  if (t === 'none') return [1, 0, 0, 1, 0, 0];
  return t.replace(/[^\d,.eE-]/g, '').split(',').map(parseFloat);
}, sel);

async function requireView(t, name) {
  const idx = await page.evaluate(n => views.findIndex(v => v.name === n), name);
  if (idx < 0) { t.skip(`no view "${name}" in the served experiment`); return false; }
  await page.evaluate(i => switchView(i), idx);
  await sleep(700);
  return true;
}

test('view groups: a horizontal splits the row by weight, a grid picks its columns from the width, a stack shares one rectangle', async t => {
  if (!(await requireView(t, 'Groups'))) return;
  // horizontal: weights 2, 1, 1 -> the first child is twice as wide, all are centred on one row
  const row = await rects('#views .group_horizontal > *');
  assert.equal(row.length, 3);
  near(row[0].width / row[1].width, 2, 0.1, 'weight 2 vs 1');
  near(row[1].width, row[2].width, 2, 'equal weights');
  const rowRect = await rect('#views .group_horizontal');
  const rowCentre = (rowRect.top + rowRect.bottom) / 2;
  row.forEach((r, i) => near((r.top + r.bottom) / 2, rowCentre, 3, `child ${i} centred in the row`));
  assert.ok(row[2].height > row[0].height, 'the vertical child with two values is the tallest');

  // grid: n = ceil(width / (maxWidth em)); with fillLastRow the children of the last row share it
  const gridState = async () => page.evaluate(() => {
    const grid = document.querySelector('#views .group_grid');
    const em = parseFloat(getComputedStyle(grid).fontSize);
    const children = Array.from(grid.children).map(c => c.getBoundingClientRect());
    return {width: grid.getBoundingClientRect().width, em, children: children.map(r => ({top: Math.round(r.top), width: r.width}))};
  });
  for (const viewport of [1400, 700, 380]) {
    await page.setViewport({width: viewport, height: 900, deviceScaleFactor: 1});
    await sleep(400);
    const g = await gridState();
    const expected = Math.max(1, Math.ceil(g.width / (25 * g.em) - 1e-6));
    const firstRow = g.children.filter(c => c.top === g.children[0].top).length;
    assert.equal(firstRow, Math.min(expected, 3), `columns at ${viewport}px (grid ${Math.round(g.width)}px, em ${g.em})`);
    const lastRowCount = ((3 - 1) % expected) + 1;
    near(g.children[2].width, g.width / lastRowCount, 2, `fillLastRow at ${viewport}px`);
  }
  await page.setViewport({width: 1400, height: 900, deviceScaleFactor: 1});
  await sleep(400);

  // stack: every child takes the full width, the tallest sets the height, the others are centred (layout boxes,
  // i.e. before the CSS transforms of the transform children)
  const stack = await page.evaluate(() => { const s = document.querySelector('#views .group_stack'); return {width: s.offsetWidth, height: s.offsetHeight}; });
  // offsets relative to the stack (the stack is not positioned, so the children's offsetParent is further up)
  const layers = await page.evaluate(() => { const s = document.querySelector('#views .group_stack'); return Array.from(s.children).map(c => ({left: c.offsetLeft - s.offsetLeft, width: c.offsetWidth, top: c.offsetTop - s.offsetTop, height: c.offsetHeight})); });
  assert.ok(layers.length >= 3);
  let tallest = 0;
  layers.forEach((l, i) => {
    near(l.left, 0, 1, `layer ${i} left`);
    near(l.width, stack.width, 1, `layer ${i} width`);
    near(l.top + l.height / 2, stack.height / 2, 2, `layer ${i} centred`);
    tallest = Math.max(tallest, l.height);
  });
  near(stack.height, tallest, 1, 'stack height = tallest child');
  // the image below the plot came through /res
  const img = await page.evaluate(() => { const i = document.querySelector('#views .group_stack img'); return {complete: i.complete, w: i.naturalWidth}; });
  assert.ok(img.complete && img.w > 0, 'the stack image loaded via /res');
  assertNoErrors();
});

test('transform: a bound container drives the wrapped element through the range map with clamp, a constant scales, an empty or NaN container is neutral', async t => {
  if (!(await requireView(t, 'Groups'))) return;
  const needle = '#views .group_stack > .group_transform:nth-of-type(2)';
  const percent = '#views .group_stack > .group_transform:nth-of-type(3)';
  // nothing written yet: neutral
  let m = await matrix(needle);
  near(m[0], 1, 1e-6, 'neutral a'); near(m[1], 0, 1e-6, 'neutral b');
  // 90 of 0..360 -> pi/2 of 0..2pi: rotate(90deg) = matrix(0, 1, -1, 0, 0, 0)
  await post('set', {buffers: {angle: [90]}});
  await sleep(800);
  m = await matrix(needle);
  near(m[0], 0, 0.01, 'rotated a'); near(m[1], 1, 0.01, 'rotated b');
  const origin = await page.evaluate(s => getComputedStyle(document.querySelector(s)).transformOrigin, needle);
  const box = await page.evaluate(s => { const el = document.querySelector(s); return {width: el.offsetWidth, height: el.offsetHeight}; }, needle);
  near(parseFloat(origin.split(' ')[0]), box.width * 0.5, 1, 'originX');
  near(parseFloat(origin.split(' ')[1]), box.height * 0.8, 1, 'originY');
  // 540 is clamped to the end of the map (a full turn), not a half turn
  await post('set', {buffers: {angle: [540]}});
  await sleep(800);
  m = await matrix(needle);
  near(m[0], 1, 0.01, 'clamped a');
  // opacity through the identity map
  await post('set', {buffers: {fade: [0.25]}});
  await sleep(800);
  assert.equal(await page.evaluate(s => getComputedStyle(document.querySelector(s)).opacity, needle), '0.25');
  // NaN (null in the body) and an empty container leave the neutral value
  await post('set', {buffers: {angle: [null]}});
  await sleep(800);
  m = await matrix(needle);
  near(m[0], 1, 1e-6, 'NaN is neutral');
  await post('set', {buffers: {angle: []}});
  await sleep(800);
  m = await matrix(needle);
  near(m[0], 1, 1e-6, 'empty is neutral');
  // the constant input
  m = await matrix(percent);
  near(m[0], 0.5, 1e-6, 'constant scale');
  near(m[3], 0.5, 1e-6, 'constant scale y');
  assertNoErrors();
});

test('a graph inside a grid maximizes to the whole view and the grid comes back when it is left; a stack takes no clicks', async t => {
  if (!(await requireView(t, 'Groups'))) return;
  const idx = await requireGraph(t, 'Grid x');
  if (idx === null) return;
  const before = await rect(sel(idx, '.graphBox'));
  await page.click(sel(idx, '.label'));
  await sleep(600);
  assert.ok(await page.evaluate(() => document.body.classList.contains('exclusive')));
  const views = await rect('#views');
  const maxed = await rect(`#element${idx}`);
  near(maxed.left, views.left, 2, 'fills left'); near(maxed.right, views.right, 2, 'fills right');
  near(maxed.top, views.top, 2, 'fills top'); near(maxed.bottom, views.bottom, 2, 'fills bottom');
  const siblings = await rects('#views .group_grid > .graphElement:not(.exclusive)');
  siblings.forEach((s, i) => assert.equal(s.display, 'none', `grid sibling ${i} hidden`));
  const others = await rects('#views .group_horizontal, #views .group_stack');
  others.forEach((o, i) => assert.equal(o.display, 'none', `other top-level group ${i} hidden`));
  await page.click(sel(idx, '.label'));
  await sleep(600);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('exclusive'))));
  const after = await rect(sel(idx, '.graphBox'));
  near(after.width, before.width, 2, 'width restored');
  // the graph in the stack has no label to click and takes no pointer events
  const overlay = await requireGraph(t, 'Overlay');
  if (overlay !== null) {
    const pe = await page.evaluate(i => getComputedStyle(document.getElementById('element' + i).closest('.group_stack')).pointerEvents, overlay);
    assert.equal(pe, 'none');
  }
  assertNoErrors();
});

test('a fixed plot area pins the chart area to fractions of the element, also after a resize', async t => {
  if (!(await requireView(t, 'Groups'))) return;
  const idx = await requireGraph(t, 'Overlay');
  if (idx === null) return;
  const check = async label => {
    const a = await page.evaluate(i => {
      const c = Chart.getChart(document.querySelector('#element' + i + ' canvas'));
      return {left: c.chartArea.left, right: c.chartArea.right, top: c.chartArea.top, bottom: c.chartArea.bottom, w: c.canvas.clientWidth, h: c.canvas.clientHeight};
    }, idx);
    near(a.left / a.w, 0.1, 0.01, label + ' left'); near(a.right / a.w, 0.9, 0.01, label + ' right');
    near(a.top / a.h, 0.1, 0.01, label + ' top'); near(a.bottom / a.h, 0.9, 0.01, label + ' bottom');
  };
  await check('initial');
  await page.setViewport({width: 800, height: 900, deviceScaleFactor: 1});
  await sleep(600);
  await check('after resize');
  await page.setViewport({width: 1400, height: 900, deviceScaleFactor: 1});
  const st = await state(idx);
  assert.deepEqual(st.plotArea, {left: 0.1, top: 0.1, right: 0.9, bottom: 0.9});
  assertNoErrors();
});

test('colours with an alpha byte keep it on elements and datasets, in dark and in bright mode', async t => {
  if (!(await requireView(t, 'Groups'))) return;
  const valueIdx = await page.evaluate(() => { let f = null; (function walk(es) { es.forEach(ve => { if (ve.elements) walk(ve.elements); else if (ve.label === 'Alpha value') f = ve.index; }); })(views[currentView].elements); return f; });
  if (valueIdx === null) { t.skip('no "Alpha value" element'); return; }
  const colorOf = () => page.evaluate(i => getComputedStyle(document.getElementById('element' + i)).color, valueIdx);
  const dark = await colorOf();
  assert.match(dark, /rgba\(255, 126, 34, 0\.5\)/, 'dark mode keeps the alpha');
  const overlay = await requireGraph(t, 'Overlay');
  const dsColor = () => page.evaluate(i => Chart.getChart(document.querySelector('#element' + i + ' canvas')).data.datasets[0].borderColor, overlay);
  if (overlay !== null) assert.equal(await dsColor(), '#ff7e2280');
  await page.evaluate(() => toggleBrightMode());
  await sleep(600);
  const bright = await colorOf();
  assert.match(bright, /rgba\(\d+, \d+, \d+, 0\.5\)/, 'bright mode keeps the alpha');
  assert.notEqual(bright, dark, 'bright mode adjusts the colour');
  if (overlay !== null) {
    const c = await dsColor();
    assert.match(c, /^#[0-9a-f]{6}80$/, 'dataset colour keeps the alpha byte');
    assert.notEqual(c, '#ff7e2280');
  }
  await page.evaluate(() => toggleBrightMode());
  assertNoErrors();
});
