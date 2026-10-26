import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NotificationClient} from '../../../lib/device/notification-client.js';

describe('NotificationClient', function () {
  it('subscribes first and waits for the notification separately', async function () {
    const calls: string[] = [];
    const service = {
      observe: sinon.stub().callsFake(async () => void calls.push('observe')),
      expectNotification: sinon.stub().callsFake(async () => void calls.push('expect')),
      close: sinon.stub(),
    };
    const facade = {
      requireService: async (_feature: string, op: any) =>
        await op({startNotificationProxyService: async () => service}, {transport: 'tunnel'}),
    };
    const client = await NotificationClient.create('udid', {facade: facade as any, logger: {} as any});

    await client.observe('com.apple.mobile.application_installed');
    assert.deepStrictEqual(calls, ['observe']);
    await client.expectNotification(5000);

    assert.deepStrictEqual(calls, ['observe', 'expect']);
    assert.deepStrictEqual(service.observe.firstCall.args, ['com.apple.mobile.application_installed']);
    assert.deepStrictEqual(service.expectNotification.firstCall.args, [5000]);
  });

  it('rejects when the notification does not arrive', async function () {
    const service = {
      observe: sinon.stub().resolves(),
      expectNotification: sinon.stub().rejects(new Error('timed out')),
      close: sinon.stub(),
    };
    const facade = {
      requireService: async (_feature: string, op: any) =>
        await op({startNotificationProxyService: async () => service}, {transport: 'tunnel'}),
    };
    const client = await NotificationClient.create('udid', {facade: facade as any, logger: {} as any});

    await assert.rejects(client.expectNotification(), /timed out/);
  });
});
