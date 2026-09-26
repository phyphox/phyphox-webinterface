// A stand-in for the app's remote server: serves this repository's index.html and style.css the
// way the apps do (placeholders replaced), with a synthetic experiment that exercises every graph
// variant, and just enough of the REST API (/get, /control, /set, /time, /export, /res) for the
// interface to run. It also serves fixtures/ so the test experiment can be pushed to a phone.
//
//     node mock_server.js [port]          (default 8081)
//
// The first view mirrors fixtures/webgraphs.phyphox (same labels and buffer names), so the tests
// find the same graphs whether they run against this mock or against the app; the further graphs
// exist only here.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..');
// 1x1 transparent PNG for the drawable placeholders of style.css
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MAPW = 64;

function createExperiment() {
  const state = {measuring: false, session: 'mock' + Date.now(), t: 0, mapRow: 0, lastSys: Date.now(), timeEvents: []};
  const buffers = {};
  const sizes = {};
  const buf = (name, size) => { buffers[name] = []; sizes[name] = size; };
  ['acc_time', 'accX', 'accY', 'accZ', 'acc', 'xd', 'yd', 'hx', 'hy', 'fmap', 'tmap', 'fftmap', 'lx', 'ly', 'neverX', 'neverY', 'nanX', 'nanY'].forEach(n => buf(n, 0));
  ['pickedX', 'assigned', 'pickedY', 'value', 'angle', 'fade'].forEach(n => buf(n, 1));

  const push = (name, v) => {
    const b = buffers[name];
    b.push(v);
    if (sizes[name] > 0 && b.length > sizes[name]) b.splice(0, b.length - sizes[name]);
  };
  for (let i = 0; i < 200; i++) {
    push('xd', 400 + i * 2);
    push('yd', 100 * Math.exp(-Math.pow((i - 80) / 20, 2)) + 40 * Math.exp(-Math.pow((i - 150) / 8, 2)) + (i % 7) * 0.7);
  }
  for (let i = 0; i <= 20; i++) {
    push('hx', i * 0.5);
    push('hy', i < 20 ? Math.round(50 * Math.exp(-Math.pow((i - 10) / 4, 2))) : 0);
  }
  for (let i = 1; i <= 100; i++) {
    push('lx', Math.pow(10, i / 25));
    push('ly', Math.pow(buffers.lx[i - 1], 1.7) * 3);
  }
  for (let i = 0; i < 20; i++) {
    push('nanX', i);
    push('nanY', (i > 5 && i < 9) ? NaN : Math.sin(i / 3));
  }

  function tick() {
    const now = Date.now();
    if (state.measuring) {
      state.t += (now - state.lastSys) / 1000;
      const t = state.t;
      push('acc_time', t);
      push('accX', 9.81 + 2 * Math.sin(t * 2));
      push('accY', 3 * Math.sin(t * 0.7) * Math.cos(t * 3));
      push('accZ', -0.5 + 0.3 * Math.sin(t * 5) + ((t * 1000) % 7) * 0.02);
      push('acc', buffers.accX[buffers.accX.length - 1] ** 2);
      push('value', buffers.accX[buffers.accX.length - 1]);
      if (Math.floor(t * 4) > state.mapRow) {
        state.mapRow = Math.floor(t * 4);
        const ty = state.mapRow / 4;
        for (let i = 0; i < MAPW; i++) {
          push('fmap', i * 100);
          push('tmap', ty);
          const peak = 32 + 20 * Math.sin(ty / 3);
          push('fftmap', 1e-3 + 10 * Math.exp(-Math.pow((i - peak) / 3, 2)) + 0.01 * ((i * 31 + state.mapRow) % 10) / 10);
        }
      }
    }
    state.lastSys = now;
  }
  const timer = setInterval(tick, 20);

  function control(cmd) {
    if (cmd === 'start' && !state.measuring) {
      state.measuring = true;
      state.timeEvents.push({event: 'START', experimentTime: state.t, systemTime: Date.now() / 1000});
    } else if (cmd === 'stop' && state.measuring) {
      state.measuring = false;
      state.timeEvents.push({event: 'PAUSE', experimentTime: state.t, systemTime: Date.now() / 1000});
    } else if (cmd === 'clear') {
      state.measuring = false;
      for (const n of ['acc_time', 'accX', 'accY', 'accZ', 'acc', 'fmap', 'tmap', 'fftmap']) buffers[n].length = 0;
      state.t = 0;
      state.mapRow = 0;
      state.timeEvents.length = 0;
    }
  }

  function get(params) {
    const result = {buffer: {}, status: {session: state.session, measuring: state.measuring, timedRun: false, countDown: 0}};
    for (const name of Object.keys(params)) {
      if (!buffers[name]) continue;
      const spec = params[name];
      const b = buffers[name];
      let entry;
      if (spec === '' || spec === undefined) entry = {size: sizes[name], updateMode: 'single', buffer: b.length ? [b[b.length - 1]] : []};
      else if (spec === 'full') entry = {size: sizes[name], updateMode: 'full', buffer: b.slice()};
      else {
        const [thStr, ref] = String(spec).split('|');
        const th = parseFloat(thStr) * (1 + 1e-8);
        const refBuf = ref ? buffers[ref] : b;
        if (!refBuf || isNaN(th)) return null;
        const out = [];
        for (let i = 0; i < b.length && i < refBuf.length; i++) if (refBuf[i] > th) out.push(b[i]);
        entry = {size: sizes[name], updateMode: 'partial', buffer: out};
      }
      entry.buffer = entry.buffer.map(v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1e6) / 1e6 : null);
      result.buffer[name] = entry;
    }
    return result;
  }

  function set(body) {
    for (const n of Object.keys(body.buffers)) if (!buffers[n]) return {result: false, error: 'unknown buffer ' + n};
    for (const n of Object.keys(body.buffers)) {
      if (body.mode !== 'append') buffers[n].length = 0;
      body.buffers[n].forEach(v => push(n, v === null ? NaN : Number(v)));
    }
    return {result: true};
  }

  return {state, buffers, control, get, set, stop: () => clearInterval(timer)};
}

