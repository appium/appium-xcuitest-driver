import {setTimeout as delay} from 'node:timers/promises';

import type {AppiumLogger, IAppiumIpc, IIpcSubscription, IpcMessage} from '@appium/types';
import {node, util} from 'appium/support.js';
import {waitForCondition} from 'asyncbox';

import type {XCUITestDriver} from './driver.js';
import {memoize} from './utils/index.js';

export type SessionUdidIpcMessage = {
  udid: string;
  sessionId: string;
};

type AppiumIpcConstructor = new () => IAppiumIpc;
type IpcProvider = () => Promise<IAppiumIpc | undefined>;

export class SessionClaimHandler {
  static readonly CLAIMED_TOPIC = 'xcuitest:sessionUdidClaimed';
  static readonly CONTENDED_TOPIC = 'xcuitest:sessionUdidContended';
  static readonly RELEASED_TOPIC = 'xcuitest:sessionUdidReleased';

  private static readonly CONTENTION_PROBE_MS = 10;
  private static readonly RELEASE_WAIT_MS = 15000;

  private readonly subscriptionsBySessionId = new Map<string, IIpcSubscription<SessionUdidIpcMessage>>();

  constructor(private readonly getIpc: IpcProvider) {}

  /** Subscribe the current session to udid claim messages from other sessions. */
  async registerActiveSession(driver: XCUITestDriver): Promise<void> {
    const ipc = await this.getIpc();
    const udid = driver.opts.udid;
    const sessionId = driver.sessionId;
    if (!ipc || !udid || !sessionId) {
      return;
    }

    this.unregisterActiveSession(driver);

    const subscription = ipc.subscribe<SessionUdidIpcMessage>(
      SessionClaimHandler.CLAIMED_TOPIC,
      this.getPublisherId(driver),
    );
    subscription.on('message', (message) => {
      void this.dispatchSessionUdidMessage(driver, udid, sessionId, message);
    });
    this.subscriptionsBySessionId.set(sessionId, subscription);
  }

  /** Unsubscribe the current session from udid claim messages. */
  unregisterActiveSession(driver: XCUITestDriver): void {
    const sessionId = driver.sessionId;
    if (!sessionId) {
      return;
    }

    this.subscriptionsBySessionId.get(sessionId)?.unsubscribe();
    this.subscriptionsBySessionId.delete(sessionId);
  }

  /** Publish this session's udid so any existing session on the same device can terminate. */
  async claimSessionUdid(driver: XCUITestDriver): Promise<void> {
    const ipc = await this.getIpc();
    if (!ipc) {
      driver.log.debug('Driver-instance IPC is unavailable. Skipping publication of the session udid.');
      return;
    }

    const udid = driver.opts.udid;
    const sessionId = driver.sessionId;
    if (!udid || !sessionId) {
      driver.log.debug('The session udid is not known yet. Skipping udid publication.');
      return;
    }

    const contendingSessionIds = new Set<string>();
    const releasedSessionIds = new Set<string>();
    const contendedSubscription = ipc.subscribe<SessionUdidIpcMessage>(
      SessionClaimHandler.CONTENDED_TOPIC,
      this.getPublisherId(driver),
    );
    const releasedSubscription = ipc.subscribe<SessionUdidIpcMessage>(
      SessionClaimHandler.RELEASED_TOPIC,
      this.getPublisherId(driver),
    );
    contendedSubscription.on('message', (message) => {
      if (this.isMatchingSessionUdidMessage(message, udid, sessionId)) {
        contendingSessionIds.add(message.data.sessionId);
      }
    });
    releasedSubscription.on('message', (message) => {
      if (this.isMatchingSessionUdidMessage(message, udid, sessionId)) {
        releasedSessionIds.add(message.data.sessionId);
      }
    });

    try {
      await ipc.publish<SessionUdidIpcMessage>(SessionClaimHandler.CLAIMED_TOPIC, this.getPublisherId(driver), {
        udid,
        sessionId,
      });
      await delay(SessionClaimHandler.CONTENTION_PROBE_MS);

      if (contendingSessionIds.size === 0) {
        return;
      }

      try {
        await waitForCondition(() => [...contendingSessionIds].every((id) => releasedSessionIds.has(id)), {
          waitMs: SessionClaimHandler.RELEASE_WAIT_MS,
          intervalMs: 50,
        });
        driver.log.debug(
          `Received release confirmation from ` +
            `${util.pluralize('session', contendingSessionIds.size, true)} for udid '${udid}'`,
        );
      } catch {
        const pendingSessionIds = [...contendingSessionIds].filter((id) => !releasedSessionIds.has(id));
        driver.log.warn(
          `Timed out after ${SessionClaimHandler.RELEASE_WAIT_MS}ms waiting for ` +
            `${util.pluralize('session', pendingSessionIds.length, true)} ` +
            `[${pendingSessionIds.join(', ')}] to release udid '${udid}'. ` +
            `Proceeding with session startup.`,
        );
      }
    } finally {
      contendedSubscription.unsubscribe();
      releasedSubscription.unsubscribe();
    }
  }

