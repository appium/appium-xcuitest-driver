import wd from 'wd';
import { logger, fs, mkdirp } from 'appium-support';
import axios from 'axios';
import { exec } from 'teen_process';
import _ from 'lodash';
import path from 'path';


/*
 TODO: Get Git-sha for this commit, to add to metrics being sent so that
       the sense can be made at a finer grained level
 */


const log = logger.getLogger('CI METRICS');

async function sendToSumoLogic (events) {
  if (!process.env.SUMO_LOGIC_ENDPOINT) {
    throw new Error('No SumoLogic endpoint specified in SUMO_LOGIC_ENDPOINT environment variable');
  }

  await axios({
    url: process.env.SUMO_LOGIC_ENDPOINT, // defined in .travis.yml
    method: 'POST',
    data: events,
  });
}

const getGitRev = _.memoize(
  async function gitDetails () {
    let {stdout} = await exec('git', ['rev-parse', 'HEAD']);
    return (stdout || '').trim();
  }
);

function patchDriverWithEvents () {
  if (process.env.CI_METRICS) {
    log.info('CI metrics turned on. Initializing...');
    let promiseChainRemote = wd.promiseChainRemote;
    wd.promiseChainRemote = function (...args) {
      let driver = promiseChainRemote.apply(wd, args);

      // build identification
      let buildDate = Date.now(); // eslint-disable-line no-unused-vars
      let gitRev = ''; // eslint-disable-line no-unused-vars

      // rewrite `init` so `eventTimings` is on
      let init = driver.init;
      driver.init = async function (caps) {
        try {
          gitRev = await getGitRev(); // jshint ignore: line
        } catch (err) {
          log.warn(`Unable to parse git rev and branch: ${err.message}`);
          log.warn('Event timing data will be incomplete');
        }

        caps.eventTimings = true;
        return await init.call(driver, caps);
      };

      // rewrite `quit` to get the event timings and pass them on
      let quit = driver.quit;
      driver.quit = async function () {
        let caps = await driver.sessionCapabilities();
        let events = Object.assign({}, caps.events, {
          // TODO: add identification info when the parser can handle it
          // build: {
          //   sessionId: driver.sessionID,
          //   date: buildDate,
          //   'git-sha': gitRev,
          // },
        });
        if (events) {
          log.info(`Event timings: ${JSON.stringify(events)}`);
          // write to a JSON file, for consumption at the end of the run
          let ciMetricsDir = path.resolve('ci-metrics');
          log.debug(`CI Metrics in directory: ${ciMetricsDir}`);
          if (!await fs.exists(ciMetricsDir)) {
            await mkdirp(ciMetricsDir);
          }
          await fs.writeFile(path.resolve(ciMetricsDir, `${driver.sessionID}.json`), JSON.stringify(events));

          try {
            log.debug('Sending event timing data to SumoLogic');
            await sendToSumoLogic(events);
          } catch (err) {
            log.debug(`Unable to send data to SumoLogic: ${err.message}`);
          }
        }
        return await quit.call(driver);
      };

      return driver;
    };
  }
}

export { patchDriverWithEvents };
export default patchDriverWithEvents;
