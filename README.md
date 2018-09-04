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

## Branches

We keep the code of the most recent published version in "master", while minor development is done in "development". Larger changes and long-term development occurs in additional branches, which at some point converge in a "dev-next" branch. In some repositories you will also find a "translation" branch, which usually is identical or very close to the current "development" or "dev-next" branch and linked to our translation system to control when our translators are able to work on new text passages.

## Contributing

We encourage any contribution to our project. However, due to the complexity of the project and the fact that it is used in schools around the world, there are some things to consider before any code makes it into the final version of phyphox that is distributed in the app stores:
* Be careful about changes of the UI. Many teachers rely on a simple and consistent workflow without too much distraction for their students. Also, they might have created some worksheets, which need updates when the interface changes. Therefore, try to add new features in a simple and lean way.
* Android and iOS versions should remain as similar as possible. We do accept slight variations of the UI of both versions if they follow the obvious design standards of each platform (for example using checkmarks on Android but buttons telling the action on iOS, or a FAB on Android and a Actionbar entry on iOS) and one version might get features that are impossible on the other platform (for example reading the light sensor on Android, which cannot be done on iOS or getting the number of satellites for GPS on Android). But if you provide a new feature that can be implemented on the other platform as well, we will not include it in the final app until we (or you or somebody) has ported it to the other platform as well. Once again, this app is used in classes around the world and we want to provide a very similar experience on both platforms, so the teachers don't have to explain the usage of phyphox twice.
* Translation is not done via git directly. If you want to translate the app, contact us, so we can set up an account for you on our translation system.
In any case, if you plan on contibuting more than a little bugfix or optimization, it is probably a good idea to contact us first, so we can plan together and consider your plans in our development as well.

## Used libraries

### chart.js

This part of phyphox uses the JavaScript plotting library chart.js (http://chartjs.org). Chart.js is distributed under the following licence.

The MIT License (MIT)

Copyright (c) 2018 Chart.js Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
