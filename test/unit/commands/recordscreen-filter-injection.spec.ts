import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {access, mkdtemp, rm} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {after, afterEach, before, beforeEach, describe, it} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';

import sharp from 'sharp';
import sinon from 'sinon';

import {ScreenRecorder} from '../../../lib/commands/recordscreen.js';
import {XCUITestDriver} from '../../../lib/driver.js';

const run = promisify(execFile);

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('startRecordingScreen ffmpeg filtergraph injection', () => {
  let hasFfmpeg = true;
  let server: http.Server;
  let port: number;
  let dir: string;
  let target: string;
  let driver: XCUITestDriver;
  let sandbox: sinon.SinonSandbox;

  before(async () => {
    try {
      await run('ffmpeg', ['-version']);
    } catch {
      hasFfmpeg = false;
      return;
    }
    const jpeg = await sharp({create: {width: 200, height: 300, channels: 3, background: 'black'}})
      .jpeg()
      .toBuffer();
    server = http.createServer((_req, res) => {
      res.writeHead(200, {'Content-Type': 'multipart/x-mixed-replace; boundary=frame'});
      const timer = setInterval(() => {
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
        res.write(jpeg);
        res.write('\r\n');
      }, 100);
      res.on('close', () => clearInterval(timer));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    port = address.port;
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'recordscreen-injection-'));
    target = path.join(dir, 'written-by-ffmpeg');
    sandbox = sinon.createSandbox();
    driver = new XCUITestDriver({} as any);
    driver._device = {udid: '00008120-0000000000000000'} as any;
    driver.opts.mjpegServerPort = port;
    driver.opts.wdaBaseUrl = 'http://127.0.0.1';
    sandbox.stub(driver, 'proxyCommand').resolves({});
  });

  afterEach(async () => {
    if (driver._recentScreenRecorder) {
      await driver._recentScreenRecorder.interrupt(true);
      await driver._recentScreenRecorder.cleanup();
      driver._recentScreenRecorder = null;
    }
    sandbox.restore();
    await rm(dir, {recursive: true, force: true});
  });

  // `metadata=mode=print:file=` makes ffmpeg write an attacker-chosen host path with
  // attacker-controlled lines, e.g. `x=$(cmd)` into a shell rc file.
  const writer = (file: string) => `metadata=mode=add:key=x:value='$(id)',metadata=mode=print:file=${file}`;

  for (const [name, options] of [
    ['videoFilters', (file: string) => ({videoFilters: writer(file)})],
    ['videoScale', (file: string) => ({videoScale: `320:-2,${writer(file)}`})],
  ] as const) {
    it(`must not let ${name} write host files through the ffmpeg filtergraph`, {timeout: 30000}, async (t) => {
      if (!hasFfmpeg) {
        t.skip('Requires ffmpeg');
        return;
      }
      let error: unknown;
      try {
        await driver.startRecordingScreen({forceRestart: true, ...options(target)});
        await delay(1500);
      } catch (e) {
        error = e;
      }
      if (driver._recentScreenRecorder) {
        await driver._recentScreenRecorder.interrupt(true);
      }
      assert.equal(await exists(target), false, `ffmpeg wrote the attacker-chosen host file ${target}`);
      assert.ok(error, `A hostile ${name} value must be rejected`);
    });
  }
});

describe('startRecordingScreen filter option validation', () => {
  let sandbox: sinon.SinonSandbox;
  let driver: XCUITestDriver;
  let start: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    driver = new XCUITestDriver({} as any);
    driver._device = {udid: '00008120-0000000000000000'} as any;
    sandbox.stub(driver, 'proxyCommand').resolves({});
    start = sandbox.stub(ScreenRecorder.prototype, 'start').resolves();
  });

  afterEach(() => {
    driver._recentScreenRecorder = null;
    sandbox.restore();
  });

  for (const videoFilters of [
    'transpose=1',
    'scale=1280:720,hflip',
    'scale=w=iw/2:h=-2:flags=bicubic,setsar=1',
    '[in] scale@main = 320:-2 [scaled]; [scaled] vflip [out]',
    'crop=iw:ih/2:0:0,pad=iw:ih*2:0:(oh-ih)/2,drawbox=x=10:y=10:w=20:h=20:color=red',
  ]) {
    it(`accepts videoFilters ${videoFilters}`, async () => {
      await driver.startRecordingScreen({forceRestart: true, videoFilters});
      sinon.assert.calledOnce(start);
    });
  }

  for (const [videoFilters, reason] of [
    ['movie=/etc/passwd', /'movie' filter/],
    ['scale=320:-2,metadata=mode=print:file=/tmp/x', /'metadata' filter/],
    ['metadata=print:::same_str::/tmp/x', /'metadata' filter/],
    ['sws_flags=bicubic;scale=1:1', /'sws_flags' filter/],
    ['meta\\data=print', /quotes and backslashes/],
    ["'metadata'=print", /quotes and backslashes/],
    ['"metadata"=print', /quotes and backslashes/],
    ['scale=/w=/etc/passwd:h=32', /starting with '\/'/],
    ['scale=h=32: /w=/etc/passwd', /starting with '\/'/],
    ['drawbox=/color=/etc/passwd', /starting with '\/'/],
    ['scale=1:1[out', /unbalanced brackets/],
    ['@scale=1:1', /'@scale' filter/],
  ] as const) {
    it(`rejects videoFilters ${videoFilters}`, async () => {
      await assert.rejects(driver.startRecordingScreen({forceRestart: true, videoFilters}), reason);
      sinon.assert.notCalled(start);
    });
  }

  for (const videoScale of [
    '1280:720',
    '320:-2',
    'iw/2:-1',
    'trunc(iw/4)*2:ih',
    'w=1280:h=720',
    '1:1:flags=bicubic',
    '1:1,hflip',
  ]) {
    it(`accepts videoScale ${videoScale}`, async () => {
      await driver.startRecordingScreen({forceRestart: true, videoScale});
      sinon.assert.calledOnce(start);
    });
  }

  for (const videoScale of [
    '1:1,metadata=mode=print',
    '/w=/etc/passwd:h=32',
    '1:1;[in]movie=/etc/passwd',
    "1:'1'",
    '1:1\\,hflip',
  ]) {
    it(`rejects videoScale ${videoScale}`, async () => {
      await assert.rejects(driver.startRecordingScreen({forceRestart: true, videoScale}), /videoScale/);
      sinon.assert.notCalled(start);
    });
  }

  it('does not check the hardware scale filter picked by the driver', async () => {
    await driver.startRecordingScreen({
      forceRestart: true,
      videoScale: '1280:720',
      hardwareAcceleration: 'videoToolbox',
    });
    sinon.assert.calledOnce(start);
  });

  it('only checks videoFilters when videoScale is ignored', async () => {
    await driver.startRecordingScreen({forceRestart: true, videoFilters: 'hflip', videoScale: '1:1,movie=/x'});
    sinon.assert.calledOnce(start);
  });
});
