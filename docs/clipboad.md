---
title: Get/Set Clipboard
---

## Get Clipboard

For iOS 13+ real devices, Apple security preferences require the WebDriverAgentRunner application to be in foreground in order to be able to receive the system clipboard content.
Otherwise an empty string is always returned.
Consider using [Activate App](execute-methods.md/#mobile-activateapp) and [Background App](execute-methods.md/#mobile-backgroundapp) to change the foreground application.

## Set Clipboard

For iOS 15+ real devices, Apple security preferences require the WebDriverAgentRunner application to be in foreground in order to set the system clipboard content.
Consider using [Activate App](execute-methods.md/#mobile-activateapp) and [Background App](execute-methods.md/#mobile-backgroundapp) to change the foreground application. 
