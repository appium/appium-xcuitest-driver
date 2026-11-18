import type {XCUITestDriver} from '../../driver.js';

/**
 * Checks whether any BiDi client is subscribed to the event or to its whole module.
 *
 * @param driver - The driver instance
 * @param method - Fully qualified event name, e.g. `log.entryAdded`
 * @param context - If set, only subscriptions that cover this context (or all contexts) count
 */
export function hasSubscribers(driver: XCUITestDriver, method: string, context?: string): boolean {
  const moduleName = method.split('.')[0];
  return [method, moduleName].some((e) => {
    const contexts = driver.bidiEventSubs[e];
    return Boolean(contexts?.length) && (context === undefined || contexts.includes('') || contexts.includes(context));
  });
}
