import {EventEmitter} from 'node:events';

import type {IAppiumIpc, IpcData, IpcMessage} from '@appium/types';
import {node} from 'appium/support';
import {expect} from 'chai';
import {createSandbox} from 'sinon';
import type sinon from 'sinon';

import type {XCUITestDriver} from '../../lib/driver';
import {
  resetDriverInstanceIpcForTesting,
  SessionClaimHandler,
  sessionClaimHandler,
  setSharedIpcForTesting,
} from '../../lib/session-claim-handler';

class MockIpcSubscription extends EventEmitter {
  isActive = true;

  constructor(public topic: string) {
    super();
  }

  unsubscribe(): boolean {
    if (!this.isActive) {
      return false;
    }
    this.isActive = false;
    this.removeAllListeners();
    return true;
  }
}

/* eslint-disable @typescript-eslint/no-unused-vars */
class MockIpc {
  subscriptions: MockIpcSubscription[] = [];
  lastMessages = new Map<string, IpcMessage<IpcData>>();

  subscribe<T extends IpcData>(topic: string, _subscriber: string): MockIpcSubscription {
    const subscription = new MockIpcSubscription(topic);
    this.subscriptions.push(subscription);
    return subscription;
  }

  unsubscribe(_topic: string, _subscriber: string): boolean {
    return false;
  }

  getMessage<T extends IpcData>(topic: string): IpcMessage<T> | undefined {
    return this.lastMessages.get(topic) as IpcMessage<T> | undefined;
  }

