---
title: Manage WebDriverAgent by Yourself
---

The XCUITest driver uses [WebDriverAgent](https://github.com/appium/WebDriverAgent) (WDA) as the
automation backend. This backend is based on Apple's XCTest framework and shares all the known
problems that are present in XCTest. For some of them we have workarounds, but there are some that
are hardly possible to workaround ([here is one example](https://github.com/facebookarchive/WebDriverAgent/issues/507)).
The approach described in this article enables you to have full control over how WDA is built,
managed, and run on the device. This way you may fine-tune your automated tests in a CI environment
and make them more stable inlong-running perspective.

!!! note

    * The steps below are not necessary if default Appium capabilities are used. The server will do
      everything for you, however, you will not have so much control over WDA.
    * It is mandatory to have SSH or physical access to the machine to which the device under test
      is connected.


### WDA Setup

In order to setup and launch WDA, please check the provided steps in the
[Run Preinstalled WDA](./run-preinstalled-wda.md#using-xcode) documentation.

### WDA Startup via Code

WebDriverAgent application acts as a REST server, which proxies external API requests to native
XCTest calls for your application under test. The server address will be `localhost` if you run your
tests on a simulator, or the actual phone IP address in case of real device. Appium uses
[`appium-ios-device`](https://github.com/appium/appium-ios-device) to route network requests to a
real device from `localhost` via USB, which means one can use this tool to unify the WDA network
addresses for a simulator and real device.

You can use `appium-ios-device` to connect to a remote device by requiring the module from your
JavaScript code. Alternatively, you can use [`iproxy`](https://github.com/libimobiledevice/libusbmuxd#iproxy),
[`go-ios`](https://github.com/danielpaulus/go-ios) or [`tidevice`](https://github.com/alibaba/taobao-iphone-device)
to handle the WDA process outside Appium, by installing and launching the WDA package. For instance,
`iproxy` can be installed using `npm`: `npm install -g iproxy`.

This helper class written in Java illustrates the main implementation details with `iproxy`:

```java
public class WDAServer {
    private static final Logger log = ZLogger.getLog(WDAServer.class.getSimpleName());

    private static final int MAX_REAL_DEVICE_RESTART_RETRIES = 1;
    private static final Timedelta REAL_DEVICE_RUNNING_TIMEOUT = Timedelta.ofMinutes(4);
    private static final Timedelta RESTART_TIMEOUT = Timedelta.ofMinutes(1);

    // These settings are needed to properly sign WDA for real device tests
    // See https://github.com/appium/appium-xcuitest-driver for more details
    private static final File KEYCHAIN = new File(String.format("%s/%s",
            System.getProperty("user.home"), "/Library/Keychains/MyKeychain.keychain"));
    private static final String KEYCHAIN_PASSWORD = "******";

    private static final File IPROXY_EXECUTABLE = new File("/usr/local/bin/iproxy");
    private static final File XCODEBUILD_EXECUTABLE = new File("/usr/bin/xcodebuild");
    private static final File WDA_PROJECT =
            new File("~/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent" +
                    "/WebDriverAgent.xcodeproj");
    private static final String WDA_SCHEME = "WebDriverAgentRunner";
    private static final String WDA_CONFIGURATION = "Debug";
    private static final File XCODEBUILD_LOG = new File("/usr/local/var/log/appium/build.log");
    private static final File IPROXY_LOG = new File("/usr/local/var/log/appium/iproxy.log");

    private static final int PORT = 8100;
    public static final String SERVER_URL = String.format("http://127.0.0.1:%d", PORT);

    private static final String[] IPROXY_CMDLINE = new String[]{
            IPROXY_EXECUTABLE.getAbsolutePath(),
            Integer.toString(PORT),
            Integer.toString(PORT),
            String.format("> %s 2>&1 &", IPROXY_LOG.getAbsolutePath())
    };

    private static WDAServer instance = null;
    private final boolean isRealDevice;
    private final String deviceId;
    private final String platformVersion;
    private int failedRestartRetriesCount = 0;

    private WDAServer() {
        try {
            this.isRealDevice = !getIsSimulatorFromConfig(getClass());
            final String udid;
            if (isRealDevice) {
                udid = IOSRealDeviceHelpers.getUDID();
            } else {
                udid = IOSSimulatorHelpers.getId();
            }
            this.deviceId = udid;
            this.platformVersion = getPlatformVersionFromConfig(getClass());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        ensureToolsExistence();
        ensureParentDirExistence();
    }

    public synchronized static WDAServer getInstance() {
        if (instance == null) {
            instance = new WDAServer();
        }
        return instance;
    }

    private boolean waitUntilIsRunning(Timedelta timeout) throws Exception {
        final URL status = new URL(SERVER_URL + "/status");
        try {
            if (timeout.asSeconds() > 5) {
                log.debug(String.format("Waiting max %s until WDA server starts responding...", timeout));
            }
            new UrlChecker().waitUntilAvailable(timeout.asMillis(), TimeUnit.MILLISECONDS, status);
            return true;
        } catch (UrlChecker.TimeoutException e) {
            return false;
        }
    }

    private static void ensureParentDirExistence() {
        if (!XCODEBUILD_LOG.getParentFile().exists()) {
            if (!XCODEBUILD_LOG.getParentFile().mkdirs()) {
                throw new IllegalStateException(String.format(
                        "The script has failed to create '%s' folder for Appium logs. " +
                                "Please make sure your account has correct access permissions on the parent folder(s)",
                        XCODEBUILD_LOG.getParentFile().getAbsolutePath()));
            }
        }
    }

    private void ensureToolsExistence() {
        if (isRealDevice && !IPROXY_EXECUTABLE.exists()) {
            throw new IllegalStateException(String.format("%s tool is expected to be installed (`npm install -g iproxy`)",
                    IPROXY_EXECUTABLE.getAbsolutePath()));
        }
        if (!XCODEBUILD_EXECUTABLE.exists()) {
            throw new IllegalStateException(String.format("xcodebuild tool is not detected on the current system at %s",
                    XCODEBUILD_EXECUTABLE.getAbsolutePath()));
        }
        if (!WDA_PROJECT.exists()) {
            throw new IllegalStateException(String.format("WDA project is expected to exist at %s",
                    WDA_PROJECT.getAbsolutePath()));
        }
    }

    private List<String> generateXcodebuildCmdline() {
        final List<String> result = new ArrayList<>();
        result.add(XCODEBUILD_EXECUTABLE.getAbsolutePath());
        result.add("clean build-for-testing test-without-building");
        result.add(String.format("-project %s", WDA_PROJECT.getAbsolutePath()));
        result.add(String.format("-scheme %s", WDA_SCHEME));
        result.add(String.format("-destination id=%s", deviceId));
        result.add(String.format("-configuration %s", WDA_CONFIGURATION));
        result.add(String.format("IPHONEOS_DEPLOYMENT_TARGET=%s", platformVersion));
        result.add(String.format("> %s 2>&1 &", XCODEBUILD_LOG.getAbsolutePath()));
        return result;
    }

    private static List<String> generateKeychainUnlockCmdlines() throws Exception {
        final List<String> result = new ArrayList<>();
        result.add(String.format("/usr/bin/security -v list-keychains -s %s", KEYCHAIN.getAbsolutePath()));
        result.add(String.format("/usr/bin/security -v unlock-keychain -p %s %s",
                KEYCHAIN_PASSWORD, KEYCHAIN.getAbsolutePath()));
        result.add(String.format("/usr/bin/security set-keychain-settings -t 3600 %s", KEYCHAIN.getAbsolutePath()));
        return result;
    }

    public synchronized void restart() throws Exception {
        if (isRealDevice && failedRestartRetriesCount >= MAX_REAL_DEVICE_RESTART_RETRIES) {
            throw new IllegalStateException(String.format(
                    "WDA server cannot start on the connected device with udid %s after %s retries. " +
                            "Reboot the device manually and try again", deviceId, MAX_REAL_DEVICE_RESTART_RETRIES));
        }

        final String hostname = InetAddress.getLocalHost().getHostName();
        log.info(String.format("Trying to (re)start WDA server on %s:%s...", hostname, PORT));
        UnixProcessHelpers.killProcessesGracefully(IPROXY_EXECUTABLE.getName(), XCODEBUILD_EXECUTABLE.getName());

        final File scriptFile = File.createTempFile("script", ".sh");
        try {
            final List<String> scriptContent = new ArrayList<>();
            scriptContent.add("#!/bin/bash");
            if (isRealDevice && isRunningInJenkinsNetwork()) {
                scriptContent.add(String.join("\n", generateKeychainUnlockCmdlines()));
            }
            if (isRealDevice) {
                scriptContent.add(String.join(" ", IPROXY_CMDLINE));
            }
            final String wdaBuildCmdline = String.join(" ", generateXcodebuildCmdline());
            log.debug(String.format("Building WDA with command line:\n%s\n", wdaBuildCmdline));
            scriptContent.add(wdaBuildCmdline);
            try (Writer output = new BufferedWriter(new FileWriter(scriptFile))) {
                output.write(String.join("\n", scriptContent));
            }
            new ProcessBuilder("/bin/chmod", "u+x", scriptFile.getCanonicalPath())
                    .redirectErrorStream(true).start().waitFor(5, TimeUnit.SECONDS);
            final ProcessBuilder pb = new ProcessBuilder("/bin/bash", scriptFile.getCanonicalPath());
            final Map<String, String> env = pb.environment();
            // This is needed for Jenkins
            env.put("BUILD_ID", "dontKillMe");
            // This line is important. If USE_PORT environment variable is not set then WDA
            // takes port number zero by default and won't accept any incoming requests
            env.put("USE_PORT", Integer.toString(PORT));
            log.info(String.format("Waiting max %s for WDA to be (re)started on %s:%s...", RESTART_TIMEOUT.toString(),
                    hostname, PORT));
            final Timedelta started = Timedelta.now();
            pb.redirectErrorStream(true).start().waitFor(RESTART_TIMEOUT.asMillis(), TimeUnit.MILLISECONDS);
            if (!waitUntilIsRunning(RESTART_TIMEOUT)) {
                ++failedRestartRetriesCount;
                throw new IllegalStateException(
                        String.format("WDA server has failed to start after %s timeout on server '%s'.\n"
                                        + "Please make sure that iDevice is properly connected and you can build "
                                        + "WDA manually from XCode.\n"
                                        + "Xcodebuild logs:\n\n%s\n\n\niproxy logs:\n\n%s\n\n\n",
                                RESTART_TIMEOUT, hostname,
                                getLog(XCODEBUILD_LOG).orElse("EMPTY"), getLog(IPROXY_LOG).orElse("EMPTY"))
                );
            }

            log.info(String.format("WDA server has been successfully (re)started after %s " +
                    "and now is listening on %s:%s", Timedelta.now().diff(started).toString(), hostname, PORT));
        } finally {
            scriptFile.delete();
        }
    }

    public boolean isRunning() throws Exception {
        if (!isProcessRunning(XCODEBUILD_EXECUTABLE.getName())
                || (isRealDevice && !isProcessRunning(IPROXY_EXECUTABLE.getName()))) {
            return false;
        }
        return waitUntilIsRunning(isRealDevice ? REAL_DEVICE_RUNNING_TIMEOUT : Timedelta.ofSeconds(3));
    }

    public Optional<String> getLog(File logFile) {
        if (logFile.exists()) {
            try {
                return Optional.of(new String(Files.readAllBytes(logFile.toPath()), Charset.forName("UTF-8")));
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        return Optional.empty();
    }
}
```

The following piece of code should then be called before starting the XCUITest driver:

```java
if (!WDAServer.getInstance().isRunning()) {
    WDAServer.getInstance().restart();
}
```

It is important to set the `appium:webDriverAgentUrl` capability for the driver to let it know
that WDA is ready for use:

```java
capabilities.setCapability("webDriverAgentUrl", WDAServer.SERVER_URL);
```

### Important Notes

* The process does not have direct access to keychain if it is executed by a continuous integration
  agent, so the keychain must be prepared before compiling WDA for real device, otherwise
  codesigning will fail. Check the [CI Setup](./ci-setup.md) documentation for details.
* The `xcodebuild` and `iproxy` processes are killed before restart to make sure compilation
  succeeds, in case the processes are frozen
* A dedicated `bash` script is used to detach the `iproxy`/`xcodebuild` processes, so they can
  continue running in background even after the actual code execution is finished. This is extremely
  important if multiple tests/suites are executed on the same machine/node in automation lab, which
  requires minimum human interaction
* The value of the `BUILD_ID` environment variable is changed to avoid the CI agent killing the
  background process after the job is finished
* The `isRunning` check is done by verifying the actual network endpoint
* The output of daemonized processes is logged, so it is possible to track errors and unexpected
  failures. The content of the log files is automatically added to the actual error message if the
  server fails to (re)start.
* Real device id can be parsed from `system_profiler SPUSBDataType` output
* Simulator id can be parsed from `xcrun simctl list` output
* The `UrlChecker` class is imported from the `org.openqa.selenium.net` package
