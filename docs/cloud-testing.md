# Cloud Testing

With a little bit of configuration, the E2E tests can be run on SauceLabs Real Device Cloud and on Simulators.

## Environment Variables
* Running tests on Sauce Real Device Cloud (RDC) or Sauce OnDemand Simulators requires a SauceLabs username and access key. 

### Real Device Cloud
* Refer to [real env file](/test/env/env-ios-real.js) to see which environment variables need to be set to access the RDC Cloud
* To run tests locally, must set two environment variables   
  * `CLOUD_PLATFORM_VERSION` A supported [iOS version](https://saucelabs.com/devices). No need to set PLATFORM_VERSION. A device will be dynamically allocated
  * `SAUCE_RDC` Needs to be set to `true`

### Simulator Cloud
* Refer to [sim env file](/test/env/env-ios-real.js) to see which environment variables need to be set for SauceLabs OnDemand Simulator testing
* To run tests locally, must set three environment variables
  * `CLOUD_PLATFORM_VERSION` A supported [iOS version](https://saucelabs.com/platforms)
  * `CLOUD_DEVICE_NAME` A supported [iOS device](https://saucelabs.com/platforms) that corresponds to that OS version
  * `SAUCE_EMUSIM` Needs to be set to true

## Running the Tests
Run the tests with the following command:

```gulp transpile && mocha mocha  --require build/test/env/env --timeout 4000000 --recursive build/<TEST_PATH>```

