---
hide:
  - toc

title: Full Manual Configuration
---

The provisioning profile can also be manually associated with the WDA project. Keep in mind that
this will have to be done each time WDA is updated (such as when updating the XCUITest driver),
and is _not_ recommended:

* In the terminal, open the directory where WDA is located. Run the following to set the project up:
  ```bash
  mkdir -p Resources/WebDriverAgent.bundle
  ```
* Open `WebDriverAgent.xcodeproj` in Xcode. This will likely open a screen with an empty editor.
* In the file browser on the left side, select the root "WebDriverAgent" project, which will open
  it in the editor. Then, under "Targets", select "WebDriverAgentRunner".
* Check "Automatically manage signing", and then select your "Team". The outcome should be similar
  to the following:

    ![WebDriverAgent in Xcode project](./assets/images/xcode-config.png)

* Xcode will likely fail to create a provisioning profile due to an invalid bundle identifier:

    ![Xcode provisioning fail](./assets/images/xcode-facebook-fail.png)

* Change the "Bundle Identifier" from `com.facebook.WebDriverAgentRunner` to something that Xcode
  will accept. You can also do this in the "Build Settings" tab:

    ![Xcode bundle id](./assets/images/xcode-bundle-id.png)

* If your bundle identifier is accepted, you should see that Xcode has created a provisioning
  profile and all is well:

    ![Xcode provisioning profile](./assets/images/xcode-facebook-succeed.png)

* Finally, you can verify that everything works:
    * Select the scheme as `Product -> Scheme -> WebDriverAgentRunner`
    * Select your real device in `Product -> Destination`
    * Select `Product -> Test` to build and install the WDA app

Proceed with [Validating the WDA Install](./real-device-config.md#validating-the-wda-install) for
the next steps!
