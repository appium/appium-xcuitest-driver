import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, it, mock} from 'node:test';
import {pathToFileURL} from 'node:url';

import * as support from 'appium/support.js';
const {fs} = support;
const net = {...support.net};
const zip = {...support.zip};
import sinon from 'sinon';

// Avoid copying CommonJS interop exports such as __esModule into the mock.
mock.module('appium/support.js', {
  namedExports: {fs, logger: support.logger, node: support.node, net, zip},
});
const {getWDAPrebuiltPackage} = await import(pathToFileURL(path.resolve('scripts/download-wda.mjs')).href);

describe('prebuilt WDA release migration', () => {
  afterEach(() => sinon.restore());
  for (const [version, release] of [
    ['16.15.3', 'WebDriverAgent/releases/download/v16.15.3'],
    ['16.16.0', 'appium-ios/releases/download/appium-webdriveragent@16.16.0'],
    ['17.0.0', 'appium-ios/releases/download/appium-webdriveragent@17.0.0'],
  ]) {
    for (const platform of ['iOS', 'tvOS', 'watchOS']) {
      it(`downloads ${platform} ${version} from its publishing repository`, async () => {
        const parent = await mkdtemp(path.join(os.tmpdir(), 'wda-download-'));
        const dest = path.join(parent, 'runner');
        sinon.stub(fs, 'readFile').resolves(JSON.stringify({version}));
        const download = sinon.stub(net, 'downloadFile').resolves();
        const extract = sinon.stub(zip, 'extractAllTo').resolves();
        const originalCwd = process.cwd();
        try {
          process.chdir(parent);
          await getWDAPrebuiltPackage({platform, kind: 'sim', outdir: dest});
          const suffix = platform === 'iOS' ? '' : `_${platform}`;
          const archive = `WebDriverAgentRunner${suffix}-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
          sinon.assert.calledOnceWithExactly(
            download,
            `https://github.com/appium/${release}/${archive}`,
            path.join(dest, archive),
          );
          sinon.assert.calledOnceWithExactly(extract, path.join(dest, archive), dest);
          assert.equal(await fs.exists(dest), true);
        } finally {
          process.chdir(originalCwd);
          await rm(parent, {recursive: true, force: true});
        }
      });
    }
  }
});

describe('prebuilt WDA fallback to lower versions', () => {
  const notFound = () => new Error('Cannot download', {cause: {response: {status: 404}}});
  const archive = `WebDriverAgentRunner-Build-Sim-${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}.zip`;
  const urlOf = (v: string) =>
    `https://github.com/appium/appium-ios/releases/download/appium-webdriveragent@${v}/${archive}`;

  afterEach(() => sinon.restore());

  async function run(fallbackQueueMaxLen: number) {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'wda-download-'));
    const originalCwd = process.cwd();
    try {
      process.chdir(parent);
      await getWDAPrebuiltPackage({
        platform: 'iOS',
        kind: 'sim',
        outdir: path.join(parent, 'runner'),
        fallbackQueueMaxLen,
      });
    } finally {
      process.chdir(originalCwd);
      await rm(parent, {recursive: true, force: true});
    }
  }

  function stubEnv() {
    sinon
      .stub(fs, 'readFile')
      .callsFake((async (p: unknown) =>
        String(p).includes('node_modules')
          ? JSON.stringify({version: '16.17.4'})
          : JSON.stringify({dependencies: {'appium-webdriveragent': '^16.17.2'}})) as any);
    sinon.stub(zip, 'extractAllTo').resolves();
    sinon
      .stub(globalThis, 'fetch')
      .resolves(
        new Response(
          JSON.stringify({versions: {'16.17.1': {}, '16.17.2': {}, '16.17.3': {}, '16.17.4': {}, '16.17.5': {}}}),
        ),
      );
    return sinon.stub(net, 'downloadFile');
  }

  it('tries lower versions within the allowed range when enabled', async () => {
    const download = stubEnv();
    download.callsFake(async (url: string) => {
      if (url !== urlOf('16.17.3')) {
        throw notFound();
      }
    });
    await run(10);
    assert.deepEqual(
      download.getCalls().map((c) => c.args[0]),
      [urlOf('16.17.4'), urlOf('16.17.3')],
    );
  });

  it('fails once the allowed range is exhausted', async () => {
    const download = stubEnv();
    download.rejects(notFound());
    await assert.rejects(run(10));
    assert.equal(download.callCount, 3);
  });

  it('limits the number of fallback versions', async () => {
    const download = stubEnv();
    download.rejects(notFound());
    await assert.rejects(run(1));
    assert.deepEqual(
      download.getCalls().map((c) => c.args[0]),
      [urlOf('16.17.4'), urlOf('16.17.3')],
    );
  });

  it('does not fall back by default', async () => {
    const download = stubEnv();
    download.rejects(notFound());
    await assert.rejects(run(0));
    assert.equal(download.callCount, 1);
  });
});
