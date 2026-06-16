import {retry, retryInterval} from 'asyncbox';

export async function spinTitle(driver) {
  return await retry(10, async function () {
    const title = await driver.getTitle();
    if (title == null) {
      throw new Error('Did not get a page title');
    }
    return title;
  });
}

export async function spinBodyIncludes(driver, expected) {
  return await retry(10, async function () {
    const el = await driver.$('//body');
    const body = await el.getHTML();
    if (!body.includes(expected)) {
      throw new Error(`Could not find '${expected}' in the page body. Found: '${body}'`);
    }
  });
}

export async function spinTitleEquals(driver, expectedTitle, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    const title = await spinTitle(driver);
    if (title !== expectedTitle) {
      throw new Error(`Could not find expected title: '${expectedTitle}'. Found: '${title}'`);
    }
  });
}

export async function spinWait(fn, waitMs = 10000, intMs = 500) {
  const tries = parseInt(String(waitMs / intMs), 10);
  await retryInterval(tries, intMs, fn);
}

export async function openPage(driver, url, tries = 10, interval = 500) {
  async function spinTitleNotEquals(wrongTitle) {
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
