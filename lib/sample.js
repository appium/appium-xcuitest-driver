let wd = require('wd');
let repl = require('repl');

let driver = wd.promiseChainRemote("http://10.35.4.108:8100");

driver.on('status', function(info) {
  console.log(info.cyan);
});
driver.on('command', function(meth, path, data) {
  console.log(' > ' + meth.yellow, path.grey, data || '');
});

let caps = {
  bundleId: 'appium.io.TestApp',
  app: "/Users/jonahss/Workspace/AppiumRepl/node_modules/sample-apps/node_modules/ios-test-app/build/Release-iphonesimulator/TestApp-iphonesimulator.app"
};

global.driver = driver;
driver.init(caps).then(() => {
  repl.start({prompt:'("o")', useGlobal: true});
});
