import log from '../logger';
import { killProcess } from './utils';
import B from 'bluebird';
import { logger } from 'appium-support';
import { SubProcess } from 'teen_process';


const IPROXY_TIMEOUT = 5000;

const iproxyLog = logger.getLogger('iProxy');

class iProxy {
  constructor (udid, localport, deviceport) {
    log.debug(`Starting iproxy to forward traffic from local port ${localport} to device port ${deviceport} over USB`);
    this.expectIProxyErrors = true;
    this.iproxy = new SubProcess('iproxy', [localport, deviceport, udid], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  async start () {
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

          if (line.indexOf('Resource temporarily unavailable') !== -1) {
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
          await this.iproxy.start(IPROXY_TIMEOUT);
          this.iproxy.proc.unref();
          resolve();
        } catch (err) {
          log.error(`Error starting iproxy: '${err.message}'`);
          reject(new Error('Unable to start iproxy. Is it installed?'));
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
