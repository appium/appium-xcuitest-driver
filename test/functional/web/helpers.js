import { retry, retryInterval } from 'asyncbox';
import { HOST, PORT } from '../helpers/session';
import { util } from 'appium-support';


const LOCAL_BASE_END_POINT = `http://${process.env.REAL_DEVICE ? util.localIp() : HOST}:${PORT}`;
const REMOTE_BASE_END_POINT = `http://127.0.0.1:4443`;
const BASE_END_POINT = process.env.CLOUD ? REMOTE_BASE_END_POINT : LOCAL_BASE_END_POINT;
const TEST_END_POINT = `${BASE_END_POINT}/test`;
const GUINEA_PIG_PAGE = `${TEST_END_POINT}/guinea-pig`;
const GUINEA_PIG_SCROLLABLE_PAGE = `${GUINEA_PIG_PAGE}-scrollable`;
const GUINEA_PIG_APP_BANNER_PAGE = `${GUINEA_PIG_PAGE}-app-banner`;
const GUINEA_PIG_FRAME_PAGE = `${TEST_END_POINT}/frameset.html`;
const GUINEA_PIG_IFRAME_PAGE = `${TEST_END_POINT}/iframes.html`;
const PHISHING_END_POINT = 'http://malware.testing.google.test/testing/malware/*';
const APPIUM_IMAGE = `${BASE_END_POINT}/appium.png`;

async function spinTitle (driver) {
  return await retry(10, async function () {
    const title = await driver.title();
    if (!title) {
      throw new Error('did not get page title');
    }
    return title;
  });
}

async function spinTitleEquals (driver, expectedTitle, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    const title = await spinTitle(driver);
    if (title !== expectedTitle) {
      throw new Error(`Could not find expected title. Found: '${title}'`);
    }
  });
}

async function spinTitleNotEquals (driver, wrongTitle, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    const title = await spinTitle(driver);
    if (title === wrongTitle) {
      throw new Error(`Found title we did not expect: '${title}'`);
    }
  });
}

async function spinWait (fn, waitMs = 10000, intMs = 500) {
  const tries = parseInt(waitMs / intMs, 10);
  await retryInterval(tries, intMs, fn);
}

async function openPage (driver, url, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    await driver.get(url);
    await spinTitleNotEquals(driver, 'cannot open page');
  });
}

export { spinTitle, spinTitleEquals, spinWait, openPage, GUINEA_PIG_PAGE,
  GUINEA_PIG_FRAME_PAGE, GUINEA_PIG_IFRAME_PAGE, PHISHING_END_POINT,
  APPIUM_IMAGE, GUINEA_PIG_SCROLLABLE_PAGE, GUINEA_PIG_APP_BANNER_PAGE };
