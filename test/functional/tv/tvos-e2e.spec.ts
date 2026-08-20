import assert from 'node:assert/strict';
import {describe, it, before, beforeEach, afterEach} from 'node:test';

import {TVOS_CAPS, TVOS_DEVICE_NAME} from '../desired.js';
import {initSession, deleteSession} from '../helpers/session.js';
import {getTargetDevice} from '../helpers/simulator.js';

describe('tvOS', function () {
  let baseCaps: Record<string, any>;
  let udid: string;

  before(async function () {
    udid = await getTargetDevice(TVOS_DEVICE_NAME);
  });

  beforeEach(function () {
    baseCaps = {...TVOS_CAPS, udid};
  });

  afterEach(async function () {
    await deleteSession();
  });

  it('should launch com.apple.TVSettings', async function () {
    const driver = await initSession(baseCaps);
    assert.ok(await driver.$('~General'));
  });
});
