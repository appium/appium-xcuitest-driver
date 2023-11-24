/**
 * @typedef {Object} AccessibilityAuditItem
 * @property {string} detailedDescription The detailed description of the found accessbility issue.
 * @property {string} compactDescription The compact description of the found accessbility issue.
 * @property {string|number} auditType The name of the audit type this issue belongs to. Could be
 * a number if the type name is unknown.
 * @property {string} element The description of the element this issue was found for.
 */

export default {
  /**
   * Performs accessbility audit of the current application according to the given type or multiple types.
   *
   * @since Xcode 15/iOS 17
   * @param {string[]?} auditTypes - One or more type names to perform the audit for.
   * The full list of available names could be found at
   * https://developer.apple.com/documentation/xctest/xcuiaccessibilityaudittype?language=objc
   * If no type if provided explicitly then XCUIAccessibilityAuditTypeAll is assumed.
   *
   * @returns {Promise<AccessibilityAuditItem[]>} List of found issues or an empty list
   *
   * @this {XCUITestDriver}
   */
  async mobilePerformAccessibilityAudit(auditTypes) {
    return /** @type {AccessibilityAuditItem[]} */ (
      await this.proxyCommand('/wda/performAccessibilityAudit', 'POST', {auditTypes})
    );
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */
