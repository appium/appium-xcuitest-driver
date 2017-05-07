import wd from 'wd';
import { logger, fs, mkdirp } from 'appium-support';
import request from 'request-promise';
import { exec } from 'teen_process';
import _ from 'lodash';
import path from 'path';
import uuid from 'uuid';
import { asyncify } from 'asyncbox';


/*
 TODO: Get Git-sha for this commit, top add to metrics being sent so that
       the sense can be made at a finer grained level
 */


const log = logger.getLogger('CI METRICS');

async function sendToSumoLogic (events) {
  let opts = {
    method: 'POST',
    uri: process.env.SUMO_LOGIC_ENDPOINT, // defined in .travis.yml
    body: events,
    json: true,
  };

  return await request(opts);
}

const getGitRev = _.memoize (
  async function gitDetails () {
    let {stdout} = await exec('git', ['rev-parse', 'HEAD']);
    return (stdout || '').trim();
  }
);

if (process.env.CI_METRICS) {
  log.info('CI metrics turned on. Initializing...');
  let promiseChainRemote = wd.promiseChainRemote;
  wd.promiseChainRemote = function (...args) {
    let driver = promiseChainRemote.apply(wd, args);

    // build identification
    // jshint ignore: start
    let buildDate = Date.now(); // eslint-disable-line no-unused-vars
    let gitRev = ''; // eslint-disable-line no-unused-vars
    // jshint ignore: end

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

    // reqrite `quit` to get the event timings and pass them on
    let quit = driver.quit;
    driver.quit = async function () {
      let status = await driver.sessionCapabilities();
      let events = Object.assign({}, status.events, {
        // TODO: add identification info when the parser can handle it
        // build: {
        //   date: buildDate,
        //   'git-sha': gitRev,
        // },
      });
      if (events) {
        log.info(`Event timings: ${JSON.stringify(events)}`);

        // write to a JSON file, for consumption at the end of the run
        let ciMetricsDir = path.resolve('ci-metrics');
        log.debug(`CI METRICS IN DIR: ${ciMetricsDir}`);
        if (!await fs.exists(ciMetricsDir)) {
          await mkdirp(ciMetricsDir);
        }
        await fs.writeFile(path.resolve(ciMetricsDir, `${uuid.v4()}.json`), JSON.stringify(events));

        try {
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


async function main () {
  await exec('appium-event-parser', []);
}

if (require.main === module) {
  asyncify(main);
}
