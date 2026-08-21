import assert from 'node:assert/strict';
import {describe, it, before, beforeEach, afterEach} from 'node:test';

import {WATCHOS_CAPS, WATCHOS_DEVICE_NAME} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {getTargetDevice} from '../helpers/simulator.js';

describe('watchOS', function () {
  let baseCaps: Record<string, any>;
  let udid: string;

  before(async function () {
    udid = await getTargetDevice(WATCHOS_DEVICE_NAME);
  });

  beforeEach(function () {
    baseCaps = {...WATCHOS_CAPS, udid};
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.NanoSettings', async function () {
    const driver = await initSession(baseCaps);
    assert.ok(await driver.$('~General'));
  });
});
