appium-xcuitest-driver
===================

This project has git submodules!

Clone with the `git clone --recursive` flag. Or, after cloning normally run `git submodule init` and then `git submodule update`

The `git diff --submodule` flag is useful here. It can also be set as the default `diff` format: `git config --global diff.submodule log`

`git config status.submodulesummary 1` is also useful.

## Sim Resetting

By default, this driver will create a new iOS simulator and run tests on it, deleting the simulator afterward.

If you specify a specific simulator using the `udid` capability, this driver will boot the specified simulator and shut it down afterwards.

If a udid is provided and the simulator is already running, this driver will leave it running after the test run.

In short, this driver tries to leave things as it found them.

You can use the `noReset` capability to adjust this behavior.
Setting `noReset` to `true` will leave the simulator running at the end of a test session.

## Usage

Desired Capabilities:

Should be the same for [Appium](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/caps.md)

Differences noted here

|Capability|Description|Values|
|----------|-----------|------|
|`noReset`|Do not destroy or shut down sim after test. Start tests running on whichever sim is running, or device is plugged in. Default `false`|`true`, `false`|
|`processArguments`|This should be passed as object like this let proArgs = { args: ["a", "b", "c"] , env: { "a": "b", "c": "d" } }; or as JSON string like this let proArgsString = "{\"args\": [\"a\", \"b\", \"c\"], \"env\": { \"a\": \"b\", \"c\": \"d\" }}";|proArgs = { args: [], env: { } }; or proArgsString = "{\"args\": [], \"env\": {  }}";|

## Watch

```
npm run watch
```

## Test

```
npm test
```

## WebDriverAgent Updating

Updating FabeBooks' [WebDriverAgent](https://github.com/facebook/WebDriverAgent)
is as simple as pulling into Appium's [fork](https://github.com/appium/WebDriverAgent),
merging, and pushing. Then, in this repository update the submodule.

There is a chance that the update changed something critical, which will manifest
itself as `xcodebuild` throwing errors. The easiest remedy is to delete the
files, which are somewhere like `/Users/isaac/Library/Developer/Xcode/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll`.
