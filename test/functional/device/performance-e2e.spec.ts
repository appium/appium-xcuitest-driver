import {describe, it, before, after} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import type {Browser} from 'webdriverio';

import {getUICatalogCaps} from '../desired';
import {initSession, deleteSession} from '../helpers/session';

chai.use(chaiAsPromised);

describe('XCUITestDriver - performance', function () {
  const profileName = 'Time Profiler';

  let driver: Browser;

  describe('record performance metrics', {skip: Boolean(process.env.CI)}, function () {
    before(async function () {
      const uiCatalogCaps = await getUICatalogCaps();
      driver = await initSession(uiCatalogCaps);
    });
    after(async function () {
      await deleteSession();
    });

    it('should return recorded trace file on stop', async function () {
      await driver.execute('mobile: startPerfRecord', {
        profileName,
      });
      await delay(5000);
      expect(
        await driver.execute('mobile: stopPerfRecord', {
          profileName,
        }),
      ).to.not.be.empty;
    });
  });
});
