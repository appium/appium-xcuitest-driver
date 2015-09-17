import B from 'bluebird';
import { BaseDriver } from 'appium-base-driver';
import { fs } from 'appium-support';
import { installApp, launch } from 'node-simctl';
import WebDriverAgent from './webdriveragent';
import log from './logger';

class WebDriverAgentDriver extends BaseDriver {
  constructor (opts = {}, shouldValidateCaps = true) {
    super(opts, shouldValidateCaps);

    // TODO set up desired cap constraints
    //this.desiredCapConstraints = desiredCapConstraints;
    this.wda = null;
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    this.jwpProxyAvoid = [];
  }

  get driverData () {
    // TODO fill out resource info here
    return {};
  }

  async createSession (caps) {
    try {
      // TODO add validation on caps
      // TODO handle otherSessionData for multiple sessions
      let sessionId;
      [sessionId] = await super.createSession(caps);
      // fail very early if the app doesn't actually exist
      await this.checkAppPresent();
      // TODO this port should be dynamically chosen based on driverData
      const port = 8105;
      // TODO in the future we should have logic for determining which sim to
      // launch based on platformVersion and deviceName. For now just require
      // udid
      this.wda = new WebDriverAgent({
        udid: this.opts.udid,
        platformVersion: this.opts.platformVersion,
        host: this.opts.host,
        port
      });
      // TODO logic for launching the sim goes here or in WDA
      await this.wda.launch(sessionId);
      log.info("Installing the app");
      // TODO don't re-install?
      await installApp(this.opts.udid, this.opts.app);
      log.info("Launching the app");
      await launch(this.opts.udid, this.opts.bundleId);
      // TODO poll WDA endpoint to wait until our app is frontmost app.
      // For now just wait 2s
      await B.delay(2000);
      this.proxyReqRes = this.wda.proxyReqRes.bind(this.wda);
      this.jwpProxyActive = true;
      return [sessionId, caps];
    } catch (e) {
      await this.deleteSession();
      throw e;
    }
  }

  async deleteSession () {
    this.jwpProxyActive = false;
    this.proxyReqRes = null;
    // TODO kill the future WDA subproc
    await super.deleteSession();
  }

  async checkAppPresent () {
    log.debug("Checking whether app is actually present");
    if (!(await fs.exists(this.opts.app))) {
      log.errorAndThrow(`Could not find app at ${this.opts.app}`);
    }
  }

}

export { WebDriverAgentDriver };