// ---- view layout, the way the apps emit it ----
function graph(label, index, updateMode, dataInput, cfg) {
  return {label, index: String(index), updateMode, labelSize: '42', html: '', dataCompleteFunction: 'function() {}', dataInput, dataInputFunction: 'function(x) {}', graph: cfg};
}
function base(over) {
  return Object.assign({
    aspectRatio: 2.5,
    labelX: 'x', labelY: 'y', labelZ: null, unitX: null, unitY: null, unitZ: null, unitYX: null,
    logX: false, logY: false, logZ: false,
    xPrecision: -1, yPrecision: -1, zPrecision: -1, suppressScientificNotation: false,
    timeOnX: false, timeOnY: false, systemTime: false, linearTime: false,
    scaleMinX: 'auto', scaleMaxX: 'auto', minX: 0, maxX: 0,
    scaleMinY: 'auto', scaleMaxY: 'auto', minY: 0, maxY: 0,
    scaleMinZ: 'auto', scaleMaxZ: 'auto', minZ: 0, maxZ: 0,
    followX: false, partialUpdate: false,
    plotLeft: null, plotTop: null, plotRight: null, plotBottom: null,
    mapWidth: 0, showColorScale: true, interpolateMapColors: true,
    datasets: [], pickLabel: null, pickOutputs: []
  }, over);
}
// The label span is only emitted with a label, the verticalLayout class on request (file format 1.21)
const labelSpan = label => label ? `<span class="label">${label}</span>` : '';
const layoutClass = (label, vertical) => (label && vertical) ? ' verticalLayout' : '';
function valueElement(label, index, buffer, unit, precision, color, vertical) {
  return {label, index: String(index), updateMode: 'single', labelSize: '42',
    html: `<div style="font-size:105%;color:#${color || 'ffffff'}" class="valueElement adjustableColor${layoutClass(label, vertical)}" id="element${index}">${labelSpan(label)}<span class="value"><span class="valueNumber">-</span> <span class="valueUnit">${unit}</span></span></div>`,
    dataCompleteFunction: `function() { var v = elementData[${index}].value; if (v === undefined) return; document.getElementById("element${index}").getElementsByClassName("valueNumber")[0].textContent = (v === null || isNaN(v)) ? "-" : v.toFixed(${precision}); }`,
    dataInput: [buffer], dataInputFunction: `function(data) { if (!data.hasOwnProperty("${buffer}")) return; var d = data["${buffer}"].data; elementData[${index}].value = d[d.length-1]; }`};
}
function editElement(label, index, buffer, unit, vertical) {
  return {label, index: String(index), updateMode: 'input', labelSize: '42',
    html: `<div style="font-size:105%;" class="editElement${layoutClass(label, vertical)}" id="element${index}">${labelSpan(label)}<input onchange="ajax('control?cmd=set&buffer=${buffer}&value='+this.value)" type="number" class="value" /><span class="unit">${unit}</span></div>`,
    dataCompleteFunction: 'function() {}', dataInput: [buffer], dataInputFunction: 'function(data) {}'};
}
function toggleElement(label, index, buffer, vertical) {
  return {label, index: String(index), updateMode: 'input', labelSize: '42',
    html: `<div style="font-size:105%;" class="switchElement${layoutClass(label, vertical)}" id="element${index}">${labelSpan(label)}<input type="checkbox" class="value" id="radio${index}" ></input></div>`,
    dataCompleteFunction: 'function() {}', dataInput: [buffer], dataInputFunction: 'function(data) {}'};
}
function infoElement(label, index) {
  return {label, index: String(index), updateMode: 'none', labelSize: '42',
    html: `<div style="font-size:89%;color:#ffffff;" class="infoElement adjustableColor" id="element${index}"><p>${label}</p></div>`,
    dataCompleteFunction: 'function() {}'};
}
function imageElement(index, src) {
  return {label: '', index: String(index), updateMode: 'none', labelSize: '42',
    html: `<div class="imageElement" id="element${index}"><img style="width: 100%" class="lightFilter_none darkFilter_none" src="res?src=${encodeURIComponent(src)}"></div>`,
    dataCompleteFunction: 'function() {}'};
}
// A view group (file format 1.21): type, its children and the type's attributes; no index, no html
const group = (type, elements, over) => Object.assign({type, elements}, over || {});
const identity = {min: 0, max: 1, mapMin: 0, mapMax: 1, clamp: false};
const line = (x, y, color, style) => ({x, y, z: null, style: style || 'lines', lineWidth: 1.0, color: color || '#ff7e22'});
const views = [
  {name: 'Graphs', elements: [
    graph('Acceleration (partial, 3 datasets)', 0, 'partial', ['accX', 'acc_time', 'accY', 'acc_time', 'accZ', 'acc_time'], base({
      labelX: 't', unitX: 's', labelY: 'a', unitY: 'm/s²', unitYX: 'm/s³', partialUpdate: true,
      datasets: [line('acc_time', 'accX'), line('acc_time', 'accY', '#00ff00'), line('acc_time', 'accZ', '#0080ff', 'dots')]})),
    graph('Follow x (5 s)', 1, 'partial', ['accX', 'acc_time'], base({
      labelX: 't', unitX: 's', labelY: 'a', unitY: 'm/s²', followX: true, partialUpdate: true, minX: 0, maxX: 5,
      scaleMinX: 'fixed', scaleMaxX: 'fixed', scaleMinY: 'fixed', minY: -15, scaleMaxY: 'fixed', maxY: 15,
      datasets: [Object.assign(line('acc_time', 'accX'), {lineWidth: 2.0})]})),
    graph('Picker (dots)', 2, 'partial', ['acc', 'acc_time'], base({
      labelX: 't', unitX: 's', labelY: 'a²', unitY: 'm²/s⁴', partialUpdate: true, pickLabel: 'Calibrate',
      datasets: [line('acc_time', 'acc', '#ff7e22', 'dots')],
      pickOutputs: [
        {axis: 'x', buffer: 'pickedX', label: 'Calibration point', calBuffer: 'assigned', calLabel: 'Assigned wavelength in nm'},
        {axis: 'y', buffer: 'pickedY', label: 'Pick y', calBuffer: null, calLabel: null}
      ]})),
    valueElement('Picked x', 3, 'pickedX', 's', 3),
    valueElement('Assigned', 4, 'assigned', 'nm', 1),
    valueElement('Picked y', 5, 'pickedY', '', 3),
    // mock-only graphs from here on
    graph('Spectrum (static)', 6, 'full', ['yd', 'xd'], base({
      labelX: 'pixel', unitX: '', labelY: 'intensity', unitY: 'a.u.',
      datasets: [line('xd', 'yd', '#ff7e22', 'dots')]})),
    graph('Histogram (vbars)', 7, 'full', ['hy', 'hx'], base({
      labelX: 'bin', unitX: 'm', labelY: 'count',
      datasets: [Object.assign(line('hx', 'hy', '#ff7e22', 'vbars'), {lineWidth: 0.8})]})),
    graph('Audio spectrum map', 8, 'partialXYZ', ['tmap', 'fmap', 'fftmap', null], base({
      labelX: 'Frequency', unitX: 'Hz', labelY: 'Time', unitY: 's', labelZ: 'FFT Mag', unitZ: 'a.u.', aspectRatio: 1,
      logZ: true, mapWidth: MAPW, partialUpdate: true,
      datasets: [{x: 'fmap', y: 'tmap', z: 'fftmap', style: 'map', lineWidth: 1.0, color: '#ff7e22'}]})),
    graph('Log-log', 9, 'full', ['ly', 'lx'], base({logX: true, logY: true, datasets: [line('lx', 'ly')]})),
    graph('Empty', 10, 'full', ['neverY', 'neverX'], base({datasets: [line('neverX', 'neverY')]})),
    graph('Out of range', 11, 'full', ['hy', 'hx'], base({
      scaleMinX: 'fixed', scaleMaxX: 'fixed', minX: 100, maxX: 200, datasets: [line('hx', 'hy')]})),
    graph('System time axis', 12, 'partial', ['accX', 'acc_time'], base({
      labelX: 't', unitX: 's', labelY: 'a', unitY: 'm/s²', timeOnX: true, systemTime: true, partialUpdate: true,
      datasets: [line('acc_time', 'accX')]})),
    graph('Gaps and precision', 13, 'full', ['nanY', 'nanX'], base({xPrecision: 2, yPrecision: 2, datasets: [line('nanX', 'nanY')]})),
    valueElement('Current value', 14, 'value', 'm/s²', 2),
  ]},
  {name: 'Second', elements: [
    graph('Log y', 15, 'partial', ['acc', 'acc_time'], base({
      labelX: 't', unitX: 's', labelY: 'a²', unitY: 'm²/s⁴', logY: true, partialUpdate: true,
      datasets: [line('acc_time', 'acc')]})),
  ]},
  // View groups, transforms, alpha colours and a fixed plot area (file format 1.21); mirrors fixtures/webgroups.phyphox
  {name: 'Groups', elements: [
    group('horizontal', [
      Object.assign(valueElement('Weight two', 16, 'value', '', 2), {weight: 2}),
      Object.assign(valueElement('Weight one', 17, 'value', '', 2), {weight: 1}),
      group('vertical', [valueElement('Column a', 18, 'value', '', 2), valueElement('Column b', 19, 'value', '', 2)], {weight: 1})
    ]),
    group('grid', [
      graph('Grid x', 20, 'partial', ['accX', 'acc_time'], base({labelX: 't', unitX: 's', labelY: 'x', partialUpdate: true, datasets: [line('acc_time', 'accX')]})),
      graph('Grid y', 21, 'partial', ['accY', 'acc_time'], base({labelX: 't', unitX: 's', labelY: 'y', partialUpdate: true, datasets: [line('acc_time', 'accY')]})),
      graph('Grid z', 22, 'partial', ['accZ', 'acc_time'], base({labelX: 't', unitX: 's', labelY: 'z', partialUpdate: true, datasets: [line('acc_time', 'accZ')]}))
    ], {maxWidth: 25, maxWidthUnit: 'text', fillLastRow: true}),
    // labels in narrow columns: vertical layouts and label-less elements
    group('horizontal', [
      valueElement('Frequency', 28, 'value', 'Hz', 2, null, true),
      editElement('Length', 29, 'value', 'm', true),
      toggleElement('Run', 30, 'value', true),
      valueElement('', 31, 'value', 'Hz', 2),
      toggleElement('', 32, 'value')
    ]),
    // one column while the viewport is taller than wide, two in landscape
    group('grid', [infoElement('screen unit a', 33), infoElement('screen unit b', 34)], {maxWidth: 1, maxWidthUnit: 'screen', fillLastRow: false}),
    group('stack', [
      imageElement(23, 'face.png'),
      group('transform', [imageElement(24, 'needle.png')], {originX: 0.5, originY: 0.8, transformInputs: [
        Object.assign({as: 'rotate', buffer: 'angle', value: null}, identity, {min: 0, max: 360, mapMin: 0, mapMax: 6.2832, clamp: true}),
        Object.assign({as: 'opacity', buffer: 'fade', value: null}, identity)
      ]}),
      group('transform', [valueElement('Percent', 25, 'value', '%', 0)], {originX: 0.5, originY: 0.5, transformInputs: [
        Object.assign({as: 'scale', buffer: null, value: 0.5}, identity)
      ]}),
      graph('Overlay', 26, 'full', ['hy', 'hx'], base({labelX: 'bin', labelY: 'count', plotLeft: 0.1, plotTop: 0.1, plotRight: 0.9, plotBottom: 0.9, datasets: [line('hx', 'hy', '#ff7e2280')]}))
    ]),
    valueElement('Alpha value', 27, 'value', '', 2, 'ff7e2280')
  ]}
];

