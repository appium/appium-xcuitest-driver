import { exec } from 'teen_process';
import { fs, util } from 'appium-support';
import log from '../logger';

const IDEVICELOCATION = 'idevicelocation';

let commands = {};

function formatLocationArg (value) {
  value = `${value}`.trim();
  // Negative coordinate values should be properly formatted
  if (value.startsWith('-')) {
    return ['--', value];
  }
  return [value];
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
  const args = ['-u', this.opts.udid];
  args.push(...formatLocationArg(latitude));
  args.push(...formatLocationArg(longitude));
  try {
    await exec(IDEVICELOCATION, args);
  } catch (e) {
    log.errorAndThrow(`Can't set the location on device '${this.opts.udid}'. Original error: ${e.message}`);
  }
};

export { commands };
export default commands;
