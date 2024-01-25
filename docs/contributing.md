---
hide:
  - navigation
  - toc

title: Contributing
---

Contributions to this project are welcome! To start off, clone it from GitHub and run:

```bash
npm install
```

To watch changes during development:

```bash
npm run watch
```

To run unit/functional tests:

```bash
npm run test # unit 
npm run e2e-test # functional
```

To develop documentation:

```bash
npm run install-docs-deps # install the dependencies (Python packages)
npm run dev:docs # serve the docs locally and watch for changes
```

There are also a number of environment variables that can be used when running
the tests locally. These include:

* `REAL_DEVICE` - set to anything truthy, makes the tests use real device capabilities
* `_FORCE_LOGS` - set to `1` to get the log output, not just spec
* `PLATFORM_VERSION` - change the version to run the tests against (defaults to `11.3`)
* `XCCONFIG_FILE` - specify where the Xcode config file is for a real device run (if
  blank, and running a real device test, it will search for the first file in
  the root directory of the repo with the extension `.xcconfig`)
* `UICATALOG_REAL_DEVICE` - path to the real device build of UICatalog, in case
  the `npm` installed one is not built for a real device
