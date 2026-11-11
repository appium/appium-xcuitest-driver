import assert from 'node:assert/strict';
import {afterEach, describe, it, mock} from 'node:test';

import * as remoteDebuggerModule from 'appium-remote-debugger';
import {RemoteDebugger, type RemoteDebuggerOptions} from 'appium-remote-debugger';
import sinon from 'sinon';

const createRemoteDebugger = sinon.stub().callsFake((opts: RemoteDebuggerOptions) => new RemoteDebugger(opts));
mock.module('appium-remote-debugger', {
  namedExports: {...remoteDebuggerModule, createRemoteDebugger},
});
const {XCUITestDriver} = await import('../../lib/driver.js');

describe('webInspectorSettings', function () {
  afterEach(function () {
    sinon.restore();
    createRemoteDebugger.resetHistory();
  });

  for (const realDevice of [false, true]) {
    it(`forwards independent policy copies to replacement debuggers (real device: ${realDevice})`, async function () {
      const driver = new XCUITestDriver({} as any);
      const proxy = sinon.stub(driver, 'proxyCommand');
      const setter = sinon.spy(RemoteDebugger.prototype, 'setWebInspectorPageSettings');
      sinon.stub(driver, 'isRealDevice').returns(realDevice);
      sinon.stub(driver, 'isSafari').returns(true);
      const socket = sinon.stub().resolves('/tmp/inspector.sock');
      sinon.stub(driver, 'device').get(() => ({getWebInspectorSocket: socket}));
      const transport = {};
      const getTier = sinon.stub().resolves(transport);
      sinon.stub(driver, 'remoteXPCFacade').get(() => ({getTier}));
      driver.opts.udid = 'test-device';
      const policy = {pageSettings: {WebSecurityEnabled: false}, userAgent: 'Test/1.0'};

      await driver.updateSettings({webInspectorSettings: policy});
      sinon.assert.calledOnceWithExactly(setter, policy);
      assert.equal(setter.firstCall.thisValue.log, driver.log);
      assert.equal(driver._remote, null);
      for (let i = 0; i < 2; i++) {
        await driver.getNewRemoteDebugger();
        const [opts, actualRealDevice] = createRemoteDebugger.getCall(i).args;
        assert.equal(actualRealDevice, realDevice);
        assert.deepEqual(opts.webInspectorSettings, policy);
        assert.notEqual(opts.webInspectorSettings, policy);
        assert.notEqual(opts.webInspectorSettings.pageSettings, policy.pageSettings);
        if (realDevice) {
          assert.equal(opts.transport, transport);
          assert.equal(opts.udid, 'test-device');
        } else {
          assert.equal(opts.socketPath, '/tmp/inspector.sock');
        }
        // A consumer modifying its copy must not affect saved or future settings.
        opts.webInspectorSettings.pageSettings.WebSecurityEnabled = true;
        assert.deepEqual((await driver.getSettings()).webInspectorSettings, policy);
      }
      sinon.assert.callCount(realDevice ? getTier : socket, 2);
      sinon.assert.notCalled(realDevice ? socket : getTier);
      sinon.assert.notCalled(proxy);
    });
  }

  it('isolates the default policy from consumers and other sessions', async function () {
    const first = new XCUITestDriver({} as any);
    const second = new XCUITestDriver({} as any);
    sinon.stub(first, 'isRealDevice').returns(false);
    sinon.stub(first, 'isSafari').returns(true);
    sinon.stub(first, 'device').get(() => ({getWebInspectorSocket: async () => '/tmp/inspector.sock'}));
    await first.getNewRemoteDebugger();
    createRemoteDebugger.firstCall.args[0].webInspectorSettings.userAgent = 'Changed';
    assert.deepEqual((await first.getSettings()).webInspectorSettings, {});
    assert.deepEqual((await second.getSettings()).webInspectorSettings, {});
  });

  it('replaces and clears the policy on an existing debugger without sending it to WDA', async function () {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    driver._remote = new RemoteDebugger({log: driver.log});
    const setter = sinon.spy(driver._remote, 'setWebInspectorPageSettings');
    await driver.updateSettings({webInspectorSettings: {pageSettings: {ImagesEnabled: false}}});
    await driver.updateSettings({webInspectorSettings: {userPreferences: {PrefersColorScheme: 'Dark'}}});
    sinon.assert.calledWithExactly(setter, {
      userPreferences: {PrefersColorScheme: 'Dark'},
    });
    assert.deepEqual((await driver.getSettings()).webInspectorSettings, {
      userPreferences: {PrefersColorScheme: 'Dark'},
    });
    await driver.updateSettings({webInspectorSettings: {}});
    sinon.assert.calledWithExactly(setter, {});
    assert.deepEqual((await driver.getSettings()).webInspectorSettings, {});
    sinon.assert.calledThrice(setter);
    sinon.assert.notCalled(proxy);
  });

  for (const value of [
    null,
    [],
    {pageSettings: {WebSecurityEnabled: 'false'}},
    {userPreferences: {PrefersColorScheme: 'dark'}},
    {unknown: true},
  ]) {
    it(`rejects invalid input before attachment: ${JSON.stringify(value)}`, async function () {
      const driver = new XCUITestDriver({} as any);
      await assert.rejects(driver.updateSettings({webInspectorSettings: value}), TypeError);
      assert.deepEqual((await driver.getSettings()).webInspectorSettings, {});
    });
  }

  it('keeps the previous setting when the debugger rejects an update', async function () {
    const driver = new XCUITestDriver({} as any);
    const previous = {pageSettings: {ImagesEnabled: false}};
    await driver.updateSettings({webInspectorSettings: previous});
    driver._remote = new RemoteDebugger({
      log: driver.log,
      webInspectorSettings: previous,
    });
    sinon.stub(driver._remote, 'setWebInspectorPageSettings').rejects(new Error('Unsupported override'));
    await assert.rejects(driver.updateSettings({webInspectorSettings: {userAgent: 'Test'}}), /Unsupported override/);
    assert.deepEqual((await driver.getSettings()).webInspectorSettings, previous);
  });
});
