import { exec } from 'teen_process';
import { fs, util } from 'appium-support';
import log from '../logger';

let commands = {};

commands.setGeoLocation = async function (location) {
  let {latitude, longitude} = location;

  if (!util.hasValue(latitude) || !util.hasValue(longitude)) {
    log.errorAndThrow(`Both latitude and longitude should be set`);
  }

  if (this.isRealDevice()) {
    if (!(await fs.which('idevicelocation'))) {
      log.errorAndThrow(`idevicelocation doesn't exist on the host`);
    }
    try {
      await exec('idevicelocation', ['-u', this.opts.udid, `${latitude}`, `${longitude}`]);
    } catch (e) {
      throw new Error(`Can't set the location on device '${this.opts.udid}'. Original error: ${e.message}`);
    }
  } else {
    await this.opts.device.setGeolocation(`${latitude}`, `${longitude}`);
  }
};

export { commands };
export default commands;
