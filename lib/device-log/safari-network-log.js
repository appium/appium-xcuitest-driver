import _ from 'lodash';
import URL from 'url';
import { util } from 'appium-support';
import { RotatingLog, MAX_LOG_ENTRIES_COUNT } from './rotating-log';


class SafariNetworkLog extends RotatingLog {
  constructor (showLogs) {
    super(showLogs, 'SafariNetwork');
  }

  getEntry (requestId) {
    let outputEntry;
    while (this.logs.length >= MAX_LOG_ENTRIES_COUNT) {
      // pull the first entry, which is the oldest
      const entry = this.logs.shift();
      if (entry && entry.requestId === requestId) {
        // we are adding to an existing entry, and it was almost removed
        // add to the end of the list and try again
        outputEntry = entry;
        this.logs.push(outputEntry);
        continue;
      }
      // we've removed an element, so the count is down one
      if (this.logIdxSinceLastRequest > 0) {
        this.logIdxSinceLastRequest--;
      }
    }


    if (!outputEntry) {
      // we do not yes have an entry to associate this bit of output with
      // most likely the entry will be at the end of the list, so start there
      for (let i = this.logs.length - 1; i >= 0; i--) {
        if (this.logs[i].requestId === requestId) {
          // found it!
          outputEntry = this.logs[i];
          // this is now the most current entry, so remove it from the list
          // to be added to the end below
          this.logs.splice(i, 1);
          break;
        }
      }

      // nothing has been found, so create a new entry
      if (!outputEntry) {
        outputEntry = {
          requestId,
          logs: [],
        };
      }

      // finally, add the entry to the end of the list
      this.logs.push(outputEntry);
    }

    return outputEntry;
  }

  addLogLine (method, out) {
    if (!this.isCapturing && !this.showLogs) {
      // neither capturing nor displaying, so do nothing
      return;
    }

    if (['Network.dataReceived'].includes(method)) {
      // status update, no need to handle
      return;
    }

    // events we care about:
    //   Network.requestWillBeSent
    //   Network.responseReceived
    //   Network.loadingFinished
    //   Network.loadingFailed

    const outputEntry = this.getEntry(out.requestId);
    if (this.isCapturing) {
      // now add the output we just received to the logs for this particular entry
      outputEntry.logs = outputEntry.logs || [];

      outputEntry.logs.push(out);
    }

    // if we are not displaying the logs,
    // or we are not finished getting events for this network call,
    // we are done
    if (!this.showLogs) {
      return;
    }

    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      this.printLogLine(outputEntry);
    }
  }

  getLogDetails (outputEntry) {
    // extract the data
    const record = outputEntry.logs.reduce(function getRecord (record, entry) {
      record.requestId = entry.requestId;
      if (entry.response) {
        const url = URL.parse(entry.response.url);
        // get the last part of the url, along with the query string, if possible
        record.name = `${_.last(url.pathname.split('/'))}${url.search ? `?${url.search}` : ''}` || url.host;
        record.status = entry.response.status;
        if (entry.response.timing) {
          record.time = entry.response.timing.receiveHeadersEnd
            || entry.response.timing.responseStart
            || 0;
        }
        record.source = entry.response.source;
      }
      if (entry.type) {
        record.type = entry.type;
      }
      if (entry.initiator) {
        record.initiator = entry.initiator;
      }
      if (entry.metrics) {
        // Safari has a `metrics` object on it's `Network.loadingFinished` event
        record.size = entry.metrics.responseBodyBytesReceived || 0;
      }
      if (entry.errorText) {
        record.errorText = entry.errorText;
        // When a network call is cancelled, Safari returns `cancelled` as error text
        // but has a boolean `canceled`. Normalize the two spellings in favor of
        // the text, which will also be displayed
        record.cancelled = entry.canceled;
      }
      return record;
    }, {});

    return record;
  }

  printLogLine (outputEntry) {
    const {
      requestId,
      name,
      status,
      type,
      initiator = {},
      size = 0,
      time = 0,
      source,
      errorText,
      cancelled = false,
    } = this.getLogDetails(outputEntry);

    // print out the record, formatted appropriately
    this.log.debug(`Network event:`);
    this.log.debug(`  Id: ${requestId}`);
    this.log.debug(`  Name: ${name}`);
    this.log.debug(`  Status: ${status}`);
    this.log.debug(`  Type: ${type}`);
    this.log.debug(`  Initiator: ${initiator.type}`);
    for (const line of (initiator.stackTrace || [])) {
      const functionName = line.functionName || '(anonymous)';

      const url = (!line.url || line.url === '[native code]')
        ? ''
        : `@${_.last((URL.parse(line.url).pathname || '').split('/'))}:${line.lineNumber}`;
      this.log.debug(`    ${_.padEnd(_.truncate(functionName, {length: 20}), 21)} ${url}`);
    }
    // get `memory-cache` or `disk-cache`, etc., right
    const sizeStr = source.includes('cache') ? ` (from ${source.replace('-', ' ')})` : `${size}B`;
    this.log.debug(`  Size: ${sizeStr}`);
    this.log.debug(`  Time: ${Math.round(time)}ms`);
    if (errorText) {
      this.log.debug(`  Error: ${errorText}`);
    }
    if (util.hasValue(cancelled)) {
      this.log.debug(`  Cancelled: ${cancelled}`);
    }
  }

  async getLogs () {
    const logs = await super.getLogs();
    // in order to satisfy certain clients, we need to have a basic structure
    // to the results, with `level`, `timestamp`, and `message`, which is
    // all the information stringified
    return logs.map(function adjustEntry (entry) {
      return Object.assign({}, entry, {
        level: 'INFO',
        timestamp: Date.now(),
        message: JSON.stringify(entry),
      });
    });
  }
}

export { SafariNetworkLog };
export default SafariNetworkLog;
