import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {stub} from 'sinon';
import type {Browser} from 'webdriverio';

import {openHybridPage, switchToHybridWebview} from '../functional/web/helpers/hybrid.js';

const BUNDLE_ID = 'com.example.UICatalog';
const URL = 'http://127.0.0.1:1234/test/guinea-pig';

describe('hybrid webview test helpers', function () {
  it('re-queries missing contexts and ignores webviews belonging to Safari', async function () {
    const execute = stub();
    execute.onCall(0).resolves([{id: 'NATIVE_APP'}]);
    execute.onCall(1).resolves([{id: 'WEBVIEW_safari', bundleId: 'com.apple.mobilesafari'}]);
    execute.onCall(2).resolves([{id: 'WEBVIEW_catalog', bundleId: BUNDLE_ID}]);
    const switchContext = stub().resolves();
    await switchToHybridWebview({execute, switchContext} as unknown as Browser, BUNDLE_ID, 3, 0);
    assert.equal(execute.callCount, 3);
    assert.deepEqual(switchContext.args, [['WEBVIEW_catalog']]);
  });

  it('discovers a fresh context if the first one disappears while switching', async function () {
    const execute = stub();
    execute.onCall(0).resolves([{id: 'WEBVIEW_old', bundleId: BUNDLE_ID}]);
    execute.onCall(1).resolves([{id: 'WEBVIEW_new', bundleId: BUNDLE_ID}]);
    const switchContext = stub();
    switchContext.onCall(0).rejects(new Error('Context disappeared'));
    switchContext.onCall(1).resolves();
    await switchToHybridWebview({execute, switchContext} as unknown as Browser, BUNDLE_ID, 2, 0);
    assert.deepEqual(switchContext.args, [['WEBVIEW_old'], ['WEBVIEW_new']]);
  });

  it('fails after bounded retries when the application never exposes a webview', async function () {
    const execute = stub().resolves([{id: 'NATIVE_APP'}]);
    const switchContext = stub();
    await assert.rejects(
      switchToHybridWebview({execute, switchContext} as unknown as Browser, BUNDLE_ID, 2, 0),
      /Expected a webview.*NATIVE_APP/,
    );
    assert.equal(execute.callCount, 2);
    assert.equal(switchContext.callCount, 0);
  });

  it('rejects the old document and waits for the target document to finish loading', async function () {
    const execute = stub();
    execute.onCall(0).resolves({url: 'file:///content.html', readyState: 'complete'});
    execute.onCall(1).resolves({url: URL, readyState: 'loading'});
    execute.onCall(2).resolves({url: URL, readyState: 'complete'});
    const navigateTo = stub().resolves();
    const waitUntil = async (condition: () => Promise<boolean>) => {
      assert.equal(await condition(), false);
      assert.equal(await condition(), false);
      assert.equal(await condition(), true);
    };
    await openHybridPage({execute, navigateTo, waitUntil} as unknown as Browser, URL, 1, 0);
    assert.deepEqual(navigateTo.args, [[URL]]);
  });

  it('retries navigation after a readiness timeout', async function () {
    const navigateTo = stub().resolves();
    const waitUntil = stub();
    waitUntil.onCall(0).rejects(new Error('Still on WKWebView'));
    waitUntil.onCall(1).resolves();
    await openHybridPage({navigateTo, waitUntil} as unknown as Browser, URL, 2, 0);
    assert.deepEqual(navigateTo.args, [[URL], [URL]]);
  });

  it('preserves failure when navigation never reaches the target document', async function () {
    const navigateTo = stub().resolves();
    const waitUntil = stub().rejects(new Error('Still on WKWebView'));
    await assert.rejects(
      openHybridPage({navigateTo, waitUntil} as unknown as Browser, URL, 2, 0),
      /Still on WKWebView/,
    );
    assert.equal(navigateTo.callCount, 2);
  });
});