function elementsJson(elements) {
  let s = '';
  elements.forEach((e, ei) => {
    if (ei > 0) s += ',';
    if (e.elements) {
      // a group: every key but the children as JSON, the children recursively
      const {elements, ...rest} = e;
      s += JSON.stringify(rest).slice(0, -1) + ',"elements":[\n' + elementsJson(elements) + '\n]}';
      return;
    }
    s += '{"label":' + JSON.stringify(e.label) + ',"index":"' + e.index + '","updateMode":"' + e.updateMode + '","labelSize":"' + e.labelSize + '","html":' + JSON.stringify(e.html) + ',"dataCompleteFunction":' + e.dataCompleteFunction;
    if (e.weight != null) s += ',"weight":' + e.weight;
    if (e.dataInput) s += ',"dataInput":' + JSON.stringify(e.dataInput) + ',"dataInputFunction":\n' + e.dataInputFunction + '\n';
    if (e.graph) s += ',"graph":' + JSON.stringify(e.graph);
    s += '}';
  });
  return s;
}

function viewsJson() {
  // The two function entries are JavaScript source, so the layout is assembled by hand like the apps do
  let s = 'var views = [';
  views.forEach((v, vi) => {
    if (vi > 0) s += ',\n';
    s += '{"name": ' + JSON.stringify(v.name) + ', "elements":[\n' + elementsJson(v.elements) + '\n]}';
  });
  return s + '\n];var clearGroups = [];';
}

