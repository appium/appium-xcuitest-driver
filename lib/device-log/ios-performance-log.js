import { logger } from 'appium-support';
import _ from 'lodash';

const log = logger.getLogger('IOSPerformanceLog');
const MAX_EVENTS = 5000;

class IOSPerformanceLog {
  constructor (remoteDebugger, maxEvents = MAX_EVENTS) {
    this.remoteDebugger = remoteDebugger;
    this.maxEvents = parseInt(maxEvents, 10);

    this.timelineEvents = [];
  }

  async startCapture () {
    log.debug('Starting performance (Timeline) log capture');
    this.timelineEvents = [];
    return await this.remoteDebugger.startTimeline(this.onTimelineEvent.bind(this));
  }

  async stopCapture () {
    log.debug('Stopping performance (Timeline) log capture');
    return await this.remoteDebugger.stopTimeline();
  }

  onTimelineEvent (event) {
    log.debug(`Received Timeline event: ${_.truncate(JSON.stringify(event))}`);
    this.timelineEvents.push(event);

    // if we have too many, get rid of the oldest log line
    if (this.timelineEvents.length > this.maxEvents) {
      let removedEvent = this.timelineEvents.shift();
      log.warn(`Too many Timeline events, removing earliest: ${_.truncate(JSON.stringify(removedEvent))}`);
    }
  }

  async getLogs () { // eslint-disable-line require-await
    let events = this.timelineEvents;

    // flush events
    log.debug('Flushing Timeline events');
    this.timelineEvents = [];

    return events;
  }

  async getAllLogs () { // eslint-disable-line require-await
    return this.getLogs();
  }
}


export { IOSPerformanceLog };
export default IOSPerformanceLog;
