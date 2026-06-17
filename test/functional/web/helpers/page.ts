import {retry, retryInterval} from 'asyncbox';
import type {Browser} from 'webdriverio';

export async function spinTitle(driver: Browser): Promise<string> {
  const title = await retry(10, async function () {
    const value = await driver.getTitle();
    if (value == null) {
      throw new Error('Did not get a page title');
    }
    return value;
  });
  if (title == null) {
    throw new Error('Did not get a page title');
  }
  return title;
}

export async function spinBodyIncludes(driver: Browser, expected: string): Promise<void> {
  await retry(10, async function () {
    const el = await driver.$('//body');
    const body = await el.getHTML();
    if (!body.includes(expected)) {
      throw new Error(`Could not find '${expected}' in the page body. Found: '${body}'`);
    }
  });
}

export async function spinTitleEquals(
  driver: Browser,
  expectedTitle: string,
  tries = 10,
  interval = 500,
): Promise<void> {
  await retryInterval(tries, interval, async function () {
    const title = await spinTitle(driver);
    if (title !== expectedTitle) {
      throw new Error(`Could not find expected title: '${expectedTitle}'. Found: '${title}'`);
    }
  });
}

export async function spinWait(
  fn: () => Promise<void>,
  waitMs = 10000,
  intMs = 500,
): Promise<void> {
  const tries = parseInt(String(waitMs / intMs), 10);
  await retryInterval(tries, intMs, fn);
}

export async function resetWindows(driver: Browser): Promise<void> {
  const handles = await driver.getWindowHandles();
  if (handles.length <= 1) {
    return;
  }
  await driver.switchToWindow(handles[0]);
  for (let i = handles.length - 1; i >= 1; i--) {
    await driver.switchToWindow(handles[i]);
    await driver.closeWindow();
  }
  await driver.switchToWindow(handles[0]);
}

export async function openPage(
  driver: Browser,
  url: string,
  tries = 10,
  interval = 500,
): Promise<void> {
  async function spinTitleNotEquals(wrongTitle: string): Promise<void> {
    await retryInterval(tries, interval, async function () {
      const title = await spinTitle(driver);
      if (title === wrongTitle) {
        throw new Error(`Found title we did not expect: '${title}'`);
      }
    });
  }

  await retryInterval(tries, interval, async function () {
    await driver.navigateTo(url);
    await spinTitleNotEquals('cannot open page');
  });
}