  /** @internal Exposed for unit tests. */
  resetForTesting(): void {
    for (const subscription of this.subscriptionsBySessionId.values()) {
      subscription.unsubscribe();
    }
    this.subscriptionsBySessionId.clear();
  }

  private async dispatchSessionUdidMessage(
    driver: XCUITestDriver,
    udid: string,
    sessionId: string,
    message: IpcMessage<SessionUdidIpcMessage>,
  ): Promise<void> {
    try {
      await this.handleSessionUdidMessage(driver, udid, message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      driver.log.warn(`Could not handle udid claim IPC message for session '${sessionId}': ${msg}`);
    }
  }

  private async handleSessionUdidMessage(
    driver: XCUITestDriver,
    udid: string,
    message: IpcMessage<SessionUdidIpcMessage>,
  ): Promise<void> {
    if (!this.isMatchingSessionUdidMessage(message, udid, driver.sessionId ?? undefined)) {
      return;
    }

    try {
      await this.publishSessionUdidContended(driver, udid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      driver.log.warn(`Could not publish udid contention message for session '${driver.sessionId}': ${msg}`);
    }

    driver.log.warn(
      `Session '${message.data.sessionId}' is starting on udid '${udid}', which is already in use ` +
        `by another session identified by ${driver.sessionId}. Running multiple parallel sessions on the same ` +
        `device is highly discouraged. Consider enabling the Appium server's '--session-override' flag ` +
        `and make sure to properly quit the previous session before starting a new one. ` +
        `Terminating the obsolete session.`,
    );
    await this.terminateSessionOnRequest(driver, udid);
  }

  private async publishSessionUdidContended(driver: XCUITestDriver, udid: string): Promise<void> {
    const ipc = await this.getIpc();
    const sessionId = driver.sessionId ?? undefined;
    if (!ipc || !udid || !sessionId) {
      return;
    }

    await ipc.publish<SessionUdidIpcMessage>(SessionClaimHandler.CONTENDED_TOPIC, this.getPublisherId(driver), {
      udid,
      sessionId,
    });
  }

  private async terminateSessionOnRequest(driver: XCUITestDriver, udid: string): Promise<void> {
    const sessionId = driver.sessionId ?? undefined;
    const publisherId = sessionId ? this.getPublisherId(driver) : undefined;
    const {log} = driver;

    try {
      await driver.deleteSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Could not terminate session '${sessionId}' on IPC request: ${msg}`);
    }

    await this.publishSessionUdidReleased(log, udid, sessionId, publisherId);
  }

  private async publishSessionUdidReleased(
    log: AppiumLogger,
    udid: string,
    sessionId: string | undefined,
    publisherId: string | undefined,
  ): Promise<void> {
    try {
      const ipc = await this.getIpc();
      if (!ipc || !udid || !sessionId || !publisherId) {
        return;
      }

      await ipc.publish<SessionUdidIpcMessage>(SessionClaimHandler.RELEASED_TOPIC, publisherId, {
        udid,
        sessionId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Could not publish udid release message for session '${sessionId}': ${msg}`);
    }
  }

  private getPublisherId(driver: XCUITestDriver): string {
    return node.getObjectId(driver);
  }

  private isMatchingSessionUdidMessage(
    message: IpcMessage<SessionUdidIpcMessage>,
    udid: string,
    sessionId: string | undefined,
  ): boolean {
    return message.data.udid === udid && message.data.sessionId !== sessionId;
  }
}

const loadSharedIpc = memoize(async function loadSharedIpc(): Promise<IAppiumIpc | undefined> {
  try {
    const {AppiumIpc} = (await import('appium/driver.js')) as {AppiumIpc?: AppiumIpcConstructor};
    return AppiumIpc ? new AppiumIpc() : undefined;
  } catch {
    return undefined;
  }
});

export const sessionClaimHandler = new SessionClaimHandler(loadSharedIpc);

/**
 * @internal Exposed for unit tests.
 */
export function setSharedIpcForTesting(ipc: IAppiumIpc | undefined): void {
  loadSharedIpc.cache.set(undefined, Promise.resolve(ipc));
}

/**
 * @internal Exposed for unit tests.
 */
export function resetDriverInstanceIpcForTesting(): void {
  sessionClaimHandler.resetForTesting();
  loadSharedIpc.cache.clear();
}
