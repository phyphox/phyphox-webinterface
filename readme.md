# phyphox: Webinterface

Phyphox is an app that uses the sensors in a smartphone for physics experiments. You can find additional details and examples on http://phyphox.org.

Copyright 2016 Dr. Sebastian Staacks, 2nd Institute of Physics, RWTH Aachen University.

This project has been created at the RWTH Aachen University and is released under the GNU General Public Licence (see licence file) since version 1.1.0.

**The names "phyphox" and "RWTH Aachen University" as well as the RWTH Aachen logo are registered trademarks.**

## Coding style

The app and all of its parts are developed by students and researchers who do not necessarily have a software development background. Therefore, you will find many passages in our code that is not best practice. Any help in improving our code is welcome.

## Structure

This repository contains the webinterface served by the app when the remote access feature is enabled. The whole project is spread across several repositories:

* **phyphox-android**
  Android source, includes phyphox-experiments and phyphox-webinterface as subrepositories

* **phyphox-experiments**
  Phyphox experiment definitions, which are provided with the app

* **phyphox-ios**
  iOS source, includes phyphox-experiments and phyphox-webinterface as subrepositories

* **phyphox-translation**
  This contains the translations from experiment definitions and app store entries. It is synchronized manually to the experiments repository through a python script. Its main purpose is to conveniently provide translatable resources to our translation system.

* **phyphox-webeditor**
  The web-based editor to create and modify phyphox experiment-files in a GUI

* **phyphox-webinterface**
  This is the webinterface served by the webserver in the app when the "remote access" feature is activated

