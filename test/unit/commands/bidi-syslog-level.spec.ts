import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {makeSyslogLevelTransformer} from '../../../lib/commands/bidi/syslog-level.js';
import {toLogEntry} from '../../../lib/device/log/helpers.js';

const entry = (message: string) => toLogEntry(message, 1);

describe('makeSyslogLevelTransformer', function () {
  const simulatorCases: [string, string][] = [
    ['2026-11-18 14:56:35.071 Db symptomsd[696:c0df32] [com.apple.x] debug', 'debug'],
    ['2026-11-18 14:56:35.122 Df kernel[0:37d] default', 'info'],
    ['2026-11-18 14:56:35.076 I  symptomsd[696:c16390] [com.apple.x] info', 'info'],
    ['2026-11-18 14:47:08.257 E  cfprefsd[617:c11812] [com.apple.x] error', 'error'],
    ['2026-11-18 14:47:08.257 F  cfprefsd[617:c11812] [com.apple.x] fault', 'error'],
  ];
  for (const [line, level] of simulatorCases) {
    it(`should map the simulator line '${line}' to ${level}`, function () {
      assert.strictEqual(makeSyslogLevelTransformer(false)(entry(line)).level, level);
    });
  }

  const deviceCases: [string, string][] = [
    ['Nov 18 10:00:00 iPhone locationd(CoreFoundation)[67] <Debug>: msg', 'debug'],
    ['Nov 18 10:00:00 iPhone locationd[67] <Notice>: msg', 'info'],
    ['Nov  8 10:00:00 iPhone locationd[67] <Info>: msg', 'info'],
    ['Nov 18 10:00:00 iPhone SpringBoard(UIKit)[1] <Warning>: msg', 'warn'],
    ['Nov 18 10:00:00 iPhone Some App(UIKit)[12] <Error>: msg', 'error'],
    ['Nov 18 10:00:00 iPhone kernel[0] <Critical>: msg', 'error'],
  ];
  for (const [line, level] of deviceCases) {
    it(`should map the device line '${line}' to ${level}`, function () {
      assert.strictEqual(makeSyslogLevelTransformer(true)(entry(line)).level, level);
    });
  }

  it('should keep the message and timestamp', function () {
    const result = makeSyslogLevelTransformer(true)({
      timestamp: 42,
      level: 'ALL',
      message: 'Nov 18 10:00:00 iPhone a[1] <Error>: x',
    });
    assert.deepStrictEqual(result, {timestamp: 42, level: 'error', message: 'Nov 18 10:00:00 iPhone a[1] <Error>: x'});
  });

  it('should leave lines without a recognizable severity unchanged', function () {
    const header = entry('Timestamp               Ty Process[PID:TID]');
    assert.strictEqual(makeSyslogLevelTransformer(false)(header), header);
    const activity = entry('2026-11-18 14:56:35.076 A  foo[1:2] activity');
    assert.strictEqual(makeSyslogLevelTransformer(false)(activity), activity);
    const unknown = entry('Nov 18 10:00:00 iPhone a[1] <Whatever>: x');
    assert.strictEqual(makeSyslogLevelTransformer(true)(unknown), unknown);
  });

  it('should not parse lines with the pattern of the other platform', function () {
    const deviceLine = entry('Nov 18 10:00:00 iPhone a[1] <Error>: x');
    assert.strictEqual(makeSyslogLevelTransformer(false)(deviceLine), deviceLine);
    const simLine = entry('2026-11-18 14:47:08.257 E  cfprefsd[617:c11812] x');
    assert.strictEqual(makeSyslogLevelTransformer(true)(simLine), simLine);
  });
});
