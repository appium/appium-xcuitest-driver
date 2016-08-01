import _iosDevice from 'node-ios-device';
import _ from 'lodash';
import B from 'bluebird';


const getDevices = B.promisify(_iosDevice.devices, _iosDevice);

async function getConnectedDevices () {
  let devices = await getDevices();

  return _.map(devices, 'udid');
}

export { getConnectedDevices };