The overarching documentation (for example of the phyphox file format or the REST API) can be found in our [Wiki on phyphox.org](https://phyphox.org/wiki).

## Branches

We keep the code of the most recent published version in "master", while minor development is done in "development". Larger changes and long-term development occurs in additional branches, which at some point converge in a "dev-next" branch. In some repositories you will also find a "translation" branch, which usually is identical or very close to the current "development" or "dev-next" branch and linked to our translation system to control when our translators are able to work on new text passages.

## Contributing

We encourage any contribution to our project. However, due to the complexity of the project and the fact that it is used in schools around the world, there are some things to consider before any code makes it into the final version of phyphox that is distributed in the app stores:
* Be careful about changes of the UI. Many teachers rely on a simple and consistent workflow without too much distraction for their students. Also, they might have created some worksheets, which need updates when the interface changes. Therefore, try to add new features in a simple and lean way.
* Android and iOS versions should remain as similar as possible. We do accept slight variations of the UI of both versions if they follow the obvious design standards of each platform (for example using checkmarks on Android but buttons telling the action on iOS, or a FAB on Android and a Actionbar entry on iOS) and one version might get features that are impossible on the other platform (for example reading the light sensor on Android, which cannot be done on iOS or getting the number of satellites for GPS on Android). But if you provide a new feature that can be implemented on the other platform as well, we will not include it in the final app until we (or you or somebody) has ported it to the other platform as well. Once again, this app is used in classes around the world and we want to provide a very similar experience on both platforms, so the teachers don't have to explain the usage of phyphox twice.
* Translation is not done via git directly. If you want to translate the app, contact us, so we can set up an account for you on our translation system.
In any case, if you plan on contibuting more than a little bugfix or optimization, it is probably a good idea to contact us first, so we can plan together and consider your plans in our development as well.

## Principles

* **Self-contained and offline.** The interface is served by the phone and used in classrooms without
  internet access. Everything it needs is inside this repository (the libraries are inlined in
  `index.html`); it never loads resources from the network, even if a connection is available.
* **Lightweight.** The whole package is shipped inside both apps; keep additions small and prefer
  what the bundled libraries already offer over new dependencies.
* **Every kind of device.** The page is used on laptops (mouse/touchpad), tablets (touch on a large
  screen) and phones (touch on a small screen). Interactions need a mouse path and a touch path -
  zooming, for example, works with drag/wheel as well as with pinch.
* **Graphs follow the experiment, not the app.** A graph applies the explicit settings of the
  experiment file (data sources, styles, colors, line widths, axis ranges, follow-x, ...) but is
  otherwise an independent representation of the data built with Chart.js. It does not have to
  match the in-app graphs feature by feature or in how it is operated. Work with the library, not
  against it.
* **The logic lives here.** The apps only propagate the experiment's view layout and graph settings
  as JSON (see below); the JavaScript that turns it into an interface is shared by Android and iOS
  through this repository, so it is written once.

## How the apps embed the interface

Both apps serve `index.html` and `style.css` after replacing a set of placeholders. In `index.html`
a placeholder is an HTML comment of the form `<!-- [[name]] -->` and is replaced with the text
described below; in `style.css` the `###drawableName###` tokens are replaced with base64-encoded
PNGs of the app's icons. Unknown placeholders are left in place, so a placeholder inside a script
block must be on a line of its own (an `<!--` comment is valid JavaScript there).

| Placeholder | Replaced with |
|---|---|
| `title` | Title of the experiment |
| `viewLayout` | JavaScript defining `views` and `clearGroups` (see below) |
| `graphStrings` | `graphStrings = Object.assign(graphStrings, {...});` with the translated strings of the graph tools (see below) |
| `unitSystem` | `var unitSystem = "experiment";` (or `"metric"`, `"imperial"`): the app's *Unit system* setting, the initial state of the unit conversion (see "Units"). An app that leaves the placeholder in place gets `experiment` |
| `unitStrings` | `unitStrings = {"meter": "m", ...};` the app's translated symbol per unit id (`common_unit_short_<id>`), so the browser shows the same designations as the phone; the interface falls back to its built-in Latin table |
| `viewOptions` | One `<li>` per experiment view |
| `exportFormatOptions` | One `<option>` per export format, value = index |
| `translationOK`, `translationCancel`, `clearConfirmTranslation`, `clearConfirmTranslationSelect`, `exportTranslation`, `switchToPhoneLayoutTranslation`, `switchColumns1Translation`, `switchColumns2Translation`, `switchColumns3Translation`, `toggleBrightModeTranslation`, `fontSizeTranslation` | The respective translated strings |

### The view layout

`viewLayout` is replaced with `var views = [...]; var clearGroups = [...];`. `views` is an array of
`{"name": ..., "elements": [...]}`. An entry of `elements` is either a leaf element (below) or a
**view group** (file format 1.21, see the phyphox-docs page "View groups"), which nests: a group is
`{"type": "vertical"|"horizontal"|"grid"|"stack"|"transform", "elements": [...]}` and holds its
children in the same form, to any depth. Groups have no `index` and no `html`: the interface builds
the container itself. Leaves keep their shape and their `index`, which stays a global sequential
number in document order across the whole tree, so `element<index>` and
`control?cmd=trigger&element=` are unaffected by grouping. A group carries

| Key | Meaning |
|---|---|
| `type` | `vertical`, `horizontal`, `grid`, `stack` or `transform` |
| `elements` | The children, leaves or groups |
| `weight` | On every direct child (leaf or group) of a `horizontal`: its share of the row (default 1); absent elsewhere |
| `maxWidth`, `maxWidthUnit`, `fillLastRow` | `grid` only: the largest column width, its unit (`"text"` = text line heights, the `em` of the element; `"screen"` = multiples of the shorter side of the browser viewport), and whether an incomplete last row is split among its children |
| `spacing` | `vertical`, `horizontal` and `grid`: the gap between adjacent visible children in text line heights (the `em` of the group), default 0. The interface renders it as the flex `gap` of the container (a `vertical` with a spacing becomes a flex column; the flush default stays a block), so there is none at the outer edges or next to a hidden child, and it sits between the children's margin boxes; a `horizontal` takes the gaps off the width before the weights share it, and a `grid` counts them in its column count (the smallest n with (width - (n-1)·spacing) / n <= maxWidth) and lets the columns share the rest |
| `originX`, `originY` | `transform` only: the origin of scaling and rotation as fractions of the wrapped element (default 0.5) |
| `transformInputs` | `transform` only: array of `{"as": "scale"/"scaleX"/"scaleY"/"translateX"/"translateY"/"rotate"/"opacity", "buffer": name or null, "value": number or null, "min", "max", "mapMin", "mapMax", "clamp"}`; the property is `mapMin + (v - min) * (mapMax - mapMin) / (max - min)` of the buffer's last value (or the constant), limited to the map range with `clamp`, and keeps its neutral value while the buffer is empty, the value is not finite or `min == max`. Rotation is in radians, clockwise; lengths are fractions of the wrapped element's own size; the properties compose as scale, then rotation, then translation about the origin |
| `visibilityInput` | Optional, as on a leaf: hides the whole group |

A `transform` has exactly one child. Each leaf element carries

| Key | Meaning |
|---|---|
| `label` | Label of the element |
| `index` | Unique index of the element across all views (as a string); it is used in the HTML id `element<index>` and by `control?cmd=trigger&element=` |
| `updateMode` | How the element's buffers are polled: `single` (last value), `input` (last value, element writes to the buffer), `full` (whole buffer), `partial` (only new values, x monotonic), `partialXYZ` (only new values for a color map, y monotonic) or `none` |
| `labelSize` | Font size of the label in the app, the interface scales it |
| `html` | The element's markup (empty for graphs) |
| `dataInput` | Array of buffer names the element reads; `null` entries are placeholders keeping the pairing (`y, x, y, x, ...`; for a color map `y, x, z, null`) |
| `dataInputFunction` | A JavaScript function `function(data)` that receives the buffer store (`data[name].data` is the array, `data[name].changed` a flag) |
| `dataCompleteFunction` | A JavaScript function `function()` called after all input functions of the view |
| `visibilityInput` | Optional buffer name whose last value (> 0) controls the element's visibility |
| `graph` | Optional graph configuration object (below). When present, the interface builds html, dataInputFunction and dataCompleteFunction itself and ignores the ones provided |
| `value`, `edit` | Optional configuration of a value or edit element ("Value and edit elements" below). When present, the interface installs its own dataInputFunction and dataCompleteFunction (the provided ones are ignored) and drives the element's `html`, which keeps its shape; without it the element runs on the app-generated functions as before |
| `geometry`, `scale` | The configuration of a drawing element ("Drawing elements" below). The interface draws the element on a canvas inside the element's `html` (an empty `<div class="geometryElement">` / `<div class="scaleElement">`) and installs its own data functions |

Labels (file format 1.21): the `html` of a value, edit, toggle (`switchElement`), dropdown and
slider element contains its `<span class="label">` only when the element has a label - without
one the control takes the whole row - and carries the class `verticalLayout` on the element's
`div` when the experiment asks for the label above the control. A graph without a label has no
title row; the camera element omits its label span likewise.

The `align` attribute of those five elements becomes the class `alignCenter` or `alignRight` on
the same `div`, next to `verticalLayout`; `left` adds nothing. The app emits the class only where
the attribute applies - with `verticalLayout` and a label, or without a label, and on a slider
only with `showValue` - so the stylesheet needs no knowledge of the layout: it aligns the label
and the text of the control, positions the edit field with its unit as a line, and places the
checkbox. The info element's own `align` is not a class but an inline `text-align` (`start`,
`center` or `end`) in the `style` of its `div`.

