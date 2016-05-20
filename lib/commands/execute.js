import _ from 'lodash';
import { util } from 'appium-support';
import { errors } from 'appium-base-driver';

let commands = {}, extensions = {};

commands.execute = async function (script, args) {
  if (script.match(/^mobile\:/)) {
    script = script.replace(/^mobile\:/, '').trim();
    return await this.executeMobile(script, _.isArray(args) ? args[0] : args);
  } else {
    throw new errors.UnknownCommandError('Unkown Command. Only "mobile: <command>" commands available');
  }
};

commands.executeMobile = async function (mobileCommand, opts={}) {
  // we only support mobile: scroll
  if (mobileCommand === 'scroll') {
    await this.mobileScroll(opts);
  } else {
    throw new errors.UnknownCommandError('Unknown command, all the mobile commands except scroll have been removed.');
  }
};

Object.assign(extensions, commands);
export { commands };
export default extensions;
