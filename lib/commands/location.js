import { exec } from 'teen_process';
import { fs, util } from 'appium-support';
import log from '../logger';
import _ from 'lodash';

const IDEVICELOCATION = 'idevicelocation';
const MINUS_MARKER = '--';

let commands = {};

function formatLocationArg (value) {
  value = `${value}`.trim();
  // Negative coordinate values should be properly formatted
  return value.startsWith('-') ? [MINUS_MARKER, value] : [value];
}

commands.setGeoLocation = async function (location) {
  let {latitude, longitude} = location;

  if (!util.hasValue(latitude) || !util.hasValue(longitude)) {
    log.errorAndThrow(`Both latitude and longitude should be set`);
  }

  if (this.isSimulator()) {
    await this.opts.device.setGeolocation(`${latitude}`, `${longitude}`);
    return;
  }

  try {
    await fs.which(IDEVICELOCATION);
  } catch (e) {
    log.errorAndThrow(`${IDEVICELOCATION} doesn't exist on the host. ` +
                      'Check https://github.com/JonGabilondoAngulo/idevicelocation on how to install the tool.');
  }
  let args = [];
  args.push(...formatLocationArg(latitude));
  args.push(...formatLocationArg(longitude));
  if (args.includes(MINUS_MARKER) && _.countBy(args)[MINUS_MARKER] > 1) {
    // Move -- marker at the start of the args array if there is more than one occurrence
    args = [MINUS_MARKER, ...(_.without(args, MINUS_MARKER))];
  }
  args = ['-u', this.opts.udid, ...args];
  log.debug(`Executing ${IDEVICELOCATION} with args ${JSON.stringify(args)}`);
  try {
    await exec(IDEVICELOCATION, args);
  } catch (e) {
    log.errorAndThrow(`Can't set the location on device '${this.opts.udid}'. Original error: ${e.message}`);
  }
};

export { commands };
export default commands;
