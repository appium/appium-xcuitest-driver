import {describe, it, before, after, type TestContext} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';

import {fs, tempDir} from 'appium/support';
import {expect} from 'chai';
import {exec} from 'teen_process';
import type {Browser} from 'webdriverio';

import {getUICatalogCaps} from '../desired';
import {deleteSession, initSession, E2E_TIMEOUT} from '../helpers/session';

describe('XCUITestDriver - simulator screen recording (MJPEG + ffmpeg)', {timeout: E2E_TIMEOUT}, function () {
  let ffmpegPath!: string;
  let driver: Browser;
  let shouldSkip: boolean = false;

  before(async function () {
    try {
      ffmpegPath = await fs.which('ffmpeg');
    } catch {
      shouldSkip = true;
      return;
    }
    const caps = await getUICatalogCaps();
    driver = await initSession(caps);
  });

  after(async function () {
    if (shouldSkip) {
      return;
    }
    await deleteSession();
  });

  it('records simulator screen via mobile start/stopScreenRecording and yields a decodable mp4', async function (ctx: TestContext) {
    if (shouldSkip) {
      return ctx.skip();
    }

    expect(driver.sessionId).to.be.a('string').that.is.not.empty;

    await driver.execute('mobile: startScreenRecording', {
      timeLimit: 300,
      videoType: 'libx264',
      videoFps: 10,
      videoScale: '320:568',
      pixelFormat: 'yuv420p',
      forceRestart: true,
    });

    await delay(3000);

    const b64 = (await driver.execute('mobile: stopScreenRecording', {})) as unknown as string;
    expect(b64, 'stopScreenRecording should return base64 payload').to.be.a('string').and.not.to.equal('');

    const videoPath = await tempDir.path({prefix: 'sim-screen-record-', suffix: '.mp4'});
    try {
      await fs.writeFile(videoPath, Buffer.from(String(b64), 'base64'));
      const {size} = await fs.stat(videoPath);
      expect(size, 'decoded mp4 file should be non-empty').to.be.greaterThan(0);

      await exec(ffmpegPath, ['-hide_banner', '-nostdin', '-v', 'error', '-i', videoPath, '-f', 'null', '-']);
    } finally {
      await fs.rimraf(videoPath).catch(() => {});
    }
  });
});
