---
hide:
  - toc

title: Managing Multiple Xcodes
---

If you have multiple Xcode installations, you may choose which toolset Appium should use with one
of two ways:

### `xcode-select` tool
Only available with `sudo` privileges, affects the whole system.

Assuming you want to choose `/Applications/Xcode13.app`:

1. Set the default Xcode
  ```
  sudo xcode-select -s /Applications/Xcode13.app/Contents/Developer
  ```
2. Run Appium
  ```
  appium
  ```

### Environment variable
No privileges needed, affects only the current shell, so Appium should be started within that shell.

Assuming you want to choose `/Applications/Xcode12.app`:

1. Set the `DEVELOPER_DIR` environment variable
  ```
  export DEVELOPER_DIR=/Applications/Xcode12.app/Contents/Developer
  ```
2. Run Appium
  ```
  appium
  ```