The two function entries are emitted as JavaScript source, which is why the view layout is not
strictly JSON. Elements that describe themselves purely with data, like the graph, are the
preferred direction for new element types.

### Value and edit elements

File format 1.21 gives the unit attributes logical units (phyphox-docs `docs/file-format/units.md`): a
unit reference `@meter` names a known unit, which the interface can show in any other unit of its
quantity, while a text unit stays as written. Everywhere below a **unit** is
`{"id": "meter", "text": null}` for a reference and `{"id": null, "text": "m/s³"}` for text (an
empty unit is `{"id": null, "text": ""}` or `{"id": null, "text": null}`). The `html` of the
element carries the experiment's symbol; the interface replaces it while another unit is shown.

`value`:

| Key | Type | Meaning |
|---|---|---|
| `unit` | unit | The experiment's unit |
| `precision` | integer | Decimals (or digits after the point of the exponent form) as in the file |
| `scientific` | boolean | Exponent form instead of fixed point |
| `factor` | number | Applied to the buffer value before it is shown (and before any conversion) |
| `size` | number | The relative size of the number (informational, the html carries it) |
| `format` | `"float"`, `"degree-minutes"`, `"degree-minutes-seconds"` or `"ascii"` | The value's format; only `float` converts |
| `positiveUnit`, `negativeUnit` | string or null | Direction labels shown instead of the unit by the sign of the value; an element with one is not converted |
| `map` | array | The `map` children: `{"min": number or null, "max": number or null, "str": text}`, the first matching one replaces the number |

