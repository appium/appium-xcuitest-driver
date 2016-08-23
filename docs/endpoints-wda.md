## WebDriverAgent JSONWP Endpoints

### Session-less commands

| method | endpoint                               | req params | opt params |
| ------ | -------------------------------------- | ---------- | ---------- |
| POST   | /homescreen                            | | |
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
| POST   | /deactivateApp                         | | duration |
| POST   | /timeouts                              | * | |
| POST   | /source                                | | accessible |
| GET    | /element/:uuid/enabled                 | | |
| GET    | /element/:uuid/rect                    | | |
| GET    | /element/:uuid/attribute/:name         | | |
| GET    | /element/:uuid/text                    | | |
| GET    | /element/:uuid/displayed               | | |
| GET    | /element/:uuid/accessible              | | |
| GET    | /element/:uuid/name                    | | |
| POST   | /element/:uuid/value                   | value | |
| POST   | /element/:uuid/click                   | | |
| POST   | /element/:uuid/clear                   | | |
| POST   | /uiaElement/:uuid/doubleTap            | | |
| POST   | /uiaElement/:uuid/touchAndHold         | duration | |
| POST   | /uiaElement/:uuid/scroll               | | name, direction, predicateString, toVisible |
| POST   | /uiaElement/:uuid/value                | value | |
| POST   | /uiaTarget/:uuid/dragfromtoforduration | fromX, fromY, toX, toY, duration | |
| POST   | /tap/:uuid                             | x, y | |
| POST   | /keys                                  | value | |
| GET    | /window/:uuid/size                     | | |
| POST   | /element                               | using, value | |
| POST   | /elements                              | using, value | |
| GET    | /uiaElement/:uuid/getVisibleCells      | | |
| POST   | /element/:uuid/element                 | using, value | |
| POST   | /element/:uuid/elements                | using, value | |
| GET    | /orientation                           | | |
| POST   | /orientation                           | orientation | |
| GET    | /screenshot                            | | |
| POST   | /simulator/touch_id                    | match | |


\* implemented but intentionally not supported

** not implemented handlers
