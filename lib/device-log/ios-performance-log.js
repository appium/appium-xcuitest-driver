import {logger} from 'appium/support';
import _ from 'lodash';
import IOSLog from './ios-log';

const log = logger.getLogger('IOSPerformanceLog');
const MAX_EVENTS = 5000;

class IOSPerformanceLog extends IOSLog {
  constructor(remoteDebugger, maxEvents = MAX_EVENTS) {
    super(maxEvents);
    this.remoteDebugger = remoteDebugger;
    this.maxEvents = parseInt(String(maxEvents), 10);
    this._started = false;
  }

  /**
   * @override
   */
  async startCapture() {
    log.debug('Starting performance (Timeline) log capture');
    this._clearEntries();
    const result = await this.remoteDebugger.startTimeline(this.onTimelineEvent.bind(this));
    this._started = true;
    return result;
  }

  /**
   * @override
   */
  async stopCapture() {
    log.debug('Stopping performance (Timeline) log capture');
    const result = await this.remoteDebugger.stopTimeline();
    this._started = false;
    return result;
  }

  /**
   * @override
   */
  get isCapturing() {
    return this._started;
  }

  /**
   * @override
   */
  _serializeEntry(value) {
    return value;
  }

  /**
   * @override
   */
  _deserializeEntry(value) {
    return value;
  }

  /**
   *
   * @param {import('../commands/types').LogEntry} event
   */
  onTimelineEvent(event) {
    log.debug(`Received Timeline event: ${_.truncate(JSON.stringify(event))}`);
    this.broadcast(event);
  }
}

export {IOSPerformanceLog};
export default IOSPerformanceLog;