`edit`:

| Key | Type | Meaning |
|---|---|---|
| `unit` | unit | The experiment's unit |
| `factor` | number | The field shows buffer value × factor; a typed value is divided by it before it is sent |
| `min`, `max` | number or null | The limits in buffer units (as in the file); the interface converts them for the field's `min`/`max` |
| `signed`, `decimal` | boolean | Whether negative and non-integer input is allowed; an integer field (`decimal` false) is not converted |
| `default` | number or null | The value the app seeds the buffer with (informational) |

With the configuration present the interface sends a typed value itself
(`control?cmd=set&buffer=<name>&value=<v>` with `v` converted back to the experiment's unit and divided
by `factor`), so the `onchange` of the app's markup is dropped.

### Drawing elements

File format 1.21 adds two elements drawn from attributes (phyphox-docs `docs/file-format/views/drawing.md`):
`geometry`, a static shape, and `scale`, the axis of a gauge. Both take the full width and are
`width / aspectRatio` tall; positions are fractions of that box per axis (x from the left, y from the top),
lengths fractions of the width, angles radians clockwise from twelve o'clock; drawing outside the box is
clipped. All keys are always present, numbers are numbers, a colour is `"#rrggbb"` or `"#rrggbbaa"` (the
experiment's colour as given, adapted to the bright mode by the interface) or `null` for "not set".

`geometry`:

| Key | Type | Meaning |
|---|---|---|
| `shape` | `"rectangle"`, `"circle"`, `"line"` or `"arc"` | What is drawn |
| `aspectRatio` | number | Width divided by height of the box |
| `color` | colour or null | Fill of an area shape, or the colour of a line without `lineColor`; without it an area shape has no fill |
| `lineColor` | colour or null | Outline of an area shape, or the colour of a line; without it an area shape has no outline |
| `lineWidth` | number | Width of the outline or the line, as a fraction of the width |
| `left`, `top`, `right`, `bottom`, `cornerRadius` | number | rectangle: its edges and the radius of its corners |
| `centerX`, `centerY`, `radius`, `innerRadius`, `startAngle`, `sweepAngle` | number | circle: centre and radius; arc: the ring segment between `innerRadius` and `radius` from `startAngle` over `sweepAngle` (positive clockwise; a full turn is a ring, `innerRadius` 0 a pie slice) |
| `startX`, `startY`, `endX`, `endY` | number | line: its two points; the line has square ends that stop exactly there |

`scale` (the leaf's `label` is the axis label):

| Key | Type | Meaning |
|---|---|---|
| `shape` | `"linear"` or `"circular"` | A straight baseline from `startX`/`startY` (min) to `endX`/`endY` (max), or the arc around `centerX`/`centerY` of `radius` from `startAngle` (min) over `sweepAngle` (max), clockwise for a positive sweep |
| `aspectRatio` | number | Width divided by height of the box |
| `min`, `max` | number | The range in the experiment's unit |
| `minInput`, `maxInput` | string or null | The data containers bound to min and max by the `input` children; the bound ones are also listed in `dataInput` (with `updateMode` `single`), so they are polled with the other buffers. The last value replaces the attribute while it is finite; only the tics, values and conversion follow, the baseline does not move |
| `unit` | unit | The experiment's unit, as for a value element; with a reference the values are converted (see "Units") |
| `color` | colour or null | Baseline, tics and text; null is the page's text colour |
| `size` | number | Text size relative to the element's font size |
| `lineWidth` | number | Baseline and tics, as a fraction of the width; 0 draws neither |
| `ticStep` | number | Distance between major tics in the experiment's unit, laid out from min; 0 chooses the step automatically (below) |
| `ticLength`, `minorTicLength`, `valueDistance` | number | Signed distances from the baseline as fractions of the width: positive is outward on a circular scale, right of the direction of travel on a linear one (below a scale running left to right); 0 for `ticLength` draws no tics |
| `minorTics` | integer | Minor tics between two major ones |
| `valueEvery` | integer | The value at every n-th major tic counted from min; 0 shows none |
| `precision` | integer or null | Decimals of the values; null for as many as the step needs |
| `valueOrientation` | `"upright"`, `"tangential"` or `"radial"` | Values horizontal, along the baseline (reading from min to max) or across it (reading towards the positive side) |
| `labelPositionX`, `labelPositionY` | number | Centre of the label text, drawn as "label (unit)" or either part alone |
| `startX`, `startY`, `endX`, `endY` | number | linear: the positions of min and max |
| `centerX`, `centerY`, `radius`, `startAngle`, `sweepAngle` | number | circular: the arc of the baseline |

**Automatic tics.** With `ticStep` 0, and always while the scale shows a unit other than the experiment's,
the major tics sit at the "nice" multiples a graph axis would choose (`GraphView.linearTicStep` in the
Android app, the same table here): the step of an axis of range *r* with at most *n* tics, where *n* is
max(2, floor(*L* / (5 · *s*))) for a baseline of *L* pixels and a text size of *s* pixels (the element's
font size times `size`). In the experiment's unit with an explicit `ticStep` the values carry as many
decimals as the step needs to be written exactly (10 → 0, 0.25 → 2) or `precision`; a converted scale labels
every automatic tic, with the decimals the step needs or `precision` under the precision rule of the units
page. Minor tics divide every step, also between min and the first major tic and after the last one.

**The label click.** The label of a scale with a convertible unit is a positioned hit box
(`.scaleLabel`) over the label text that opens the unit dialog. It is the one click a stack passes on:
the stack and everything in it are `pointer-events: none`, the hit box alone is `auto`, so a click
reaches it even under a transformed needle drawn later, and a click anywhere else on the stack does
nothing. A scale inside a transform gets no hit box.

### The graph configuration

All keys are always present (use `null` for "not set"), booleans are booleans, numbers are numbers:

| Key | Type | Meaning |
|---|---|---|
| `aspectRatio` | number | Width divided by height of the plot element |
| `labelX`, `labelY`, `labelZ` | string or null | Axis labels |
| `unitX`, `unitY`, `unitZ` | string or null | Axis units as text: the experiment's symbol for a unit reference, the text otherwise |
| `unitIdX`, `unitIdY`, `unitIdZ` | string or null | The unit id of an axis whose unit is a reference (file format 1.21), null for a text unit; with an id the axis can be shown in another unit of the quantity (see "Units") |
| `unitYX` | string or null | Unit of a slope (y per x), used for the two-point slope read-out while both axes show their experiment units; once an axis is converted the slope unit is composed from the display symbols |
| `logX`, `logY`, `logZ` | boolean | Logarithmic axes; log x/y can be toggled by the user when set |
| `xPrecision`, `yPrecision`, `zPrecision` | integer | Digits for axis labels and values, -1 = automatic |
| `suppressScientificNotation` | boolean | Never use scientific notation on the axes |
| `timeOnX`, `timeOnY` | boolean | The axis holds experiment time in seconds |
| `systemTime` | boolean | Show a time axis as a clock (initial state of the "system time" toggle); the interface maps experiment time via `/time` |
| `linearTime` | boolean | Time values include the pauses (mapped with the first start event only) |
| `scaleMinX`, `scaleMaxX`, `scaleMinY`, `scaleMaxY`, `scaleMinZ`, `scaleMaxZ` | `"auto"`, `"extend"` or `"fixed"` | How each axis end is chosen, as in the file format |
| `minX`, `maxX`, `minY`, `maxY`, `minZ`, `maxZ` | number or null | The values for `fixed`/`extend`, and the window width for `followX` |
| `followX` | boolean | Keep a window of `maxX - minX` anchored at the newest x value (initial state of the "follow" toggle) |
| `partialUpdate` | boolean | The x values (y for maps) are monotonic, so only new data is transferred |
| `mapWidth` | integer | Number of points per row of a color map |
| `plotLeft`, `plotTop`, `plotRight`, `plotBottom` | number or null | Fixed plot area as fractions of the graph element's box (file format 1.21); `null` = automatic layout. Any one set fixes the layout, the unset ones default to the corresponding edge (0, 0, 1, 1) |
| `colorScale` | array of `"#rrggbb"` or `"#rrggbbaa"` | Colors of a color map from low to high z; omitted for the default black-orange-white |
| `showColorScale` | boolean | Draw the color scale next to a map |
| `interpolateMapColors` | boolean | Interpolate between the colors of the scale |
| `datasets` | array | One entry per curve: `{"x": name or null, "y": name, "z": name or null, "style": "lines"/"dots"/"vbars"/"hbars"/"map", "lineWidth": number, "color": "#rrggbb" or "#rrggbbaa"}`. A dataset without `x` is plotted against the index. A map has exactly one dataset with `z` |
| `pickLabel` | string or null | Label of the data picker mode from the experiment (informational) |
| `pickOutputs` | array | The data picker outputs: `{"axis": "x"/"y"/"z", "buffer": name, "label": text, "calBuffer": name or null, "calLabel": text or null}`. Each becomes a button that writes the picked value into `buffer` via `POST /set` (replacing the buffer contents); with `calBuffer` the user is asked for a value that is written there in the same request |

Colors are the experiment's colors as given; the interface adapts them to its bright mode itself. A
color is `#rrggbb`, or `#rrggbbaa` when the experiment gave it an alpha byte (file format 1.21); the
bright-mode adjustment keeps the alpha. The same two forms appear in the inline styles of the
`html` of value, info and separator elements.

### Graph strings

The keys of the `graphStrings` object (the interface has English defaults for all of them):
`panAndZoom`, `pick`, `resetZoom`, `follow`, `logX`, `logY`, `systemTime`, `point`,
`difference`, `slope`, `noData`, `noValidData`, `noDataInRange`, `ok`, `cancel`,
`invalidValue`, `zoomHint`, `colorMapWarning`, `unit`, `unitExperimentDefault`, `metric`, `imperial`,
`other` (the last five belong to the unit dialog), and for the question when a zoomed maximized
graph is left (the same keys as the apps' string resources): `applyZoomQuestionTitle`,
`applyZoomQuestion`, `applyZoomRange` (three placeholders: axis label, from, to),
`applyZoomActionReset`, `applyZoomActionKeep`, `applyZoomActionFollow`, `applyZoomMoreOptions`,
`applyZoomAlsoApply`, `applyZoomTargetThis`, `applyZoomTargetSameData`, `applyZoomTargetSameUnit`
(one placeholder, the unit symbol), `applyZoomTargetSameAxis` (one placeholder, `x` or `y`).
Placeholders are accepted in the Java form (`%1$s`, `%s`) and the Swift form (`%1$@`, `%@`).

### Leaving a maximized graph

A click on the label, on the plot's surroundings (outside the plot area and off the axis titles) or
on another view's tab leaves the maximized graph. If the user has zoomed, the interface first asks
"Keep this view?", as the apps do: "Reset zoom" and "Keep this section" answer directly, "More
options…" offers reset / keep / keep and follow new data per axis, each axis headed by its label
and zoomed range in the display unit as the tick labels would show it, and
"Also apply to other graphs with…" the same data (the same input buffer), the same unit (the range
converted between display units) or any axis of the same kind, among the graphs of the current view.
Cancel stays in the maximized graph; a view switch or a layout change waits for the answer. No
question is asked when nothing is zoomed, so toggling the clock display alone does not trigger it.

### Units

The interface implements the unit conversion of phyphox-docs `docs/file-format/units.md` in the
browser, from the same table the apps carry (`PhyphoxUnits` in `index.html`; it must stay literally in
step with the apps): a value or edit element with a `value`/`edit` configuration, a graph axis
with a `unitId*` and a scale with a unit reference show their unit as the experiment names it, or its counterpart when `unitSystem`
says `metric` or `imperial`; a click or tap on the unit of a value or edit element, on the label of a scale, or on the axis
title text of a maximized graph (the "t (s)" below the plot for x, the rotated title left of it for
y, the colour scale's title for z, each with a small slop; a click elsewhere outside the plot leaves
the maximized graph), opens a dialog with the units of that quantity, grouped by system, the
experiment's marked as its default. The choice is page-local and not stored. Everything the element shows is converted (the
value with the precision rule, the field and its limits, the chart's data, ranges, ticks and the
picker's read-outs, with differences and slopes carrying the scale alone, the values at the tics of a
scale within its unchanged geometry), while the REST API keeps
carrying the buffers' original values: a pick output and a typed value are converted back before
they are sent. Text units, values with `positiveUnit`/`negativeUnit` or a non-float `format`, integer
edit fields and a time axis showing a clock are not converted.

## Tests

`test/` holds a browser test suite for the interface: `node --test` with puppeteer-core driving the
system Chromium or Chrome in headless mode, no internet needed after the one-time `npm ci`.

```
cd test
npm ci
npm test                                        # against the bundled mock server
PHYPHOX_URL=http://127.0.0.1:8080/ npm test     # against a running app
```

`test/mock_server.js` stands in for the app: it serves `index.html` and `style.css` with the
placeholders replaced, a synthetic experiment covering every graph variant, and enough of the REST
API to run the interface (`npm run mock` starts it on port 8081 for manual testing in a browser).
It also serves `test/fixtures/`, so the fixture experiment `webgraphs.phyphox` can be pushed to a
phone or emulator through the app's `phyphox://` scheme. For the second form, open that fixture in
the app with remote access enabled and forward the port; the app repositories' CI does exactly
this on an emulator, see `.github/workflows/t1.yml` in phyphox-android. The tests look up graphs by
their label and skip the ones the served experiment does not contain, so the same suite runs in
both modes. `PUPPETEER_EXECUTABLE_PATH` or `CHROME_PATH` picks the browser, `KEEP_SCREENSHOTS=1`
saves screenshots under `test/out/`.

The suite is the place for a regression test whenever the interface changes: mock first, and the
app run confirms the contract between the app and this repository.

## Used libraries

All libraries are inlined in `index.html` and distributed under the MIT license. To update one,
replace the corresponding `<script>` block with the new minified build and adjust this list.

### Chart.js 4.5.1

The plotting library (https://www.chartjs.org). Copyright (c) 2014-2024 Chart.js Contributors.

### chartjs-plugin-zoom 2.2.0

Zoom and pan for Chart.js (https://www.chartjs.org/chartjs-plugin-zoom/). Copyright (c) 2013-2021
chartjs-plugin-zoom contributors.

### Hammer.js 2.0.8

Touch gesture recognition, used by the zoom plugin for pinch and pan (https://hammerjs.github.io/).
Copyright (C) 2011-2014 by Jorik Tangelder (Eight Media).

### The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
