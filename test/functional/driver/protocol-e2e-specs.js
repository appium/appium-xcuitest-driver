import { startServer } from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import axios from 'axios';
import { killAllSimulators } from '../helpers/simulator';
import _ from 'lodash';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { W3C_CAPS } from '../desired';


const should = chai.should();
chai.use(chaiAsPromised);

describe('Protocol', function () {
  this.timeout(MOCHA_TIMEOUT);
  if (!process.env.REAL_DEVICE) {
    describe('w3c compliance', function () {
      let server;
      before(async function () {
        await killAllSimulators();
        server = await startServer(PORT, HOST);
      });
      after(async function () {
        await server.close();
      });

      const sessionUrl = `http://${HOST}:${PORT}/wd/hub/session`;
      it('should accept w3c formatted caps', async function () {
        const {status, value, sessionId} = (await axios({
          url: sessionUrl,
          method: 'POST',
          data: W3C_CAPS,
        })).data;
        should.not.exist(status);
        value.should.exist;
        value.capabilities.should.exist;
        should.not.exist(sessionId);
        should.exist(value.sessionId);
        await axios({
          url: `${sessionUrl}/${value.sessionId}`,
          method: 'DELETE',
        });
      });
      it('should not accept w3c caps if missing "platformName" capability', async function () {
        await axios({
          url: sessionUrl,
          method: 'POST',
          data: _.omit(W3C_CAPS, ['capabilities.alwaysMatch.platformName']),
        }).should.eventually.be.rejectedWith(/400/);
      });
      it('should accept the "appium:" prefix', async function () {
        const w3cCaps = _.cloneDeep(W3C_CAPS);
        const alwaysMatch = w3cCaps.capabilities.alwaysMatch;
        const deviceName = alwaysMatch.deviceName;
        delete alwaysMatch.deviceName;
        await axios({
          url: sessionUrl,
          method: 'POST',
          data: w3cCaps,
        }).should.eventually.be.rejected;
        alwaysMatch['appium:deviceName'] = deviceName;
        const { value } = (await axios({
          url: sessionUrl,
          method: 'POST',
          data: w3cCaps,
        })).data;
        value.should.exist;
        await axios({
          url: `${sessionUrl}/${value.sessionId}`,
          method: 'DELETE',
        });
      });
      it('should receive 404 status code if call findElement on one that does not exist', async function () {
        const { value } = (await axios({
          url: sessionUrl,
          method: 'POST',
          data: W3C_CAPS,
        })).data;
        try {
          await axios({
            url: `${sessionUrl}/${value.sessionId}/element`,
            method: 'POST',
            data: {
              using: 'accessibility id',
              value: 'Bad Selector'
            },
          });
        } catch (e) {
          e.response.status.should.equal(404);
        }
        await axios({
          url: `${sessionUrl}/${value.sessionId}`,
          method: 'DELETE',
        });
      });
    });
  }
});
