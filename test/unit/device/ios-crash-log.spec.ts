import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, beforeEach, afterEach} from 'node:test';

import type {Simulator} from 'appium-ios-simulator';
import {fs, logger, tempDir} from 'appium/support.js';
import {createSandbox, type SinonSandbox} from 'sinon';

import {CrashReportsClient} from '../../../lib/device/crash-reports-client.js';
import {IOSCrashLog} from '../../../lib/device/log/ios-crash-log.js';

describe('IOSCrashLog', function () {
  let sandbox: SinonSandbox;

  beforeEach(function () {
    sandbox = createSandbox();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('keeps collecting real device crash reports after one fails to export', async function () {
    const client = {
      listCrashes: sandbox.stub(),
      exportCrash: sandbox.stub(),
      close: sandbox.stub().resolves(),
    };
    client.listCrashes.onFirstCall().resolves([]);
    client.listCrashes.resolves(['a.ips', 'b.ips']);
    client.exportCrash.withArgs('a.ips').rejects(new Error('Remote path does not exist'));
    client.exportCrash
      .withArgs('b.ips')
      .callsFake(async (name: string, dst: string) => await fs.writeFile(path.join(dst, name), 'b crash', 'utf8'));
    sandbox.stub(CrashReportsClient, 'create').resolves(client as unknown as CrashReportsClient);

    const crashLog = new IOSCrashLog({udid: 'udid', log: logger.getLogger('IOSCrashLog test')});
    await crashLog.startCapture();
    const messages = (await crashLog.getLogs()).map(({message}) => message);
    assert.deepStrictEqual(messages, ['b crash']);
    assert.deepStrictEqual(await crashLog.getLogs(), []);
    assert.strictEqual(client.exportCrash.withArgs('a.ips').callCount, 1);
  });

  it('finds a new Simulator crash report listed before the last 20 known ones', async function () {
    const tmpRoot = await tempDir.openDir();
    try {
      sandbox.stub(process.env, 'HOME').value(tmpRoot);
      const reportsRoot = path.join(tmpRoot, 'Library', 'Logs', 'DiagnosticReports');
      await fs.mkdirp(reportsRoot);
      const udid = 'C0FFEE00-0000-4000-8000-000000000000';
      for (let i = 10; i <= 30; i++) {
        await fs.writeFile(path.join(reportsRoot, `Zeta-2026-10-11-1200${i}.ips`), udid, 'utf8');
      }

      const crashLog = new IOSCrashLog({sim: {udid} as Simulator, log: logger.getLogger('IOSCrashLog test')});
      await crashLog.startCapture();
      await fs.writeFile(path.join(reportsRoot, 'Alpha-2026-10-11-130000.ips'), `Alpha ${udid}`, 'utf8');
      const messages = (await crashLog.getLogs()).map(({message}) => message);
      assert.deepStrictEqual(messages, [`Alpha ${udid}`]);
    } finally {
      await fs.rimraf(tmpRoot);
    }
  });
});
