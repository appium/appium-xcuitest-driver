import { startServer } from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import request from 'request-promise';
import { killAllSimulators } from '../helpers/simulator';
import _ from 'lodash';
import { HOST, PORT, MOCHA_TIMEOUT } from '../helpers/session';
import { W3C_CAPS } from '../desired';


const should = chai.should();
chai.use(chaiAsPromised);

describe('XCUITestDriver', function () {
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
        const {status, value, sessionId} = await request.post({url: sessionUrl, json: W3C_CAPS});
        should.not.exist(status);
        value.should.exist;
        value.capabilities.should.exist;
        should.not.exist(sessionId);
        should.exist(value.sessionId);
        await request.delete({url: `${sessionUrl}/${value.sessionId}`});
      });
      it('should not accept w3c caps if missing "platformName" capability', async function () {
        await request.post({
          url: sessionUrl,
          json: _.omit(W3C_CAPS, ['capabilities.alwaysMatch.platformName']),
        }).should.eventually.be.rejectedWith(/'platformName' can't be blank/);
      });
      it('should accept the "appium:" prefix', async function () {
        const w3cCaps = _.cloneDeep(W3C_CAPS);
        const alwaysMatch = w3cCaps.capabilities.alwaysMatch;
        const deviceName = alwaysMatch.deviceName;
        delete alwaysMatch.deviceName;
        await request.post({url: sessionUrl, json: w3cCaps}).should.eventually.be.rejected;
        alwaysMatch['appium:deviceName'] = deviceName;
        const { value } = await request.post({url: sessionUrl, json: w3cCaps});
        value.should.exist;
        await request.delete(`${sessionUrl}/${value.sessionId}`);
      });
      it('should receive 404 status code if call findElement on one that does not exist', async function () {
        const { value } = await request.post({url: sessionUrl, json: W3C_CAPS});
        try {
          await request.post({
            url: `${sessionUrl}/${value.sessionId}/element`,
            json: {
              using: 'accessibility id',
              value: 'Bad Selector'
            },
          });
        } catch (e) {
          e.statusCode.should.equal(404);
        }
        await request.delete({url: `${sessionUrl}/${value.sessionId}`});
      });
    });
  }
});
