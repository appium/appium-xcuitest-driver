import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import type {Browser} from 'webdriverio';

import {getUICatalogCaps} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';

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
      const result = await driver.execute('mobile: stopPerfRecord', {
        profileName,
      });
      assert.notStrictEqual((result as unknown as string).length, 0);
    });
  });
});
