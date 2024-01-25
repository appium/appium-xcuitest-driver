---
hide:
  - toc

title: Basic Manual Configuration
---

There are many cases in which the basic automatic configuration is not enough. Often this happens
when the development account being used is a "Free" one, in which case it is not possible to create
a wildcard provisioning profile.

You can confirm this by opening the WDA project in Xcode. The issue will manifest as something like
an error that Xcode failed to create provisioning profile:

![No provisioning profile](./assets/images/no-prov-prof.png)

The easiest way around this is to create a new project:

![Create new project](./assets/images/create-new-project.png)

The type does not matter, other than it being "iOS". "Single View Application" is the easiest:

![Create single page](./assets/images/create-single-page.png)

The important part is to use a unique "Product Name" and "Organization Name". Also, at this point,
specify your "Team".

![Setup bundle](./assets/images/set-up-bundle.png)

You can confirm that the provisioning profile was created by looking at the "Project" tab:

![Project pane](./assets/images/project-prov-prof.png)

Or by going into your account preferences and seeing the provisioning profile:

![Check provisioning profile](./assets/images/check-prov-prof.png)

At this point you have a valid provisioning profile. Make note of the bundle identifier
you associated with it, and add that in the `updatedWDABundleId` capability for your tests.
Then follow the [initial instructions for automatic configuration](./prov-profile-basic-auto.md).
