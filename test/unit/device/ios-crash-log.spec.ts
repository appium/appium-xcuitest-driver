import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {fs, logger} from 'appium/support.js';
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
  });
});
