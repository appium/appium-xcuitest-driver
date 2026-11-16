import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {parseVideoSize, splitNalUnits} from '../../../lib/device/media-stream/sps.js';

// SPS NAL units (without start codes) of real encodes; the sizes are what ffprobe reports
const H264 = {
  'high 1080x1920 (cropped)': ['67640028acd9404403c797c044000003000400000300283c60c658', 1080, 1920],
  'baseline 1080x1920 (cropped)': ['6742c028d9004403c797c044000003000400000300283c60c920', 1080, 1920],
  'high 4:2:2 640x480': ['677a0016bcd940a03db0110000030001000003000a0f162d96', 640, 480],
  'android encoder 1080x1920': ['6742c0298d6804403c7979080808083c2211a8', 1080, 1920],
} as const;
const HEVC = {
  'main 1080x1920 (cropped)': [
    '420101016000000300900000030000030078a0021c801e0596566924caf016808000000300800000030284',
    1080,
    1920,
  ],
  'main 1920x1080 (cropped)': [
    '420101016000000300900000030000030078a003c08010e596566924caf016808000000300800000030284',
    1920,
    1080,
  ],
  'main 274x488': ['42010101600000030090000003000003003fa008c807a72796566924caf016808000000300800000030284', 274, 488],
  'android encoder 274x488': ['420101014000000300a0000003000003003fa008c807a7279c6e490892e6a0a020c210', 274, 488],
} as const;

const START = Buffer.from([0, 0, 0, 1]);
// An SPS followed by a PPS-like unit, as in the settings app's config unit
const asConfig = (sps: string) =>
  Buffer.concat([START, Buffer.from(sps, 'hex'), START, Buffer.from([0x68, 0xce, 0x3c])]);

describe('parseVideoSize', function () {
  for (const [name, [sps, width, height]] of Object.entries(H264)) {
    it(`reads the size of an H.264 SPS: ${name}`, function () {
      assert.deepEqual(parseVideoSize(asConfig(sps), 'h264'), {width, height});
    });
  }

  for (const [name, [sps, width, height]] of Object.entries(HEVC)) {
    it(`reads the size of an HEVC SPS: ${name}`, function () {
      assert.deepEqual(parseVideoSize(asConfig(sps), 'hevc'), {width, height});
    });
  }

  it('returns null if the config has no SPS of the codec or is garbage', function () {
    assert.equal(parseVideoSize(asConfig(HEVC['main 274x488'][0]), 'h264'), null);
    assert.equal(parseVideoSize(asConfig(H264['android encoder 1080x1920'][0]), 'hevc'), null);
    assert.equal(parseVideoSize(Buffer.from([1, 2, 3]), 'h264'), null);
    assert.equal(parseVideoSize(Buffer.concat([START, Buffer.from([0x67, 0x64])]), 'h264'), null);
  });
});

describe('splitNalUnits', function () {
  it('handles 3- and 4-byte start codes', function () {
    const data = Buffer.from([0, 0, 0, 1, 0x67, 1, 2, 0, 0, 1, 0x68, 3]);
    assert.deepEqual(
      splitNalUnits(data).map((n) => [...n]),
      [
        [0x67, 1, 2],
        [0x68, 3],
      ],
    );
  });
});
