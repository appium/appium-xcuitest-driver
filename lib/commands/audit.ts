import type {XCUITestDriver} from '../driver';
import type {AccessibilityAuditItem} from './types';

/**
 * Performs accessibility audit of the current application according to the given type or multiple types.
 *
 * @since Xcode 15/iOS 17
 * @param auditTypes - One or more type names to perform the audit for.
 * The full list of available names could be found at
 * https://developer.apple.com/documentation/xctest/xcuiaccessibilityaudittype?language=objc
 * If no type if provided explicitly then XCUIAccessibilityAuditTypeAll is assumed.
 *
 * @returns List of found issues or an empty list
 */
export async function mobilePerformAccessibilityAudit(
  this: XCUITestDriver,
  auditTypes?: string[],
): Promise<AccessibilityAuditItem[]> {
  return await this.proxyCommand<{auditTypes?: string[]}, AccessibilityAuditItem[]>(
    '/wda/performAccessibilityAudit',
    'POST',
    {auditTypes},
  );
}
