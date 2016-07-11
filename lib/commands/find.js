import _ from 'lodash';
import { errors } from 'appium-base-driver';


let helpers = {}, commands = {}, extensions = {};

commands.findElement = async function (cmd, ...args) {
  return await this.findElOrEls(cmd, '/element', _.isArray(args) ? args[0] : args, false);
};

commands.findElements = async function (cmd, ...args) {
  return await this.findElOrEls(cmd, '/elements', _.isArray(args) ? args[0] : args, true);
};

commands.findElementFromElement = async function (cmd, ...args) {
  return await this.findElOrEls(cmd, '/element/' + args[1] +'/element', _.isArray(args) ? args[0] : args, false);
};

commands.findElementsFromElement = async function (cmd, ...args) {
  return await this.findElOrEls(cmd, '/element/' + args[1] +'/elements', _.isArray(args) ? args[0] : args, true);
};

helpers.findElOrEls = async function (cmd, endpoint, value, mult) {
  if (cmd === '-ios predicate string') {
    // WebDriverAgent uses 'predicate string'
    cmd = 'predicate string';
  }

  let body = {
    using: cmd,
    value
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
