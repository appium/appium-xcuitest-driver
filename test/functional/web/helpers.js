import { retry } from 'asyncbox';
import { HOST, PORT } from '../helpers/session';


const GUINEA_PIG_PAGE = `http://${HOST}:${PORT}/test/guinea-pig`;

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

export { spinTitle, GUINEA_PIG_PAGE };
