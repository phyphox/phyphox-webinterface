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
| `maxWidth`, `fillLastRow` | `grid` only: the largest column width in text line heights (`em` of the element), and whether an incomplete last row is split among its children |
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

The two function entries are emitted as JavaScript source, which is why the view layout is not
strictly JSON. Elements that describe themselves purely with data, like the graph, are the
preferred direction for new element types.

### The graph configuration

All keys are always present (use `null` for "not set"), booleans are booleans, numbers are numbers:

| Key | Type | Meaning |
|---|---|---|
| `aspectRatio` | number | Width divided by height of the plot element |
| `labelX`, `labelY`, `labelZ` | string or null | Axis labels |
| `unitX`, `unitY`, `unitZ` | string or null | Axis units |
| `unitYX` | string or null | Unit of a slope (y per x), used for the two-point slope read-out |
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
`invalidValue`, `zoomHint`, `colorMapWarning`.

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
