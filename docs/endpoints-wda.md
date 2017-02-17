## WebDriverAgent JSONWP Endpoints

### Session-less commands

| method | endpoint                               | req params | opt params |
| ------ | -------------------------------------- | ---------- | ---------- |
| POST   | /wda/homescreen                        | | |
| POST   | /source                                | | accessible |
| GET    | /inspector                             | | |
| GET    | /inspector.js                          | | |
| GET    | /screenshot                            | | |
| POST   | /session                               | desiredCapabilities
| GET    | /status                                | | |
| GET    | /*                                     | ** | |
| POST   | /*                                     | ** | |
| PUT    | /*                                     | ** | |
| DELETE | /*                                     | ** | |


### Session commands

| method | endpoint                               | req params | opt params |
| ------ | -------------------------------------- | ---------- | ---------- |
| GET    | /alert/text                            | | |
| POST   | /alert/accept                          | | |
| POST   | /alert/dismiss                         | | |
| POST   | /wda/deactivateApp                     | | duration |
| POST   | /timeouts                              | * | |
| POST   | /source                                | | accessible |
| GET    | /element/:uuid/enabled                 | | |
| GET    | /element/:uuid/rect                    | | |
| GET    | /element/:uuid/attribute/:name         | | |
| GET    | /element/:uuid/text                    | | |
| GET    | /element/:uuid/displayed               | | |
| GET    | /wda/element/:uuid/accessible          | | |
| GET    | /element/:uuid/name                    | | |
| POST   | /element/:uuid/value                   | value | |
| POST   | /element/:uuid/click                   | | |
| POST   | /element/:uuid/clear                   | | |
| POST   | /wda/element/:uuid/doubleTap        | | |
| POST   | /wda/element/:uuid/touchAndHold     | duration | |
| POST   | /wda/element/:uuid/scroll           | | name, direction, predicateString, toVisible |
| POST   | /uiaElement/:uuid/value                | value | |
| POST   | /wda/element/:uuid/dragfromtoforduration | fromX, fromY, toX, toY, duration | |
| POST   | /wda/tap/:uuid                         | x, y | |
| POST   | /wda/keys                              | value | |
| GET    | /window/size                           | | |
| POST   | /element                               | using, value | |
| POST   | /elements                              | using, value | |
| GET    | /wda/uiaElement/:uuid/getVisibleCells  | | |
| POST   | /element/:uuid/element                 | using, value | |
| POST   | /element/:uuid/elements                | using, value | |
| GET    | /orientation                           | | |
| POST   | /orientation                           | orientation | |
| GET    | /screenshot                            | | |
| POST   | /wda/touch_id                | match | |


\* implemented but intentionally not supported

** not implemented handlers
