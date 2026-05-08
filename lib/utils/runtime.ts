import {exec} from 'teen_process';
import {log} from '../logger';

/** Logs effective OS user running the current process. */
export async function printUser(): Promise<void> {
  try {
    const {stdout} = await exec('whoami');
    log.debug(`Current user: '${stdout.trim()}'`);
  } catch (err: any) {
    log.debug(`Unable to get username running server: ${err.message}`);
  }
}
