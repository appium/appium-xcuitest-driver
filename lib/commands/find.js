import _ from 'lodash';
import { errors } from 'appium-base-driver';


let helpers = {}, commands = {}, extensions = {};

helpers.findElOrEls = async function (strategy, selector, mult, context) {
  if (this.isWebview()) {
    return await this.findWebElementOrElements(strategy, selector, mult, context);
  }

  if (strategy === '-ios predicate string') {
    // WebDriverAgent uses 'predicate string'
    strategy = 'predicate string';
  }

  let endpoint;
  /* jshint ignore:start */
  endpoint = `/element${context ? `/${context}/element` : ''}${mult ? 's' : ''}`;
  /* jshint ignore:end */

  let body = {
    using: strategy,
    value: selector
  };

  let method = 'POST';

  let els;
  try {
    await this.implicitWaitForCondition(async () => {
      try {
        els = await this.proxyCommand(endpoint, method, body);
        if (mult) {
          // we succeed if we get some elements
          return els && els.length;
        } else {
          // we may not get any status, which means success
          return !els.status || els.status === 0;
        }
      } catch (err) {
        els = undefined;
        return false;
      }
    });
  } catch (err) {
    if (err.message && err.message.match(/Condition unmet/)){
      // condition was not met setting res to empty array
      els = [];
    } else {
      throw err;
    }
  }
  if (mult) {
    return els;
  } else {
    if (!els || _.size(els) === 0) {
      throw new errors.NoSuchElementError();
    }
    return els;
  }
};


Object.assign(extensions, commands, helpers);
export { commands, helpers};
export default extensions;