  async publish<T extends IpcData>(topic: string, publisher: string, data: T): Promise<void> {
    const message: IpcMessage<T> = {
      publisher,
      timestampMs: Date.now(),
      topic,
      data,
    };
    this.lastMessages.set(topic, message);
    for (const subscription of this.subscriptions) {
      if (subscription.topic === topic) {
        subscription.emit('message', message);
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */

describe('SessionClaimHandler', function () {
  let sandbox;
  let mockIpc: MockIpc;

  beforeEach(function () {
    sandbox = createSandbox();
    mockIpc = new MockIpc();
    setSharedIpcForTesting(mockIpc as unknown as IAppiumIpc);
  });

  afterEach(function () {
    sandbox.restore();
    resetDriverInstanceIpcForTesting();
  });

  function makeDriver(overrides: Partial<XCUITestDriver> = {}): XCUITestDriver {
    return {
      sessionId: 'new-session',
      opts: {
        udid: 'device-1',
      },
      log: {
        info: sandbox.stub(),
        debug: sandbox.stub(),
        warn: sandbox.stub(),
      },
      deleteSession: sandbox.stub().resolves(),
      ...overrides,
    } as unknown as XCUITestDriver;
  }

  it('should terminate an existing session when another session publishes the same udid', async function () {
    const oldDriver = makeDriver({
      sessionId: 'old-session',
      opts: {udid: 'device-1'} as any,
    });
    oldDriver.deleteSession = sandbox.stub().callsFake(async () => {
      sessionClaimHandler.unregisterActiveSession(oldDriver);
    });
    await sessionClaimHandler.registerActiveSession(oldDriver);
    await sessionClaimHandler.claimSessionUdid(oldDriver);

    const newDriver = makeDriver();
    await sessionClaimHandler.registerActiveSession(newDriver);
    await sessionClaimHandler.claimSessionUdid(newDriver);

    expect((oldDriver.deleteSession as sinon.SinonStub).calledOnce).to.be.true;
    expect((oldDriver.log.warn as sinon.SinonStub).calledWithMatch(/highly discouraged/)).to.be
      .true;
    expect((newDriver.deleteSession as sinon.SinonStub).called).to.be.false;
    expect(mockIpc.getMessage(SessionClaimHandler.RELEASED_TOPIC)?.data).to.eql({
      udid: 'device-1',
      sessionId: 'old-session',
    });
    expect(
      (newDriver.log.debug as sinon.SinonStub).calledWithMatch(
        /Received release confirmation from 1 session for udid/,
      ),
    ).to.be.true;
  });

  it('should not wait for release confirmation when no session contends for the udid', async function () {
    const newDriver = makeDriver();
    const startMs = Date.now();

    await sessionClaimHandler.registerActiveSession(newDriver);
    await sessionClaimHandler.claimSessionUdid(newDriver);

    expect(Date.now() - startMs).to.be.lessThan(200);
  });

  it('should wait for all contending sessions to release the udid', async function () {
    const oldDrivers = await Promise.all(
      ['old-session-1', 'old-session-2'].map(async (sessionId) => {
        const oldDriver = makeDriver({
          sessionId,
          opts: {udid: 'device-1'} as any,
        });
        oldDriver.deleteSession = sandbox.stub().callsFake(async () => {
          sessionClaimHandler.unregisterActiveSession(oldDriver);
        });
        await sessionClaimHandler.registerActiveSession(oldDriver);
        return oldDriver;
      }),
    );

    const newDriver = makeDriver({sessionId: 'new-session'});
    await sessionClaimHandler.registerActiveSession(newDriver);
    await sessionClaimHandler.claimSessionUdid(newDriver);

    for (const oldDriver of oldDrivers) {
      expect((oldDriver.deleteSession as sinon.SinonStub).calledOnce).to.be.true;
    }
    expect(
      (newDriver.log.debug as sinon.SinonStub).calledWithMatch(
        /Received release confirmation from 2 sessions for udid/,
      ),
    ).to.be.true;
  });

  it('should publish a contended message before terminating an obsolete session', async function () {
    const callOrder: string[] = [];
    const publish = sandbox.spy(mockIpc, 'publish');
    const oldDriver = makeDriver({
      sessionId: 'old-session',
      opts: {udid: 'device-1'} as any,
    });
    oldDriver.deleteSession = sandbox.stub().callsFake(async () => {
      callOrder.push('deleteSession');
      sessionClaimHandler.unregisterActiveSession(oldDriver);
    });
    await sessionClaimHandler.registerActiveSession(oldDriver);

    const newDriver = makeDriver();
    await sessionClaimHandler.registerActiveSession(newDriver);
    await sessionClaimHandler.claimSessionUdid(newDriver);

    const contendedCallIndex = publish
      .getCalls()
      .findIndex((call) => call.args[0] === SessionClaimHandler.CONTENDED_TOPIC);
    expect(contendedCallIndex).to.be.greaterThan(-1);
    expect(callOrder).to.eql(['deleteSession']);
    expect(contendedCallIndex).to.be.lessThan(
      publish.getCalls().findIndex((call) => call.args[0] === SessionClaimHandler.RELEASED_TOPIC),
    );
  });

  it('should publish the session udid on the shared driver IPC topic', async function () {
    const publish = sandbox.spy(mockIpc, 'publish');
    const newDriver = makeDriver();

    await sessionClaimHandler.registerActiveSession(newDriver);
    publish.resetHistory();
    await sessionClaimHandler.claimSessionUdid(newDriver);

    expect(publish.firstCall.args).to.eql([
      SessionClaimHandler.CLAIMED_TOPIC,
      node.getObjectId(newDriver),
      {
        udid: 'device-1',
        sessionId: 'new-session',
      },
    ]);
  });

  it('should ignore udid publications from the same session', async function () {
    const driver = makeDriver({sessionId: 'session-1'});
    await sessionClaimHandler.registerActiveSession(driver);
    await sessionClaimHandler.claimSessionUdid(driver);

    expect((driver.deleteSession as sinon.SinonStub).called).to.be.false;
  });

  it('should unregister IPC subscriptions on session cleanup', async function () {
    const driver = makeDriver({sessionId: 'session-1'});
    await sessionClaimHandler.registerActiveSession(driver);
    expect(mockIpc.subscriptions).to.have.length(1);
    expect(mockIpc.subscriptions[0].isActive).to.be.true;

    sessionClaimHandler.unregisterActiveSession(driver);
    expect(mockIpc.subscriptions[0].isActive).to.be.false;
  });

  it('should unsubscribe contention listeners when claim publication fails', async function () {
    sandbox.stub(mockIpc, 'publish').rejects(new Error('publish failed'));
    const newDriver = makeDriver();

    await sessionClaimHandler.registerActiveSession(newDriver);
    const activeSubscriptionsBeforeClaim = mockIpc.subscriptions.filter(
      (subscription) => subscription.isActive,
    ).length;

    await expect(sessionClaimHandler.claimSessionUdid(newDriver)).to.be.rejectedWith(
      'publish failed',
    );

    expect(mockIpc.subscriptions.filter((subscription) => subscription.isActive)).to.have.length(
      activeSubscriptionsBeforeClaim,
    );
  });
});