const graphStrings = {panAndZoom: 'Pan and zoom', pick: 'Pick data', resetZoom: 'Reset zoom', follow: 'Follow new data', linearFit: 'Linear fit', logX: 'Logarithmic x axis', logY: 'Logarithmic y axis', systemTime: 'Convert to system time', point: 'Point', difference: 'Difference', slope: 'Slope', fit: 'Linear fit: y = a x + b', noData: 'No data', noValidData: 'No valid data', noDataInRange: 'No data in range', ok: 'OK', cancel: 'Cancel', invalidValue: 'Invalid value'};
const translations = {title: 'Mock experiment', translationOK: 'OK', translationCancel: 'Cancel', clearConfirmTranslation: 'Clear data?', clearConfirmTranslationSelect: 'Select', exportTranslation: 'Export', switchToPhoneLayoutTranslation: 'Phone layout', switchColumns1Translation: '1 column', switchColumns2Translation: '2 columns', switchColumns3Translation: '3 columns', toggleBrightModeTranslation: 'Bright mode', fontSizeTranslation: 'Font size'};

function indexHtml() {
  const out = [];
  for (const line of fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n')) {
    if (line.includes('<!-- [[viewLayout]] -->')) out.push(viewsJson());
    else if (line.includes('<!-- [[graphStrings]] -->')) out.push('graphStrings = Object.assign(graphStrings, ' + JSON.stringify(graphStrings) + ');');
    else if (line.includes('<!-- [[viewOptions]] -->')) out.push(views.map(v => '<li>' + v.name + '</li>').join('\n'));
    else if (line.includes('<!-- [[exportFormatOptions]] -->')) out.push('<option value="0">CSV</option>');
    else out.push(line.replace(/<!-- \[\[(\w+)\]\] -->/g, (m, k) => translations[k] || m));
  }
  return out.join('\n');
}

