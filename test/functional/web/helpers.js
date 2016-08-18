import { retry } from 'asyncbox';
import { HOST, PORT } from '../helpers/session';


const TEST_END_POINT = `http://${HOST}:${PORT}/test`;
const GUINEA_PIG_PAGE = `${TEST_END_POINT}/guinea-pig`;
const GUINEA_PIG_FRAME_PAGE = `${TEST_END_POINT}/frameset.html`;
const GUINEA_PIG_IFRAME_PAGE = `${TEST_END_POINT}/iframes.html`;
const PHISHING_END_POINT = TEST_END_POINT.replace('http://', 'http://foo:bar@');

async function spinTitle (driver) {
  let title = await retry(10, async () => {
    let title = await driver.title();
    if (!title) {
      throw new Error('did not get page title');
    }
    return title;
  });

  return title;
}

async function spinTitleEquals (driver, expectedTitle, tries = 90) {
  await retry(tries, async () => {
    let title = await spinTitle(driver);
    if (title !== expectedTitle) {
      throw new Error(`Could not find expected title. Found: '${title}'`);
    }
  });
}

async function spinWait (fn, waitMs = 10000, intMs = 500) {
  let end = Date.now() + waitMs;
  let spin = async () => {
    try {
      await fn();
    } catch (err) {
      if (Date.now() > end) {
        throw new Error(`Condition unfulfilled. Error: ${err}`);
      }

      return setTimeout(async () => await spin(), intMs);
    }
  };
  await spin();
}

export { spinTitle, spinTitleEquals, spinWait, GUINEA_PIG_PAGE,
         GUINEA_PIG_FRAME_PAGE, GUINEA_PIG_IFRAME_PAGE, PHISHING_END_POINT};
