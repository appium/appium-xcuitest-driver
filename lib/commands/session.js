import log from '../logger';


let commands = {};

/**
 * Get session capabilities merged with what WDA reports
 */
commands.getSession = async function () {
  let wdaCaps = await this.proxyCommand('/', 'GET');
  log.info("Merging WDA caps over Appium caps for session detail response");
  return Object.assign({udid: this.opts.udid}, this.caps, wdaCaps.capabilities);
};

export { commands };
export default commands;
