import { exec } from 'teen_process';


async function getConnectedDevices () {
  let {stdout} = await exec('idevice_id', ['-l']);
  return stdout.trim().split('\n');
}

export { getConnectedDevices };
