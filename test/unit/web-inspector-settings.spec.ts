import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import {RemoteDebugger, type RemoteDebuggerOptions} from 'appium-remote-debugger';
import sinon from 'sinon';

import {XCUITestDriver} from '../../lib/driver.js';

describe('webInspectorSettings', function () {
  afterEach(function () {
    sinon.restore();
  });

  it('retains settings before attachment and passes them to replacement debuggers', async function () {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    const info = sinon.spy(driver.log, 'info');
    sinon.stub(driver, 'isRealDevice').returns(false);
    sinon.stub(driver, 'isSafari').returns(true);
    sinon.stub(driver, 'device').get(() => ({getWebInspectorSocket: async () => '/tmp/inspector.sock'}));
    const policy = {pageSettings: {WebSecurityEnabled: false}, userAgent: 'Test/1.0'};

    await driver.updateSettings({webInspectorSettings: policy});
    sinon.assert.calledWithMatch(info, 'Remote Debugger version');
    assert.equal(driver._remote, null);
    assert.deepEqual((await driver.getSettings()).webInspectorSettings, policy);
    for (let i = 0; i < 2; i++) {
      const remote = await driver.getNewRemoteDebugger();
      assert.deepEqual((remote as any)._webInspectorSettings, policy);
    }
    sinon.assert.notCalled(proxy);
  });

  it('replaces and clears the policy on an existing debugger without sending it to WDA', async function () {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    driver._remote = new RemoteDebugger({log: driver.log as unknown as RemoteDebuggerOptions['log']});
    const setter = sinon.spy(driver._remote, 'setWebInspectorPageSettings');
    await driver.updateSettings({webInspectorSettings: {pageSettings: {ImagesEnabled: false}}});
    await driver.updateSettings({webInspectorSettings: {userPreferences: {PrefersColorScheme: 'Dark'}}});
    assert.deepEqual((driver._remote as any)._webInspectorSettings, {
      userPreferences: {PrefersColorScheme: 'Dark'},
    });
    await driver.updateSettings({webInspectorSettings: {}});
    assert.deepEqual((driver._remote as any)._webInspectorSettings, {});
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
      log: driver.log as unknown as RemoteDebuggerOptions['log'],
      webInspectorSettings: previous,
    });
    sinon.stub(driver._remote, 'setWebInspectorPageSettings').rejects(new Error('Unsupported override'));
    await assert.rejects(driver.updateSettings({webInspectorSettings: {userAgent: 'Test'}}), /Unsupported override/);
    assert.deepEqual((await driver.getSettings()).webInspectorSettings, previous);
  });
});
