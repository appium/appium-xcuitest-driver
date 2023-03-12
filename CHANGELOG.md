## [4.19.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.19.0...v4.19.1) (2023-03-12)


### Bug Fixes

* Make sure the app is not reinstalled if noReset is requested ([4e8ccba](https://github.com/appium/appium-xcuitest-driver/commit/4e8ccba99d5e7b491ecdca0d5e17188e76165223))
* Tune app install condition ([d64805b](https://github.com/appium/appium-xcuitest-driver/commit/d64805b80fb1f1ab4a13fa1ebcdbb8915548d883))

## [4.19.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.18.4...v4.19.0) (2023-03-03)


### Features

* Allow to skip app install if a newer/same app version is already installed ([#1514](https://github.com/appium/appium-xcuitest-driver/issues/1514)) ([a79cc4e](https://github.com/appium/appium-xcuitest-driver/commit/a79cc4e9f6e1c4e83cc2224a70381427ecc48329))


### Code Refactoring

* cleanup process.env.CLOUD and process.env.REAL_DEVICE ([#1513](https://github.com/appium/appium-xcuitest-driver/issues/1513)) ([579b1ee](https://github.com/appium/appium-xcuitest-driver/commit/579b1ee62288876d569cb6ae2c222a2658eb4c59))

## [4.18.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.18.3...v4.18.4) (2023-02-28)


### Miscellaneous Chores

* Short circuit if the app under test crashes while checking for alerts ([#1510](https://github.com/appium/appium-xcuitest-driver/issues/1510)) ([5684cdf](https://github.com/appium/appium-xcuitest-driver/commit/5684cdf8c55a2d6a59d51e56c94bf0cec01f79a4))

## [4.18.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.18.2...v4.18.3) (2023-02-27)


### Miscellaneous Chores

* Bump @appium/docutils from 0.1.6 to 0.2.2 ([#1509](https://github.com/appium/appium-xcuitest-driver/issues/1509)) ([5e7c927](https://github.com/appium/appium-xcuitest-driver/commit/5e7c927353e38b096d0e7e82f52163e0e022e6bd))

## [4.18.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.18.1...v4.18.2) (2023-02-26)


### Miscellaneous Chores

* remove unused cookies code ([#1508](https://github.com/appium/appium-xcuitest-driver/issues/1508)) ([1f5e2c4](https://github.com/appium/appium-xcuitest-driver/commit/1f5e2c4ef17b2698a4f8a156fcccac7f3406b659))

## [4.18.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.18.0...v4.18.1) (2023-02-23)


### Bug Fixes

* Update WDA build scipt ([#1506](https://github.com/appium/appium-xcuitest-driver/issues/1506)) ([ad84172](https://github.com/appium/appium-xcuitest-driver/commit/ad841721549513ebcb1accc7840667d6898e023f))

## [4.18.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.17.1...v4.18.0) (2023-02-20)


### Features

* Add simulated geolocation extensions ([#1503](https://github.com/appium/appium-xcuitest-driver/issues/1503)) ([cfb149b](https://github.com/appium/appium-xcuitest-driver/commit/cfb149be26b6dfc55771e6b5159b14c127f88268))

## [4.17.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.17.0...v4.17.1) (2023-02-20)


### Miscellaneous Chores

* Bump pngjs from 6.0.0 to 7.0.0 ([#1504](https://github.com/appium/appium-xcuitest-driver/issues/1504)) ([e0bdc0b](https://github.com/appium/appium-xcuitest-driver/commit/e0bdc0b0ae18f6681ce9ca7f5328ec318061c724))

## [4.17.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.13...v4.17.0) (2023-02-20)


### Features

* Add deepLink extension ([#1502](https://github.com/appium/appium-xcuitest-driver/issues/1502)) ([067179b](https://github.com/appium/appium-xcuitest-driver/commit/067179beda19ca478d2d08b59ffb864ba6c9bbdb))

## [4.16.13](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.12...v4.16.13) (2023-02-17)


### Miscellaneous Chores

* Bump WDA ([d8994f9](https://github.com/appium/appium-xcuitest-driver/commit/d8994f9e807e893544ce0fcd42e63147fa1a1c5b))

## [4.16.12](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.11...v4.16.12) (2023-02-06)


### Bug Fixes

* Update NOTCHED_DEVICE_SIZES for nativeWebTapStrict (part of [#1490](https://github.com/appium/appium-xcuitest-driver/issues/1490)) ([#1497](https://github.com/appium/appium-xcuitest-driver/issues/1497)) ([e2bbd94](https://github.com/appium/appium-xcuitest-driver/commit/e2bbd94e27d402776de235ff53abd714b7ae6ef0))

## [4.16.11](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.10...v4.16.11) (2023-02-05)


### Bug Fixes

* update WDA to include snapshots/maxDepth fixes ([#1495](https://github.com/appium/appium-xcuitest-driver/issues/1495)) ([ccc30f8](https://github.com/appium/appium-xcuitest-driver/commit/ccc30f81329e149a6dc60c1c4b824052cdfb998d))

## [4.16.10](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.9...v4.16.10) (2023-01-17)


### Miscellaneous Chores

* Bump semantic-release from 19.0.5 to 20.0.2 ([#1485](https://github.com/appium/appium-xcuitest-driver/issues/1485)) ([bbe7366](https://github.com/appium/appium-xcuitest-driver/commit/bbe73661336671b2c189fd3a1af6ecf5873001e3))

## [4.16.9](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.8...v4.16.9) (2023-01-13)


### Miscellaneous Chores

* Bump appium-xcode from 4.0.5 to 5.0.0 ([#1488](https://github.com/appium/appium-xcuitest-driver/issues/1488)) ([e759033](https://github.com/appium/appium-xcuitest-driver/commit/e759033fdac8b05f4410fd77028c0f85cf22918d))

## [4.16.8](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.7...v4.16.8) (2023-01-12)


### Bug Fixes

* specify supported non-standard commands in newMethodMap ([503bd60](https://github.com/appium/appium-xcuitest-driver/commit/503bd60398155bf7e1d95346dad6258d120f0fb2))

## [4.16.7](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.6...v4.16.7) (2023-01-10)


### Bug Fixes

* mobile:getPermission for iOS 14+ ([#1486](https://github.com/appium/appium-xcuitest-driver/issues/1486)) ([803390c](https://github.com/appium/appium-xcuitest-driver/commit/803390cb3e5f0d3fc24d5278dd8c9af89e3f70e5))

## [4.16.6](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.5...v4.16.6) (2023-01-03)


### Bug Fixes

* Include scripts into the package ([f747865](https://github.com/appium/appium-xcuitest-driver/commit/f747865ca970c5480fb3602f8f3a35ecb2fa1a25))

## [4.16.5](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.4...v4.16.5) (2022-12-28)


### Miscellaneous Chores

* remove tapWithShortPressDuration cap ([#1481](https://github.com/appium/appium-xcuitest-driver/issues/1481)) ([5d64e3a](https://github.com/appium/appium-xcuitest-driver/commit/5d64e3aa32ef4eaaaadaeb1c799670622680b579))

## [4.16.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.3...v4.16.4) (2022-12-28)


### Bug Fixes

* releaseActions fails due to unhandled endpoint ([#1477](https://github.com/appium/appium-xcuitest-driver/issues/1477)) ([ff53b98](https://github.com/appium/appium-xcuitest-driver/commit/ff53b9890a04c4501762325d195815f52ce8a916))

## [4.16.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.2...v4.16.3) (2022-12-19)


### Bug Fixes

* set permissions for simulator ([#1473](https://github.com/appium/appium-xcuitest-driver/issues/1473)) ([a885628](https://github.com/appium/appium-xcuitest-driver/commit/a8856286ea7304a9c2ec3ed8c46a5c66526bc102))

## [4.16.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.1...v4.16.2) (2022-12-18)


### Bug Fixes

* XCTest command ([#1471](https://github.com/appium/appium-xcuitest-driver/issues/1471)) ([d176f45](https://github.com/appium/appium-xcuitest-driver/commit/d176f455c23b4c6b59ff72be36d3050c60bcf470))

## [4.16.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.16.0...v4.16.1) (2022-12-17)


### Bug Fixes

* /wda/device/appearance as withoutSession ([#1472](https://github.com/appium/appium-xcuitest-driver/issues/1472)) ([00eba1d](https://github.com/appium/appium-xcuitest-driver/commit/00eba1d9eb42c998ffe93d978cb9fb4c5f761b35))

## [4.16.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.15.2...v4.16.0) (2022-12-16)


### Features

* Bump the major version of appium-ios-simulator ([#1468](https://github.com/appium/appium-xcuitest-driver/issues/1468)) ([c9fc1dc](https://github.com/appium/appium-xcuitest-driver/commit/c9fc1dc7d70a2050435a651d77bc6e37253965cd))

## [4.15.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.15.1...v4.15.2) (2022-12-14)


### Miscellaneous Chores

* Bump @appium/test-support from 2.0.2 to 3.0.0 ([#1467](https://github.com/appium/appium-xcuitest-driver/issues/1467)) ([3149a15](https://github.com/appium/appium-xcuitest-driver/commit/3149a15240b4529085cbee8e015b8cedbf054179))

## [4.15.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.15.0...v4.15.1) (2022-12-13)


### Miscellaneous Chores

* Deprecate calendarAccessAuthorized capability ([#1465](https://github.com/appium/appium-xcuitest-driver/issues/1465)) ([2c63d9a](https://github.com/appium/appium-xcuitest-driver/commit/2c63d9a97ae4c420942e66f2a3bc1413535c7905))

## [4.15.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.14.0...v4.15.0) (2022-12-13)


### Features

* add reduceTransparency ([#1464](https://github.com/appium/appium-xcuitest-driver/issues/1464)) ([82e7c23](https://github.com/appium/appium-xcuitest-driver/commit/82e7c237dcf8dcd5ee23c2bd57c2f831f4083a03))

## [4.14.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.13.4...v4.14.0) (2022-12-13)


### Features

* Streamline changing of Simulator preferences ([#1463](https://github.com/appium/appium-xcuitest-driver/issues/1463)) ([79c2e36](https://github.com/appium/appium-xcuitest-driver/commit/79c2e3626d550a2d04ace00d840d7b8e4d14614b))

## [4.13.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.13.3...v4.13.4) (2022-12-10)


### Miscellaneous Chores

* Only call appropriate setters if their capabilities are defined ([#1462](https://github.com/appium/appium-xcuitest-driver/issues/1462)) ([f633a51](https://github.com/appium/appium-xcuitest-driver/commit/f633a51981aab8d03c3a3cb173bea90b6f9178a1))

## [4.13.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.13.2...v4.13.3) (2022-12-08)


### Miscellaneous Chores

* Bump WDA ([b6f1658](https://github.com/appium/appium-xcuitest-driver/commit/b6f1658fa1920b3e52005be0f63f1e66c0723c1b))

## [4.13.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.13.1...v4.13.2) (2022-12-05)


### Miscellaneous Chores

* Bump webdriverio from 7.27.0 to 8.0.5 ([#1460](https://github.com/appium/appium-xcuitest-driver/issues/1460)) ([7f1c079](https://github.com/appium/appium-xcuitest-driver/commit/7f1c0793b83b6c41a71c848472e93de04eb1cb04))

## [4.13.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.13.0...v4.13.1) (2022-12-01)


### Miscellaneous Chores

* update releaserc ([#1458](https://github.com/appium/appium-xcuitest-driver/issues/1458)) ([c818934](https://github.com/appium/appium-xcuitest-driver/commit/c81893450bdf48be8cb9406e06a3a99b6f826ba3))

# [4.13.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.12.4...v4.13.0) (2022-12-01)


### Features

* Add a script to open WDA in Xcode ([#1457](https://github.com/appium/appium-xcuitest-driver/issues/1457)) ([e2255fe](https://github.com/appium/appium-xcuitest-driver/commit/e2255fe92d1a4e3bb129b840b06a61fc312d1a11))

## [4.12.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.12.3...v4.12.4) (2022-11-29)

## [4.12.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.12.2...v4.12.3) (2022-11-25)

## [4.12.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.12.1...v4.12.2) (2022-11-06)
