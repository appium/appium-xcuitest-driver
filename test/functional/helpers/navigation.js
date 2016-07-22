async function clickButton (driver, name) {
  let el = (await driver.elementsByXPath(`//XCUIElementTypeButton[@name = '${name}']`))[0];
  if (el && (await el.isDisplayed())) {
    await el.click();
  }
}

async function clickBack (driver) {
  let el = (await driver.elementsByAccessibilityId('Back'))[0];
  if (el && (await el.isDisplayed())) {
    await el.click();
  }
}

export { clickBack, clickButton };