function start(port, log) {
  const exp = createExperiment();
  const server = http.createServer((req, res) => {
    const u = url.parse(req.url, true);
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const send = (code, type, data) => { res.writeHead(code, {'Content-Type': type}); res.end(data); };
      const json = (code, obj) => send(code, 'application/json', JSON.stringify(obj));
      try {
        if (u.pathname === '/') return send(200, 'text/html; charset=utf-8', indexHtml());
        if (u.pathname === '/style.css') return send(200, 'text/css', fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/###\w+###/g, PNG));
        if (u.pathname === '/logo') return send(200, 'image/png', fs.readFileSync(path.join(ROOT, 'phyphox_orange.png')));
        if (u.pathname === '/get') {
          const r = exp.get(req.method === 'POST' && body ? JSON.parse(body) : u.query);
          return r ? json(200, r) : json(400, {result: false, error: 'bad threshold'});
        }
        if (u.pathname === '/time') return json(200, exp.state.timeEvents);
        if (u.pathname === '/control') {
          exp.control(u.query.cmd);
          if (log) log('control ' + JSON.stringify(u.query));
          return json(200, {result: true});
        }
        if (u.pathname === '/set') {
          if (req.method !== 'POST') return json(200, {result: false, error: 'JSON body required'});
          if (log) log('set ' + body);
          return json(200, exp.set(JSON.parse(body)));
        }
        if (u.pathname === '/export') return send(200, 'text/plain', 'export mock');
        if (u.pathname === '/res') {
          const file = path.join(__dirname, 'fixtures', path.basename(String(u.query.src || '')));
          if (u.query.src && fs.existsSync(file) && file.endsWith('.png')) return send(200, 'image/png', fs.readFileSync(file));
          return json(200, {error: 'Unknown file.'});
        }
        if (u.pathname.startsWith('/fixtures/')) {
          const file = path.join(__dirname, 'fixtures', path.basename(u.pathname));
          if (fs.existsSync(file)) return send(200, 'application/octet-stream', fs.readFileSync(file));
        }
        send(404, 'text/plain', 'not found');
      } catch (e) {
        json(400, {result: false, error: String(e.message)});
      }
    });
  });
  server.listen(port);
  return {server, experiment: exp, close: () => { exp.stop(); server.close(); }};
}

module.exports = {start, views};

if (require.main === module) {
  const port = parseInt(process.argv[2] || '8081');
  start(port, console.log);
  console.log('mock phyphox on http://localhost:' + port + '/ (fixtures under /fixtures/)');
}
