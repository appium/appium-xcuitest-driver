import type {IAppiumIpc, IIpcSubscription, IpcMessage} from '@appium/types';
import {util} from 'appium/support';
import {waitForCondition} from 'asyncbox';
import {setTimeout as delay} from 'node:timers/promises';
import type {XCUITestDriver} from './driver';

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

  private readonly subscriptionsBySessionId = new Map<
    string,
    IIpcSubscription<SessionUdidIpcMessage>
  >();

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
      this.handleSessionUdidMessage(driver, udid, message);
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
      driver.log.debug(
        'Driver-instance IPC is unavailable. Skipping publication of the session udid.',
      );
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

    await ipc.publish<SessionUdidIpcMessage>(
      SessionClaimHandler.CLAIMED_TOPIC,
      this.getPublisherId(driver),
      {
        udid,
        sessionId,
      },
    );
    await delay(SessionClaimHandler.CONTENTION_PROBE_MS);
    contendedSubscription.unsubscribe();

    if (contendingSessionIds.size === 0) {
      releasedSubscription.unsubscribe();
      return;
    }

    try {
      await waitForCondition(
        () => [...contendingSessionIds].every((id) => releasedSessionIds.has(id)),
        {
          waitMs: SessionClaimHandler.RELEASE_WAIT_MS,
          intervalMs: 50,
        },
      );
      driver.log.debug(
        `Received release confirmation from ${util.pluralize('session', contendingSessionIds.size, true)} for udid '${udid}'`,
      );
    } catch {
      const pendingSessionIds = [...contendingSessionIds].filter(
        (id) => !releasedSessionIds.has(id),
      );
      driver.log.warn(
        `Timed out after ${SessionClaimHandler.RELEASE_WAIT_MS}ms waiting for ${util.pluralize('session', pendingSessionIds.length, true)} ` +
          `[${pendingSessionIds.join(', ')}] to release udid '${udid}'. Proceeding with session startup.`,
      );
    } finally {
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

  private handleSessionUdidMessage(
    driver: XCUITestDriver,
    udid: string,
    message: IpcMessage<SessionUdidIpcMessage>,
  ): void {
    if (!this.isMatchingSessionUdidMessage(message, udid, driver.sessionId ?? undefined)) {
      return;
    }

    void this.publishSessionUdidContended(driver, udid);
    driver.log.warn(
      `Session '${message.data.sessionId}' is starting on udid '${udid}', which is already in use ` +
        `by another session identified by ${driver.sessionId}. Running multiple parallel sessions on the same ` +
        `device is highly discouraged. Consider enabling the Appium server's '--session-override' flag ` +
        `and make sure to properly quit the previous session before starting a new one. ` +
        `Terminating the obsolete session.`,
    );
    void this.terminateSessionOnRequest(driver, udid);
  }

  private async publishSessionUdidContended(driver: XCUITestDriver, udid: string): Promise<void> {
    const ipc = await this.getIpc();
    const sessionId = driver.sessionId ?? undefined;
    if (!ipc || !udid || !sessionId) {
      return;
    }

    await ipc.publish<SessionUdidIpcMessage>(
      SessionClaimHandler.CONTENDED_TOPIC,
      this.getPublisherId(driver),
      {
        udid,
        sessionId,
      },
    );
  }

  private async terminateSessionOnRequest(driver: XCUITestDriver, udid: string): Promise<void> {
    const sessionId = driver.sessionId ?? undefined;
    try {
      await driver.deleteSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      driver.log.warn(`Could not terminate session '${sessionId}' on IPC request: ${msg}`);
    } finally {
      await this.publishSessionUdidReleased(driver, udid, sessionId);
    }
  }

  private async publishSessionUdidReleased(
    driver: XCUITestDriver,
    udid: string,
    sessionId: string | undefined,
  ): Promise<void> {
    const ipc = await this.getIpc();
    if (!ipc || !udid || !sessionId) {
      return;
    }

    await ipc.publish<SessionUdidIpcMessage>(
      SessionClaimHandler.RELEASED_TOPIC,
      this.getPublisherId(driver),
      {
        udid,
        sessionId,
      },
    );
  }

  private getPublisherId(driver: XCUITestDriver): string {
    return `xcuitest-driver@${driver.sessionId ?? 'unknown'}`;
  }

  private isMatchingSessionUdidMessage(
    message: IpcMessage<SessionUdidIpcMessage>,
    udid: string,
    sessionId: string | undefined,
  ): boolean {
    return message.data.udid === udid && message.data.sessionId !== sessionId;
  }
}

let sharedIpc: IAppiumIpc | undefined;
let sharedIpcLoaded = false;
let sharedIpcLoadPromise: Promise<IAppiumIpc | undefined> | undefined;

async function resolveSharedIpc(): Promise<IAppiumIpc | undefined> {
  if (sharedIpcLoaded) {
    return sharedIpc;
  }
  sharedIpcLoadPromise ??= loadSharedIpc();
  return sharedIpcLoadPromise;
}

async function loadSharedIpc(): Promise<IAppiumIpc | undefined> {
  try {
    const {AppiumIpc} = (await import('appium/driver.js')) as {AppiumIpc?: AppiumIpcConstructor};
    sharedIpc = AppiumIpc ? new AppiumIpc() : undefined;
  } catch {
    sharedIpc = undefined;
  }
  sharedIpcLoaded = true;
  return sharedIpc;
}

export const sessionClaimHandler = new SessionClaimHandler(resolveSharedIpc);

export const SESSION_UDID_CLAIMED_IPC_TOPIC = SessionClaimHandler.CLAIMED_TOPIC;
export const SESSION_UDID_CONTENDED_IPC_TOPIC = SessionClaimHandler.CONTENDED_TOPIC;
export const SESSION_UDID_RELEASED_IPC_TOPIC = SessionClaimHandler.RELEASED_TOPIC;

/**
 * @internal Exposed for unit tests.
 */
export function setSharedIpcForTesting(ipc: IAppiumIpc | undefined): void {
  sharedIpc = ipc;
  sharedIpcLoaded = true;
  sharedIpcLoadPromise = Promise.resolve(ipc);
}

/**
 * @internal Exposed for unit tests.
 */
export function resetDriverInstanceIpcForTesting(): void {
  sessionClaimHandler.resetForTesting();
  sharedIpc = undefined;
  sharedIpcLoaded = false;
  sharedIpcLoadPromise = undefined;
}
