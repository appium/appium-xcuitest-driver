import _ from 'lodash';
import { desiredCapConstraints as iosDesiredCapConstraints } from 'appium-ios-driver';


let desiredCapConstraints = _.defaults({
  showXcodeLog: {
    isBoolean: true
  },
  realDeviceLogger: {
    isString: true
  },
  wdaLocalPort: {
    isNumber: true
  },
  iosInstallPause: {
    isNumber: true
  },
  xcodeConfigFile: {
    isString: true
  },
}, iosDesiredCapConstraints);

export { desiredCapConstraints };
export default desiredCapConstraints;
