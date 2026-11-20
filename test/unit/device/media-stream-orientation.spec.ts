import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {parseDisplayGeometry} from '../../../lib/device/media-stream/orientation.js';

// The shape CoreDevice's getDisplayInfo() returned on an iPad (9th generation) running iPadOS 27.0.1
const display = (extra: Record<string, unknown> = {}) => ({
  external: false,
  primary: true,
  displayId: 1,
  name: 'LCD',
  nativeSize: [1620, 2160],
  nativeOrientation: 'rot0',
  currentOrientation: 'rot0',
  currentMode: {size: [1620, 2160], refreshRate: 60},
  ...extra,
});
const info = (...displays: unknown[]) => ({
  current: true,
  orientation: {currentDeviceNonFlatOrientation: 'portrait', currentDeviceOrientation: 'faceUp'},
  displays,
});

describe('parseDisplayGeometry', function () {
  it('reads the visible size and the rotation of the primary display', function () {
    assert.deepEqual(parseDisplayGeometry(info(display())), {width: 1620, height: 2160, rotation: 0});
  });

  for (const degrees of [0, 90, 180, 270] as const) {
    it(`maps rot${degrees} to a ${degrees} degree clockwise turn`, function () {
      const geometry = parseDisplayGeometry(info(display({currentOrientation: `rot${degrees}`})));
      assert.equal(geometry?.rotation, degrees);
    });
  }

  it('keeps the size when the display is turned: it describes the native buffer', function () {
    const geometry = parseDisplayGeometry(info(display({currentOrientation: 'rot270'})));
    assert.deepEqual([geometry?.width, geometry?.height], [1620, 2160]);
  });

  it('picks the display by id, and the primary one by default', function () {
    const other = display({displayId: 2, primary: false, currentMode: {size: [800, 600]}, currentOrientation: 'rot90'});
    assert.deepEqual(parseDisplayGeometry(info(other, display())), {width: 1620, height: 2160, rotation: 0});
    assert.deepEqual(parseDisplayGeometry(info(display(), other), 2), {width: 800, height: 600, rotation: 90});
    assert.equal(parseDisplayGeometry(info(display()), 7), undefined);
  });

  it('falls back to the first display when none is primary', function () {
    assert.equal(parseDisplayGeometry(info(display({primary: false, displayId: 4})))?.width, 1620);
  });

  it('leaves the rotation undefined when the display does not report one it knows', function () {
    for (const currentOrientation of [undefined, 'rot45', 'portrait', 'rot360']) {
      const geometry = parseDisplayGeometry(info(display({currentOrientation})));
      assert.equal(geometry?.rotation, undefined);
      assert.equal(geometry?.width, 1620);
    }
  });

  it('returns undefined for a missing or unusable size and for garbage', function () {
    for (const bad of [
      undefined,
      null,
      {},
      {displays: 'x'},
      {displays: []},
      info(display({currentMode: {}})),
      info(display({currentMode: {size: [0, 100]}})),
      info(display({currentMode: {size: [100.5, 100]}})),
      info(display({currentMode: {size: ['1', '2']}})),
    ]) {
      assert.equal(parseDisplayGeometry(bad), undefined);
    }
  });
});
