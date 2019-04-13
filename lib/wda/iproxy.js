import log from '../logger';
import { killProcess } from './utils';
import B from 'bluebird';
import { logger } from 'appium-support';
import { SubProcess } from 'teen_process';
import { checkPortStatus } from 'portscanner';
import { waitForCondition } from 'asyncbox';


const IPROXY_STARTUP_TIMEOUT = 5000;

const iproxyLog = logger.getLogger('iProxy');

class iProxy {
  constructor (udid, localport, deviceport, detached = true) {
    this.expectIProxyErrors = true;
    this.localport = parseInt(localport, 10);
    this.deviceport = parseInt(deviceport, 10);
    this.udid = udid;
    this.iproxy = new SubProcess('iproxy', [localport, deviceport, udid], {
      detached,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  async start () {
    log.debug(`Starting iproxy to forward traffic from local port ${this.localport} ` +
      `to device port ${this.deviceport} over USB for the device ${this.udid}`);
    this.expectIProxyErrors = true;

    return await new B((resolve, reject) => {
      this.iproxy.on('exit', (code) => {
        log.debug(`iproxy exited with code '${code}'`);
        if (code) {
          return reject(new Error(`iproxy exited with code '${code}'`));
        }
      });
      this.iproxy.on('output', (stdout, stderr) => {
        // do nothing if we expect errors
        if (this.expectIProxyErrors) {
          return;
        }

        let out = stdout || stderr;
        for (let line of out.split('\n')) {
          if (!line.length) {
            continue;
          }

          if (line.includes('Resource temporarily unavailable')) {
            // this generally happens when WDA does not respond,
            // so print a more useful message
            log.debug('Connection to WDA timed out');
          } else {
            iproxyLog.debug(line);
          }
        }
      });

      return (async () => {
        try {
          if ((await checkPortStatus(this.localport, '127.0.0.1')) === 'open') {
            throw new Error(`The port #${this.localport} is occupied by an other app. ` +
              `You can customize its value by setting the 'wdaLocalPort' capability.`);
          }
          await this.iproxy.start(0);
          try {
            await waitForCondition(async () => {
              try {
                return (await checkPortStatus(this.localport, '127.0.0.1')) === 'open';
              } catch (ign) {
                return false;
              }
            }, {
              waitMs: IPROXY_STARTUP_TIMEOUT,
              intervalMs: 300,
            });
            log.debug(`iProxy is running and is listening on port #${this.localport}`);
          } catch (e) {
            log.warn(`The local port ${this.localport} is still closed after ${IPROXY_STARTUP_TIMEOUT}ms. ` +
              `Continuing anyway`);
          }
          resolve();
        } catch (err) {
          log.error(`Error starting iproxy: '${err.message}'`);
          reject(new Error('Unable to start iproxy. Make sure libusbmuxd is installed and ' +
            'PATH contains the folder, where the binary is located.'));
        }
      })();
    });
  }

  async quit () {
    await killProcess('iproxy', this.iproxy);
    this.expectIProxyErrors = true;
  }
}

export { iProxy };
export default iProxy;
