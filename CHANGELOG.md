## [5.9.1](https://github.com/appium/appium-xcuitest-driver/compare/v5.9.0...v5.9.1) (2023-11-21)


### Bug Fixes

* assign deeply cloned processArguments for starting a WDA session ([#2245](https://github.com/appium/appium-xcuitest-driver/issues/2245)) ([2e6f273](https://github.com/appium/appium-xcuitest-driver/commit/2e6f273e8533cf02284079d1fea919a7062fd2cc))

## [5.9.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.8.2...v5.9.0) (2023-11-19)


### Features

* add * in additionalWebviewBundleIds cap ([#2244](https://github.com/appium/appium-xcuitest-driver/issues/2244)) ([74874f5](https://github.com/appium/appium-xcuitest-driver/commit/74874f536975337a6608633de8aa9435a0edd52a))

## [5.8.2](https://github.com/appium/appium-xcuitest-driver/compare/v5.8.1...v5.8.2) (2023-11-08)


### Bug Fixes

* to push a new release with updated npm-shrinkwrap ([b0dfc39](https://github.com/appium/appium-xcuitest-driver/commit/b0dfc393316b6573a7b15855d97d16f29570eb9b))

## [5.8.1](https://github.com/appium/appium-xcuitest-driver/compare/v5.8.0...v5.8.1) (2023-11-01)


### Bug Fixes

* Sync package-lock ([09be06f](https://github.com/appium/appium-xcuitest-driver/commit/09be06f7c13f3aaba5a4f1b8552e0dbb356ec200))

## [5.8.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.7.0...v5.8.0) (2023-10-30)


### Features

* Add 'mobile: keys' extension ([#2156](https://github.com/appium/appium-xcuitest-driver/issues/2156)) ([db39d66](https://github.com/appium/appium-xcuitest-driver/commit/db39d66e6605d22d7b8d1150a9612b74cb962f79))

## [5.7.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.6.0...v5.7.0) (2023-10-13)


### Features

* Add 'mobile: calibrateWebToRealCoordinatesTranslation' API ([#2071](https://github.com/appium/appium-xcuitest-driver/issues/2071)) ([b3fa78d](https://github.com/appium/appium-xcuitest-driver/commit/b3fa78d69bdaec03435e02a7e4ffb0b80a9bbde3))

## [5.6.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.5.0...v5.6.0) (2023-10-03)


### Features

* use mobile:setSimulatedLocation in setGeoLocation for ios 17 ([#2062](https://github.com/appium/appium-xcuitest-driver/issues/2062)) ([69dfab9](https://github.com/appium/appium-xcuitest-driver/commit/69dfab95dc7ba1506e2c1fe2a59e4e4be6f7b113))

## [5.5.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.4.1...v5.5.0) (2023-10-02)


### Features

* uninstall the test app once and install that again when MismatchedApplicationIdentifierEntitlement installation error occurs ([#2050](https://github.com/appium/appium-xcuitest-driver/issues/2050)) ([0c561f5](https://github.com/appium/appium-xcuitest-driver/commit/0c561f514822965166e6f87ee9725ad28542f185))

## [5.4.1](https://github.com/appium/appium-xcuitest-driver/compare/v5.4.0...v5.4.1) (2023-10-01)


### Bug Fixes

* get bundleId for other apps before calling installation ([#2054](https://github.com/appium/appium-xcuitest-driver/issues/2054)) ([4feaf33](https://github.com/appium/appium-xcuitest-driver/commit/4feaf336dae242605543fb84d5c7b40aa5103470))

## [5.4.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.3.3...v5.4.0) (2023-09-26)


### Features

* Add clearApp extension ([#2031](https://github.com/appium/appium-xcuitest-driver/issues/2031)) ([ae0afdc](https://github.com/appium/appium-xcuitest-driver/commit/ae0afdcafabbb8164b3996627c7c3fc0f788eaf3))

## [5.3.3](https://github.com/appium/appium-xcuitest-driver/compare/v5.3.2...v5.3.3) (2023-09-24)


### Bug Fixes

* try fix release to include npm-shrinkwrap.json ([#2023](https://github.com/appium/appium-xcuitest-driver/issues/2023)) ([57fc5b8](https://github.com/appium/appium-xcuitest-driver/commit/57fc5b8dca469887cd196aee95d4230c2e21e889)), closes [#2022](https://github.com/appium/appium-xcuitest-driver/issues/2022)

## [5.3.1](https://github.com/appium/appium-xcuitest-driver/compare/v5.3.0...v5.3.1) (2023-09-23)


### Bug Fixes

* bump wda (5.9.0, 5.9.1) and simulator(5.3.2) ([#2021](https://github.com/appium/appium-xcuitest-driver/issues/2021)) ([f6f78f5](https://github.com/appium/appium-xcuitest-driver/commit/f6f78f579da4bf439a9a2011ab02c1f9a105a1f3))

## [5.3.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.2.1...v5.3.0) (2023-09-20)


### Features

* add capability to run special input event triggering after send keys ([d559803](https://github.com/appium/appium-xcuitest-driver/commit/d5598039b52dc6c475b2cbb3c5c5049cc673a866)), closes [appium/appium#19052](https://github.com/appium/appium/issues/19052)

## [5.2.1](https://github.com/appium/appium-xcuitest-driver/compare/v5.2.0...v5.2.1) (2023-09-19)


### Bug Fixes

* terminateApp with devicectl for iOS 17 ([#1997](https://github.com/appium/appium-xcuitest-driver/issues/1997)) ([16c7319](https://github.com/appium/appium-xcuitest-driver/commit/16c73198397495f235cc49f6fb978050a9e2f49d))

## [5.2.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.1.0...v5.2.0) (2023-09-16)


### Features

* support pageSourceExcludedAttributes ([#1996](https://github.com/appium/appium-xcuitest-driver/issues/1996)) ([4bcea84](https://github.com/appium/appium-xcuitest-driver/commit/4bcea840148aa126579603d8417f77e3437db312))

## [5.1.0](https://github.com/appium/appium-xcuitest-driver/compare/v5.0.0...v5.1.0) (2023-09-14)


### Features

* add autoFillPasswords capability ([#1972](https://github.com/appium/appium-xcuitest-driver/issues/1972)) ([85aaa7f](https://github.com/appium/appium-xcuitest-driver/commit/85aaa7f62a5f882ebcaabe1c2c2272d5c9217481))
* dummy feat commit to run the auto release ([#1983](https://github.com/appium/appium-xcuitest-driver/issues/1983)) ([5916712](https://github.com/appium/appium-xcuitest-driver/commit/59167127f618dc350c9bdcf414c23c008d17169f))

## [5.0.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.35.0...v5.0.0) (2023-09-05)

### Code Refactoring

* Deprecate obsolete endpoints ([#1955](https://github.com/appium/appium-xcuitest-driver/issues/1955))
    * The includeDeviceCapsToSessionInfo capability has no effect now
    * The obsolete getSession API does not return any extra driver-specific data anymore (e.g. statBarHeight, pixelRatio, viewportRect)
    * Obsolete reset, launchApp and closeApp APIs now throw errors on invocation

## [4.35.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.34.1...v4.35.0) (2023-08-25)


### Features

* Include 'hittable' attribute ([#1918](https://github.com/appium/appium-xcuitest-driver/issues/1918)) ([b56a3d4](https://github.com/appium/appium-xcuitest-driver/commit/b56a3d4e06e3a345cdcfee9c8d8b174e6063e3ca))

## [4.34.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.34.0...v4.34.1) (2023-08-21)


### Bug Fixes

* Update glob options ([4a7a963](https://github.com/appium/appium-xcuitest-driver/commit/4a7a96319c653350b21f1836cba8afce0290a983))

## [4.34.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.33.2...v4.34.0) (2023-08-16)


### Features

* use new selenium atoms from remote debugger ([2707c01](https://github.com/appium/appium-xcuitest-driver/commit/2707c015a8990f0d666b35fefcfe15b368f9c605))

## [4.33.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.33.1...v4.33.2) (2023-08-04)


### Bug Fixes

* Args sequence for mobileTapWithNumberOfTaps ([4cb7430](https://github.com/appium/appium-xcuitest-driver/commit/4cb7430afae40307601711907fee89afb459ee48))

## [4.33.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.33.0...v4.33.1) (2023-08-04)


### Bug Fixes

* Args order for mobileTapWithNumberOfTaps call ([#1854](https://github.com/appium/appium-xcuitest-driver/issues/1854)) ([27ec7b3](https://github.com/appium/appium-xcuitest-driver/commit/27ec7b38b0b509cbf83506d44cdc376c3d0bbf6a))

## [4.33.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.25...v4.33.0) (2023-08-02)


### Features

* Lock only major package versions ([#1835](https://github.com/appium/appium-xcuitest-driver/issues/1835)) ([d640d77](https://github.com/appium/appium-xcuitest-driver/commit/d640d770ac5d9899b22ce6f6a62222bff1d10111))

## [4.32.25](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.24...v4.32.25) (2023-08-02)


### Bug Fixes

* **deps:** update dependency lru-cache to v10 ([#1776](https://github.com/appium/appium-xcuitest-driver/issues/1776)) ([2079a56](https://github.com/appium/appium-xcuitest-driver/commit/2079a56578fbdd5a09220caff1c1f1e7f8ec4254))

## [4.32.24](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.23...v4.32.24) (2023-08-01)


### Bug Fixes

* **deps:** update dependency appium-ios-simulator to v5.1.3 ([#1830](https://github.com/appium/appium-xcuitest-driver/issues/1830)) ([f71f9a0](https://github.com/appium/appium-xcuitest-driver/commit/f71f9a00868d8a69657a8fb6340418f9c9ab2e4a))

## [4.32.23](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.22...v4.32.23) (2023-07-21)


### Bug Fixes

* isAppInstalled in Xcode 15 env for simulator ([#1822](https://github.com/appium/appium-xcuitest-driver/issues/1822)) ([78f2ef2](https://github.com/appium/appium-xcuitest-driver/commit/78f2ef2fe2b7ace3d6ddadb3157f338a0f6c4cb3))

## [4.32.22](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.21...v4.32.22) (2023-07-20)


### Bug Fixes

* **deps:** update dependency @xmldom/xmldom to v0.8.10 ([598aafe](https://github.com/appium/appium-xcuitest-driver/commit/598aafebd808c654ed182e52e4a09be193182554))

## [4.32.21](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.20...v4.32.21) (2023-07-16)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v5.6.0 for waitForQuiescence in in /wda/apps/launch ([#1817](https://github.com/appium/appium-xcuitest-driver/issues/1817)) ([9e4ded1](https://github.com/appium/appium-xcuitest-driver/commit/9e4ded1fe475d7aa83c638b1d2ca3e79936e7fc5))

## [4.32.20](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.19...v4.32.20) (2023-07-13)


### Bug Fixes

* **deps:** update dependency @xmldom/xmldom to v0.8.9 ([a5312c6](https://github.com/appium/appium-xcuitest-driver/commit/a5312c6bf1fd4fe2a2f5722e776b4ac7f17248a8))

## [4.32.19](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.18...v4.32.19) (2023-07-09)


### Bug Fixes

* **deps:** update dependency semver to v7.5.4 ([a3bed9e](https://github.com/appium/appium-xcuitest-driver/commit/a3bed9e3a3fb3326556526e0046c6a67a9026ac8))

## [4.32.18](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.17...v4.32.18) (2023-07-09)


### Bug Fixes

* **deps:** update dependency node-simctl to v7.1.17 ([6d52868](https://github.com/appium/appium-xcuitest-driver/commit/6d52868be4d449a610a5ec86f3972a5736714d42))

## [4.32.17](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.16...v4.32.17) (2023-07-08)


### Bug Fixes

* **deps:** update dependency appium-xcode to v5.1.4 ([b2d0960](https://github.com/appium/appium-xcuitest-driver/commit/b2d0960d19757d72c48b6fe807181c9a4aa82cde))

## [4.32.16](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.15...v4.32.16) (2023-07-08)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v5.5.2 ([cebc357](https://github.com/appium/appium-xcuitest-driver/commit/cebc357c6da924e9d440f85af0ad6dcfa4e3df1a))

## [4.32.15](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.14...v4.32.15) (2023-07-08)


### Bug Fixes

* **deps:** update dependency appium-remote-debugger to v9.1.17 ([519cc40](https://github.com/appium/appium-xcuitest-driver/commit/519cc40528c3bfc72e45b55d5210401db8fe609b))

## [4.32.14](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.13...v4.32.14) (2023-07-07)


### Bug Fixes

* **deps:** update dependency appium-ios-simulator to v5.1.1 ([ce0d917](https://github.com/appium/appium-xcuitest-driver/commit/ce0d91780003fa4dfd7231ff75fdc9178b804f30))

## [4.32.13](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.12...v4.32.13) (2023-07-07)


### Bug Fixes

* **deps:** update dependency appium-ios-device to v2.5.4 ([1b14568](https://github.com/appium/appium-xcuitest-driver/commit/1b145684920ab85c76b1808c5b293c6390a5f53c))

## [4.32.12](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.11...v4.32.12) (2023-07-07)


### Bug Fixes

* **deps:** update dependency appium-idb to v1.6.13 ([9f0f26c](https://github.com/appium/appium-xcuitest-driver/commit/9f0f26c7da9ea3ca6a099afa6e00d82cec3cb2d1))

## [4.32.11](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.10...v4.32.11) (2023-07-01)


### Reverts

* Revert "chore(workflows): pin dependencies (#1773)" (#1794) ([abb6de9](https://github.com/appium/appium-xcuitest-driver/commit/abb6de9e135cdc66878f61665ff9d2290e070666)), closes [#1773](https://github.com/appium/appium-xcuitest-driver/issues/1773) [#1794](https://github.com/appium/appium-xcuitest-driver/issues/1794)


### Code Refactoring

* Tune temporary simulator creation logic ([#1790](https://github.com/appium/appium-xcuitest-driver/issues/1790)) ([9ac2f6a](https://github.com/appium/appium-xcuitest-driver/commit/9ac2f6a52348230f7d4c425722a4ef07c8ac4043))

## [4.32.10](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.9...v4.32.10) (2023-06-27)


### Bug Fixes

* **deps:** update dependency css-selector-parser to v2.3.2 ([77dbcee](https://github.com/appium/appium-xcuitest-driver/commit/77dbceefbc10f44ab5bc0e9a50f5aa3c781064d4))

## [4.32.9](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.8...v4.32.9) (2023-06-24)


### Bug Fixes

* **deps:** update dependency appium-ios-simulator to v5.1.0 ([4810e6f](https://github.com/appium/appium-xcuitest-driver/commit/4810e6f853780ad195702b208169b6ad958f72ca))

## [4.32.8](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.7...v4.32.8) (2023-06-23)


### Bug Fixes

* Copypaste in mobile method names ([#1783](https://github.com/appium/appium-xcuitest-driver/issues/1783)) ([710d246](https://github.com/appium/appium-xcuitest-driver/commit/710d24631b052f9499573e65ca24b34e238b7c02))

## [4.32.7](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.6...v4.32.7) (2023-06-23)


### Bug Fixes

* **deps:** update dependency semver to v7.5.3 ([5f35e37](https://github.com/appium/appium-xcuitest-driver/commit/5f35e37946b8e0643b7fc5117858ee98f3219327))

## [4.32.6](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.5...v4.32.6) (2023-06-23)


### Bug Fixes

* trigger release based on package.json update ([b40c8f4](https://github.com/appium/appium-xcuitest-driver/commit/b40c8f45e4aa9ca4cc0da8ace0fc83f1c79b691a))

## [4.32.5](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.4...v4.32.5) (2023-06-17)


### Bug Fixes

* **deps:** update dependency semver to v7.5.2 ([d6c236d](https://github.com/appium/appium-xcuitest-driver/commit/d6c236da158dc6fe50a20e812917cc4dc132447b))

## [4.32.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.3...v4.32.4) (2023-06-16)


### Bug Fixes

* **deps:** update dependency css-selector-parser to v2 ([#1759](https://github.com/appium/appium-xcuitest-driver/issues/1759)) ([0426349](https://github.com/appium/appium-xcuitest-driver/commit/0426349da313127111c19d4de44151ab45ecb64f))

## [4.32.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.2...v4.32.3) (2023-06-16)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v5.5.1 ([#1770](https://github.com/appium/appium-xcuitest-driver/issues/1770)) ([e1c1bc9](https://github.com/appium/appium-xcuitest-driver/commit/e1c1bc932c9d550d1aaa1e82b6638eea8952c616))

## [4.32.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.1...v4.32.2) (2023-06-14)


### Bug Fixes

* **deps:** update dependency node-simctl to v7.1.16 ([#1743](https://github.com/appium/appium-xcuitest-driver/issues/1743)) ([33eced1](https://github.com/appium/appium-xcuitest-driver/commit/33eced1a309091bc3c7826c5a2fce36c2c9e87dd))

## [4.32.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.32.0...v4.32.1) (2023-06-14)


### Bug Fixes

* **deps:** update dependency teen_process to v2.0.4 ([#1758](https://github.com/appium/appium-xcuitest-driver/issues/1758)) ([a95e08a](https://github.com/appium/appium-xcuitest-driver/commit/a95e08a40a2d8653b4bc2162102a681396f25eb5))

## [4.32.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.31.0...v4.32.0) (2023-06-13)


### Features

* Add 'mobile: performAccessibilityAudit' extension ([#1754](https://github.com/appium/appium-xcuitest-driver/issues/1754)) ([cf2bb1b](https://github.com/appium/appium-xcuitest-driver/commit/cf2bb1b70e11a23438526b62018c892c29123cc8))


### Bug Fixes

* Only request chosen application attributes ([#1753](https://github.com/appium/appium-xcuitest-driver/issues/1753)) ([a8caa79](https://github.com/appium/appium-xcuitest-driver/commit/a8caa79269dc525a80c70cdc58f21789f39e8eba))

## [4.31.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.9...v4.31.0) (2023-06-10)


### Features

* bump WDA for Xcode 15 ([#1747](https://github.com/appium/appium-xcuitest-driver/issues/1747)) ([cc4ccdd](https://github.com/appium/appium-xcuitest-driver/commit/cc4ccdd606dcf758d770c424a174e3545ef1170e))

## [4.30.9](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.8...v4.30.9) (2023-06-09)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v5.3.2 ([#1737](https://github.com/appium/appium-xcuitest-driver/issues/1737)) ([77b61c6](https://github.com/appium/appium-xcuitest-driver/commit/77b61c60fbc1987abfaf61d170c8182a1396279a))

## [4.30.8](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.7...v4.30.8) (2023-06-09)


### Bug Fixes

* **deps:** update dependency appium-ios-simulator to v5.0.9 ([#1735](https://github.com/appium/appium-xcuitest-driver/issues/1735)) ([d6960ba](https://github.com/appium/appium-xcuitest-driver/commit/d6960ba5c3f0ce91aca4168abb59a03db990ba6a))

## [4.30.7](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.6...v4.30.7) (2023-06-08)


### Bug Fixes

* **deps:** update dependency appium-idb to v1.6.12 ([#1733](https://github.com/appium/appium-xcuitest-driver/issues/1733)) ([aa50371](https://github.com/appium/appium-xcuitest-driver/commit/aa50371fc17636e1b1cf0091fd13ebc74e88abb9))
* **deps:** update dependency appium-remote-debugger to v9.1.16 ([#1736](https://github.com/appium/appium-xcuitest-driver/issues/1736)) ([2657995](https://github.com/appium/appium-xcuitest-driver/commit/265799597fbe538e265f35e2729e1334c20f778b))
* **deps:** update dependency appium-xcode to v5.1.2 ([#1738](https://github.com/appium/appium-xcuitest-driver/issues/1738)) ([e315219](https://github.com/appium/appium-xcuitest-driver/commit/e315219cf29838fe8d8855d22ce4ba4a4449c3ba))

## [4.30.6](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.5...v4.30.6) (2023-06-08)


### Bug Fixes

* **deps:** update dependency appium-ios-device to v2.5.3 ([2ea3183](https://github.com/appium/appium-xcuitest-driver/commit/2ea31830fa7afca3f7d3f2953702f5d3f92946ca))

## [4.30.5](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.4...v4.30.5) (2023-06-06)


### Bug Fixes

* Support network devices with py-ios-device + add missing method map ([#1727](https://github.com/appium/appium-xcuitest-driver/issues/1727)) ([c81c606](https://github.com/appium/appium-xcuitest-driver/commit/c81c606a95274494dba4f27b9895f7192ddce3cc))

## [4.30.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.3...v4.30.4) (2023-06-06)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v5.3.1 for Xcode 15 build ([#1729](https://github.com/appium/appium-xcuitest-driver/issues/1729)) ([629b971](https://github.com/appium/appium-xcuitest-driver/commit/629b9710d6e0d4fff86e4452630d80742911e7e5))

## [4.30.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.2...v4.30.3) (2023-06-03)


### Bug Fixes

* Align initial atom wait timeout with alerts check interval ([#1720](https://github.com/appium/appium-xcuitest-driver/issues/1720)) ([8177e4b](https://github.com/appium/appium-xcuitest-driver/commit/8177e4b06b36261eac551e1174f13859d66cf2c3))

## [4.30.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.1...v4.30.2) (2023-05-31)


### Bug Fixes

* **deps:** update dependency @xmldom/xmldom to v0.8.8 ([ae453ca](https://github.com/appium/appium-xcuitest-driver/commit/ae453cad884d4956c08f27781bf9c0eee9cd97c0))

## [4.30.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.30.0...v4.30.1) (2023-05-26)


### Bug Fixes

* tune usePreinstalledWDA to behave as similar to webDriverAgentUrl ([#1709](https://github.com/appium/appium-xcuitest-driver/issues/1709)) ([cb84925](https://github.com/appium/appium-xcuitest-driver/commit/cb8492538867374f9da5afc50f854d4624c1347a))

## [4.30.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.6...v4.30.0) (2023-05-26)


### Features

* otherApps for real devices ([#1700](https://github.com/appium/appium-xcuitest-driver/issues/1700)) ([ad2db26](https://github.com/appium/appium-xcuitest-driver/commit/ad2db267dbbefa4dadede302930360f375c0bd88))

## [4.29.6](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.5...v4.29.6) (2023-05-25)


### Bug Fixes

* **deps:** update dependency appium-remote-debugger to v9.1.15 ([f8d8213](https://github.com/appium/appium-xcuitest-driver/commit/f8d82132106442df25a513f2b1d133ce58e22e67))

## [4.29.5](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.4...v4.29.5) (2023-05-24)


### Bug Fixes

* **deps:** update dependency appium-ios-simulator to v5.0.8 ([#1695](https://github.com/appium/appium-xcuitest-driver/issues/1695)) ([ed448e6](https://github.com/appium/appium-xcuitest-driver/commit/ed448e60813e6d295bbe01d801eebf2ed8291fc1))
* **deps:** update dependency appium-xcode to v5.1.1 ([#1697](https://github.com/appium/appium-xcuitest-driver/issues/1697)) ([db78d3f](https://github.com/appium/appium-xcuitest-driver/commit/db78d3f8ffc2be45db303087d444355a0cbfb7e0))

## [4.29.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.3...v4.29.4) (2023-05-23)


### Bug Fixes

* **deps:** update dependency appium-idb to v1.6.11 ([#1691](https://github.com/appium/appium-xcuitest-driver/issues/1691)) ([3c5b125](https://github.com/appium/appium-xcuitest-driver/commit/3c5b125504f822f1fe7af2b06c90a98230216f0e))

## [4.29.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.2...v4.29.3) (2023-05-22)


### Bug Fixes

* **deps:** update dependency appium-ios-device to v2.5.2 ([#1692](https://github.com/appium/appium-xcuitest-driver/issues/1692)) ([80cb9b1](https://github.com/appium/appium-xcuitest-driver/commit/80cb9b14f79db67a9ff32c3319f622ddcd3b2f05))

## [4.29.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.1...v4.29.2) (2023-05-16)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v5.1.4 ([#1682](https://github.com/appium/appium-xcuitest-driver/issues/1682)) ([28026cf](https://github.com/appium/appium-xcuitest-driver/commit/28026cf6ec29e64c79c0efc75f5f0be603e70693))

## [4.29.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.29.0...v4.29.1) (2023-05-16)


### Bug Fixes

* Make terminateApp to return a boolean ([2481656](https://github.com/appium/appium-xcuitest-driver/commit/24816564af418843ed9f23f59c6128be86cee4a7))

## [4.29.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.28.0...v4.29.0) (2023-05-15)


### Features

* update docs and args for more execute methods ([5c4bd32](https://github.com/appium/appium-xcuitest-driver/commit/5c4bd3272701f191d5f1abd104deab31ed6b3595))


### Bug Fixes

* **deps:** appium upgrades ([70c13dc](https://github.com/appium/appium-xcuitest-driver/commit/70c13dc779c2423c3d726aa1dbf7fcedd496ca82))
* **execute-methods:** begin migration of docstrings to sources ([316c012](https://github.com/appium/appium-xcuitest-driver/commit/316c012fad7d9b3306cbbe767195b351f60aa26d))

## [4.28.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.27.2...v4.28.0) (2023-05-14)


### Features

* Bump WDA ([#1680](https://github.com/appium/appium-xcuitest-driver/issues/1680)) ([2c07021](https://github.com/appium/appium-xcuitest-driver/commit/2c07021753b6c9b3c62639c79bcd769b17329c5c))

## [4.27.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.27.1...v4.27.2) (2023-05-13)


### Bug Fixes

* **deps:** update dependency semver to v7.5.1 ([27a0a0e](https://github.com/appium/appium-xcuitest-driver/commit/27a0a0e2eb86e272eddf6c385a950a3e44b95d02))

## [4.27.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.27.0...v4.27.1) (2023-05-12)


### Bug Fixes

* Update package lock ([4836490](https://github.com/appium/appium-xcuitest-driver/commit/4836490a84a05a127040bf882c37f87fc75118ca))

## [4.27.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.26.0...v4.27.0) (2023-05-11)


### Features

* install prebuilt WDA as prebuiltWDAPath capability ([#1672](https://github.com/appium/appium-xcuitest-driver/issues/1672)) ([2226123](https://github.com/appium/appium-xcuitest-driver/commit/22261233114788663750713c1cbea65d25d2b525))

## [4.26.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.25.4...v4.26.0) (2023-05-06)


### Features

* launch preinstalled WDA process without xcodebuild for a real device with usePreinstalledWDA ([#1609](https://github.com/appium/appium-xcuitest-driver/issues/1609)) ([3c72b58](https://github.com/appium/appium-xcuitest-driver/commit/3c72b58e12eea6d331b3b4e86cd3546954f5111f))

## [4.25.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.25.3...v4.25.4) (2023-05-06)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v4.15.1 ([#1667](https://github.com/appium/appium-xcuitest-driver/issues/1667)) ([008d7ef](https://github.com/appium/appium-xcuitest-driver/commit/008d7efda992be1b5dcc42391cf6b3c07b6f68ae))

## [4.25.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.25.2...v4.25.3) (2023-05-04)


### Bug Fixes

* **deps:** update dependency node-simctl to v7.1.15 ([41ce19a](https://github.com/appium/appium-xcuitest-driver/commit/41ce19aca7c80c14285da6d4e6a053488fe295bf))

## [4.25.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.25.1...v4.25.2) (2023-05-02)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v4.14.0 ([bbca5a7](https://github.com/appium/appium-xcuitest-driver/commit/bbca5a731f353263bf1c2450ab6ce9319b9284f8))


### Code Refactoring

* Replace pngjs with sharp ([#1653](https://github.com/appium/appium-xcuitest-driver/issues/1653)) ([73c2654](https://github.com/appium/appium-xcuitest-driver/commit/73c26546a0735f6a8da6da763efbed02d5490488))

## [4.25.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.25.0...v4.25.1) (2023-04-29)


### Bug Fixes

* **deps:** update dependency appium-webdriveragent to v4.13.2 ([531c8f4](https://github.com/appium/appium-xcuitest-driver/commit/531c8f43c9522372a86db23b20d29e5476020f3e))

## [4.25.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.24.3...v4.25.0) (2023-04-26)


### Features

* Add mobile wrapper for backgroundApp ([#1637](https://github.com/appium/appium-xcuitest-driver/issues/1637)) ([04397cf](https://github.com/appium/appium-xcuitest-driver/commit/04397cf5df6f40a9f32f3c5dab7f278f3fc1d9f0))

## [4.24.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.24.2...v4.24.3) (2023-04-22)


### Bug Fixes

* **deps:** update dependency semver to v7.5.0 ([c5e21dc](https://github.com/appium/appium-xcuitest-driver/commit/c5e21dc7e18d734a8c7b9bc48cbe2bb5f00dbf64))

## [4.24.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.24.1...v4.24.2) (2023-04-21)


### Bug Fixes

* make whitespace in execute methods insignificant ([#1628](https://github.com/appium/appium-xcuitest-driver/issues/1628)) ([1dc7777](https://github.com/appium/appium-xcuitest-driver/commit/1dc7777cc6c3cd23f75085967d193562b63e6562))

## [4.24.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.24.0...v4.24.1) (2023-04-20)


### Bug Fixes

* Add missing return to removeApp API ([#1623](https://github.com/appium/appium-xcuitest-driver/issues/1623)) ([af2db2e](https://github.com/appium/appium-xcuitest-driver/commit/af2db2e8a7694887f9f16da34d4d66c4f96ec8a5))

## [4.24.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.23.2...v4.24.0) (2023-04-19)


### Features

* Add mobile wrappers to lock/unlock the device ([#1624](https://github.com/appium/appium-xcuitest-driver/issues/1624)) ([eca9530](https://github.com/appium/appium-xcuitest-driver/commit/eca9530fb6f3aac049bf407a8433b71ed8664e76))

## [4.23.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.23.1...v4.23.2) (2023-04-19)


### Bug Fixes

* apply correct params to enableConditionInducer ([09c97b2](https://github.com/appium/appium-xcuitest-driver/commit/09c97b237b381398a7505bd094fb329ee847ea9a))

## [4.23.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.23.0...v4.23.1) (2023-04-18)


### Bug Fixes

* **command:** flip args for mobile: getPermission ([de44162](https://github.com/appium/appium-xcuitest-driver/commit/de44162820d28531faf631758916e9a704becf6b))


### Code Refactoring

* getCookies and deleteCookies ([#1538](https://github.com/appium/appium-xcuitest-driver/issues/1538)) ([14e70b7](https://github.com/appium/appium-xcuitest-driver/commit/14e70b716775207804b4e40bd5b5c82dba6eacca))

## [4.23.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.22.0...v4.23.0) (2023-04-18)


### Features

* Add 'mobile: hideKeyboard' and 'mobile: isKeyboardShown' extensions ([#1618](https://github.com/appium/appium-xcuitest-driver/issues/1618)) ([0050e5f](https://github.com/appium/appium-xcuitest-driver/commit/0050e5f66abc0558e0294ecc0267a279af6f5b8d))

## [4.22.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.35...v4.22.0) (2023-04-17)


### Features

* Add `mobile: getAppStrings` extension ([#1608](https://github.com/appium/appium-xcuitest-driver/issues/1608)) ([5445ebb](https://github.com/appium/appium-xcuitest-driver/commit/5445ebbab95da3874eb6f27e974c8a8a6828f914))

## [4.21.35](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.34...v4.21.35) (2023-04-16)


### Bug Fixes

* **deps:** update dependency appium-ios-device to v2.5.0 ([b208ce3](https://github.com/appium/appium-xcuitest-driver/commit/b208ce3d8ca26c13247c7a2a090ebf596615b296))

## [4.21.34](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.33...v4.21.34) (2023-04-16)


### Bug Fixes

* **deps:** update dependency semver to v7.4.0 ([cdecf15](https://github.com/appium/appium-xcuitest-driver/commit/cdecf150a8a33f5c741936d3bc042b52a9405b70))

## [4.21.33](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.32...v4.21.33) (2023-04-14)


### Bug Fixes

* Fix the return type of mobile: removeCertificate extension ([10cfce1](https://github.com/appium/appium-xcuitest-driver/commit/10cfce1308a22e47e823bbbe6affc116a743817b))

## [4.21.32](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.31...v4.21.32) (2023-04-14)


### Bug Fixes

* **commands:** fix "mobile: startPcap" execute method ([a761365](https://github.com/appium/appium-xcuitest-driver/commit/a761365a66506d9e15f6977ee41cf161f987cc04))
* **commands:** fix startAudioRecording and stopAudioRecording execute methods ([990547a](https://github.com/appium/appium-xcuitest-driver/commit/990547a9b671243b298c6318af1327f2e15315fa))

## [4.21.31](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.30...v4.21.31) (2023-04-13)


### Miscellaneous Chores

* **workflows:** update actions/checkout digest to 83b7061 ([5212653](https://github.com/appium/appium-xcuitest-driver/commit/5212653638ce2ccfb6cbb82fb1f8094551a56e09))

## [4.21.30](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.29...v4.21.30) (2023-04-13)


### Miscellaneous Chores

* **deps:** update dependency @appium/tsconfig to v0.3.0 ([ef1d08b](https://github.com/appium/appium-xcuitest-driver/commit/ef1d08be2b05c55691ac91600ab233da12bef22c))

## [4.21.29](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.28...v4.21.29) (2023-04-12)


### Miscellaneous Chores

* **deps:** update dependency webdriverio to v8.8.1 ([827ff21](https://github.com/appium/appium-xcuitest-driver/commit/827ff21f75f14c50121edc72b80e83022611be82))

## [4.21.28](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.27...v4.21.28) (2023-04-12)


### Bug Fixes

* **deps:** update dependency appium-xcode to v5.1.0 ([6f05ef2](https://github.com/appium/appium-xcuitest-driver/commit/6f05ef259a917bcb3c7653af733d1f28ebf13bdc))

## [4.21.27](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.26...v4.21.27) (2023-04-11)


### Bug Fixes

* add correct types for context objects ([928ffcc](https://github.com/appium/appium-xcuitest-driver/commit/928ffccfaca376fe875a0be5a5cb6e2f6b1cff87))
* lint, test fixes ([47a8174](https://github.com/appium/appium-xcuitest-driver/commit/47a81743a69de33922f58df2399736c2fbb9c2bb))
* **types:** fix mostly test types ([f1ec6d5](https://github.com/appium/appium-xcuitest-driver/commit/f1ec6d5e0b66fd41e6e9b93e9e409d725207424a))
* **web:** do not return `true` from deleteCookie() ([5dd66d5](https://github.com/appium/appium-xcuitest-driver/commit/5dd66d54e346dbf671e5c72a4bb84c4d03243eed))
* **xctest:** mobileRunXCTest param "args" is optional ([438671f](https://github.com/appium/appium-xcuitest-driver/commit/438671ff1a3501fb6265308c83344dcd9d3545e7))


### Miscellaneous Chores

* re-enable require-await rule ([1b8b533](https://github.com/appium/appium-xcuitest-driver/commit/1b8b533387e0acf9a4881871cd0be3411841a6f4))
* use execute methods & types ([f6f77d2](https://github.com/appium/appium-xcuitest-driver/commit/f6f77d2bd518c5ce625dd833748817e53f37b854))

## [4.21.26](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.25...v4.21.26) (2023-04-11)


### Miscellaneous Chores

* **deps:** update appium-related packages ([70b85b2](https://github.com/appium/appium-xcuitest-driver/commit/70b85b24135a7aa585818f5bb4b795ea9322d93e))
* **deps:** update dependency appium to v2.0.0-beta.62 ([ed37de3](https://github.com/appium/appium-xcuitest-driver/commit/ed37de3c74ed144656aa000ffbec783321f38c6a))

## [4.21.25](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.24...v4.21.25) (2023-04-11)


### Bug Fixes

* **deps:** update dependency lru-cache to v7.18.3 ([d6a2c3c](https://github.com/appium/appium-xcuitest-driver/commit/d6a2c3ca04bdccf6cf3308543fdd0f5316848066))


### Miscellaneous Chores

* **deps:** update dependency webdriverio to v8.7.0 ([dfc7b01](https://github.com/appium/appium-xcuitest-driver/commit/dfc7b01ad55384680d23172d3b741c0a80b63b29))

## [4.21.24](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.23...v4.21.24) (2023-04-10)


### Miscellaneous Chores

* **deps:** update dependency glob to v9.3.5 ([4105b6d](https://github.com/appium/appium-xcuitest-driver/commit/4105b6dfb597cb9fec7e3ed43f007f2e42acfa0d))

## [4.21.23](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.22...v4.21.23) (2023-04-10)


### Miscellaneous Chores

* **deps:** update dependency type-fest to v3.8.0 ([6327db2](https://github.com/appium/appium-xcuitest-driver/commit/6327db2bbb1550119896598427d85487086b7c0a))

## [4.21.22](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.21...v4.21.22) (2023-04-10)


### Miscellaneous Chores

* **deps:** update dependency eslint to v8.38.0 ([39ebc7d](https://github.com/appium/appium-xcuitest-driver/commit/39ebc7d2fe939f36facb37ad87fa9bc194d146c3))

## [4.21.21](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.20...v4.21.21) (2023-04-09)


### Bug Fixes

* **deps:** update dependency moment-timezone to v0.5.43 ([a9d57da](https://github.com/appium/appium-xcuitest-driver/commit/a9d57da88e8a45e9236ef35cc3e5f31e8016064b))

## [4.21.20](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.19...v4.21.20) (2023-04-09)


### Bug Fixes

* **deps:** update dependency appium-ios-device to v2.4.12 ([ddd20d8](https://github.com/appium/appium-xcuitest-driver/commit/ddd20d8ce7995b851e7526baeb16b5a94ac262bb))

## [4.21.19](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.18...v4.21.19) (2023-04-09)


### Bug Fixes

* **deps:** update dependency @xmldom/xmldom to v0.8.7 ([0c94161](https://github.com/appium/appium-xcuitest-driver/commit/0c94161368d177112d30e910e725c8cd30716742))

## [4.21.18](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.17...v4.21.18) (2023-04-09)


### Miscellaneous Chores

* **deps:** update eslint-related packages ([9e60d30](https://github.com/appium/appium-xcuitest-driver/commit/9e60d30489edf9bf2eda0ea180c77edfec3d2ed3))

## [4.21.17](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.16...v4.21.17) (2023-04-08)


### Miscellaneous Chores

* **deps:** update dependency semantic-release to v20.1.3 ([ef8056a](https://github.com/appium/appium-xcuitest-driver/commit/ef8056ada3da522c6b4f1e93b69e527a1fe4143d))

## [4.21.16](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.15...v4.21.16) (2023-04-08)


### Miscellaneous Chores

* **deps:** update dependency lint-staged to v13.2.1 ([d93296a](https://github.com/appium/appium-xcuitest-driver/commit/d93296a53d59eefe7397ab39893fe1f40b506b4b))

## [4.21.15](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.14...v4.21.15) (2023-04-08)


### Miscellaneous Chores

* **deps:** update dependency pem to v1.14.7 ([30618c9](https://github.com/appium/appium-xcuitest-driver/commit/30618c9ef5f61e3fd75bac88c31c7862e251f86c))

## [4.21.14](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.13...v4.21.14) (2023-04-07)


### Miscellaneous Chores

* **ci:** fix docs workflow ([102cd39](https://github.com/appium/appium-xcuitest-driver/commit/102cd39cf03bda25522e3e6a83104b71f8466a37))
* **ci:** remove dependabot config ([7c81e33](https://github.com/appium/appium-xcuitest-driver/commit/7c81e33d6c44b4edffe6494fc504d0a68c536ed8))
* update .gitattributes ([c71c043](https://github.com/appium/appium-xcuitest-driver/commit/c71c0432fbed74140102e0d97f5a321fae766acc))
* **workflows:** pin dependencies ([9d82149](https://github.com/appium/appium-xcuitest-driver/commit/9d8214962b5bb5469bc0f0ebd971b4bd9fa59189))

## [4.21.13](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.12...v4.21.13) (2023-04-07)


### Miscellaneous Chores

* **deps:** update dependency glob to v9.3.4 ([6da88cb](https://github.com/appium/appium-xcuitest-driver/commit/6da88cb519abe986f0bca09babdc3ca6f7645243))

## [4.21.12](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.11...v4.21.12) (2023-04-07)


### Miscellaneous Chores

* **deps:** update appium-related packages ([108cd56](https://github.com/appium/appium-xcuitest-driver/commit/108cd569a502f868c550748bb5db91188fb17e65))

## [4.21.11](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.10...v4.21.11) (2023-04-06)


### Miscellaneous Chores

* **ci:** attempt to get docs preview working ([8b0f34f](https://github.com/appium/appium-xcuitest-driver/commit/8b0f34fb8d2ae810db22fea7741935cee0d69c29))

## [4.21.10](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.9...v4.21.10) (2023-04-06)


### Miscellaneous Chores

* **deps:** update dependency axios to v1.3.5 ([38c1b04](https://github.com/appium/appium-xcuitest-driver/commit/38c1b0479426bb14f95022e1c43c98c4a9ed8629))

## [4.21.9](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.8...v4.21.9) (2023-04-06)


### Miscellaneous Chores

* **deps:** update dependency appium to v2.0.0-beta.61 ([9eb21a0](https://github.com/appium/appium-xcuitest-driver/commit/9eb21a06d2d9add933392947060c0868cc580d8d))

## [4.21.8](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.7...v4.21.8) (2023-04-05)


### Miscellaneous Chores

* add wallaby config ([0e42a45](https://github.com/appium/appium-xcuitest-driver/commit/0e42a45c623d33024f212d0437431e4cf77c48b7))
* pin all deps ([f0a54e5](https://github.com/appium/appium-xcuitest-driver/commit/f0a54e5a3f1e151084d23ae2f1bf2f3ac00f0f99))
* update GHA workflows to use "npm ci" ([b9083fc](https://github.com/appium/appium-xcuitest-driver/commit/b9083fc34dc3d45176ec67dc5c590b9dc6996046))
* update lint-staged config ([bb1af17](https://github.com/appium/appium-xcuitest-driver/commit/bb1af1793d7aa8400c67ca708e636b6c619abcf0))
* **utils:** lint ([039c3c0](https://github.com/appium/appium-xcuitest-driver/commit/039c3c083cdcb68d99b80585c2bb77836711fa0d))

## [4.21.7](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.6...v4.21.7) (2023-04-04)


### Miscellaneous Chores

* Bump WDA ([4c1b22d](https://github.com/appium/appium-xcuitest-driver/commit/4c1b22db30b154eddef889f59aa13a339a091149))

## [4.21.6](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.5...v4.21.6) (2023-04-03)


### Miscellaneous Chores

* **test:** clean up unit test ([794e09a](https://github.com/appium/appium-xcuitest-driver/commit/794e09ac6d25b486d1d2954ab2403192ee94c816))

## [4.21.5](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.4...v4.21.5) (2023-04-03)


### Bug Fixes

* revert "chore: Bump get-port from 5.1.1 to 6.1.2 ([#1535](https://github.com/appium/appium-xcuitest-driver/issues/1535))" ([4d6303e](https://github.com/appium/appium-xcuitest-driver/commit/4d6303ef7f9173485d0a8d3bb8ede1f18b625331))

## [4.21.4](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.3...v4.21.4) (2023-04-01)


### Miscellaneous Chores

* Bump get-port from 5.1.1 to 6.1.2 ([#1535](https://github.com/appium/appium-xcuitest-driver/issues/1535)) ([ff96d7c](https://github.com/appium/appium-xcuitest-driver/commit/ff96d7cfa209783f58fc053602b7e37889c6241f))
* Bump rimraf from 3.0.2 to 4.4.1 ([#1536](https://github.com/appium/appium-xcuitest-driver/issues/1536)) ([8dd4515](https://github.com/appium/appium-xcuitest-driver/commit/8dd4515a3f10a090cd49881217fb98903339a786))

## [4.21.3](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.2...v4.21.3) (2023-04-01)


### Bug Fixes

* cookies regression: send Page commands for cookies handling ([#1534](https://github.com/appium/appium-xcuitest-driver/issues/1534)) ([908ed1a](https://github.com/appium/appium-xcuitest-driver/commit/908ed1a6d64e4522d95502e125bde32032a3e686))

## [4.21.2](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.1...v4.21.2) (2023-03-31)


### Bug Fixes

* launchApp regression ([#1540](https://github.com/appium/appium-xcuitest-driver/issues/1540)) ([a66cb47](https://github.com/appium/appium-xcuitest-driver/commit/a66cb47f83ea9dd1ec70f227281957cd932cd037))

## [4.21.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.21.0...v4.21.1) (2023-03-29)


### Miscellaneous Chores

* **test:** fix a bunch of assertions ([a733d71](https://github.com/appium/appium-xcuitest-driver/commit/a733d7139050aca887766da81b5bba93f3f07f4c))

## [4.21.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.20.1...v4.21.0) (2023-03-29)


### Features

* build docs with typedoc ([ab354a5](https://github.com/appium/appium-xcuitest-driver/commit/ab354a57d8677b639949959f8a7112cb11cd9848))
* refactor to support automatic command docs ([9b9e6fa](https://github.com/appium/appium-xcuitest-driver/commit/9b9e6fa860425f3ed2a9130d088889c05e3e10a9))


### Bug Fixes

* **driver:** use correct method name ([45330bb](https://github.com/appium/appium-xcuitest-driver/commit/45330bbbdc8b1d28a3dd43ba8628e80a9f278160))
* **execute:** better validation of "mobile commands" ([0b9b9cb](https://github.com/appium/appium-xcuitest-driver/commit/0b9b9cb697d3c18e1d65a122ac5029ad6452c916))


### Miscellaneous Chores

* add wallaby config ([1915292](https://github.com/appium/appium-xcuitest-driver/commit/1915292b830d8f60a98af1b211f83d3982bfba7b))
* fixup ([4fb1e8a](https://github.com/appium/appium-xcuitest-driver/commit/4fb1e8a1d31f807c92550f0677bf4e36fefd9076))
* rename method installXCTestBundle => mobileInstallXCTestBundle for consistency ([11349cb](https://github.com/appium/appium-xcuitest-driver/commit/11349cb52bea66ee4b2d7f48aa81d8891e69641d))
* rename runXCTest => mobileRunXCTest ([621ef8c](https://github.com/appium/appium-xcuitest-driver/commit/621ef8c6020c67bbc95bb7a44bbdf8a32a1a61e2))
* try to skip problem tests ([3cfea5d](https://github.com/appium/appium-xcuitest-driver/commit/3cfea5d72984035c6ee84a06b019c4151017e34f))
* upgrade appium ([fb6ed96](https://github.com/appium/appium-xcuitest-driver/commit/fb6ed9664246e63b8a49c35f2ab8a3231627bfd9))
* use random port for phony https server ([382d296](https://github.com/appium/appium-xcuitest-driver/commit/382d2966d5043fe93e3646f88e7b0416f6e4d6f3))

## [4.20.1](https://github.com/appium/appium-xcuitest-driver/compare/v4.20.0...v4.20.1) (2023-03-29)


### Bug Fixes

* Add missing --name option to removeProfile ([#1530](https://github.com/appium/appium-xcuitest-driver/issues/1530)) ([a930762](https://github.com/appium/appium-xcuitest-driver/commit/a930762933a7008caab4fe1549e64e4d340b6ede))

## [4.20.0](https://github.com/appium/appium-xcuitest-driver/compare/v4.19.1...v4.20.0) (2023-03-28)


### Features

* Add command for mobileRemoveCertificate for real devices ([#1529](https://github.com/appium/appium-xcuitest-driver/issues/1529)) ([2255f31](https://github.com/appium/appium-xcuitest-driver/commit/2255f3129d952c804dde3c1328aaacceb1e7df79))

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
