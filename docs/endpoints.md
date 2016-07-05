## Appium iOS JSONWP Endpoints

### Session-less commands

| method | endpoint                                 | req params | opt params |
| ------ | ---------------------------------------- | ---------- | ---------- |
| GET    | /status                                  | | |
| POST   | /session                                 | desiredCapabilities | requiredCapabilities |
| GET    | /sessions                                | | |


### Session commands

| method | endpoint                                 | req params | opt params |
| ------ | ---------------------------------------- | ---------- | ---------- |
| GET    | /:sessionId                              | | |
| DELETE | /:sessionId                              | | |
| POST   | /timeouts                                | type, ms | |
| POST   | /timeouts/async_script                   | ms | |
| POST   | /timeouts/implicit_wait                  | ms | |
| GET    | /window_handle                           | | |
| GET    | /window_handles                          | | |
| GET    | /url                                     | | |
| POST   | /url                                     | url | |
| POST   | /forward                                 | none | |
| POST   | /back                                    | none | |
| POST   | /refresh                                 | none | |
| POST   | /execute                                 | script, args | |
| POST   | /execute_async                           | script, args | |
| GET    | /screenshot                              | | |
| POST   | /frame                                   | id | |
| POST   | /window                                  | name | |
| DELETE | /window                                  | | |
| GET    | /window/:windowhandle/size               | | |
| GET    | /cookie                                  | | |
| POST   | /cookie                                  | cookie | |
| DELETE | /cookie                                  | | | | |
| DELETE | /cookie/:name                            | | |
| GET    | /source                                  | | |
| GET    | /title                                   | | |
| POST   | /element                                 | using, value | |
| POST   | /elements                                | using, value | |
| POST   | /element/active                          | none | |
| POST   | /element/:elementId/element              | using, value | |
| POST   | /element/:elementId/elements             | using, value | |
| POST   | /element/:elementId/click                | none | |
| POST   | /element/:elementId/submit               | none | |
| GET    | /element/:elementId/text                 | none | |
| POST   | /element/:elementId/value                | value | |
| POST   | /keys                                    | value | |
| GET    | /element/:elementId/name                 | | |
| POST   | /element/:elementId/clear                | none | |
| GET    | /element/:elementId/selected             | | |
| GET    | /element/:elementId/enabled              | | |
| GET    | /element/:elementId/attribute/:name      | | |
| GET    | /element/:elementId/equals/:otherId      | | |
| GET    | /element/:elementId/displayed            | | |
| GET    | /element/:elementId/location             | | |
| GET    | /element/:elementId/location_in_view     | | |
| GET    | /element/:elementId/size                 | | |
| GET    | /element/:elementId/css/:propertyName    | | |
| GET    | /orientation                             | | |
| POST   | /orientation                             | orientation | |
| GET    | /alert_text                              | | |
| POST   | /alert_text                              | text | |
| POST   | /accept_alert                            | none | |
| POST   | /dismiss_alert                           | none | |
| POST   | /moveto                                  | | element, xoffset, yoffset |
| POST   | /click                                   | | button |
| POST   | /touch/click                             | element | |
| POST   | /touch/flick                             | | element, xspeed, yspeed, xoffset, yoffset, speed |
| GET    | /location                                | | |
| POST   | /location                                | location | |
| POST   | /log                                     | type | |
| GET    | /log/types                               | | |
| GET    | /context                                 | | |
| POST   | /context                                 | name | |
| GET    | /contexts                                | | |
| POST   | /touch/perform                           | actions | |
| POST   | /touch/multi/perform                     | actions | elementId |
| POST   | /receive_async_response                  | status, value | |


### Appium-specific commands

| method | endpoint                                 | req params | opt params |
| ------ | ---------------------------------------- | ---------- | ---------- |
| POST   | /appium/device/shake                     | none | |
| GET    | /appium/device/system_time               | | |
| POST   | /appium/device/lock                      | | seconds |
| POST   | /appium/device/rotate                    | x, y, radius, rotation, touchCount, duration | element |
| POST   | /appium/device/remove_app                | appId or bundleId | |
| POST   | /appium/device/hide_keyboard             | | strategy, key, keyCode, keyName |
| POST   | /appium/device/push_file                 | path, data | |
| POST   | /appium/device/pull_file                 | path | |
| POST   | /appium/device/pull_folder               | path | |
| POST   | /appium/simulator/touch_id               | match | |
| POST   | /appium/app/launch                       | none | |
| POST   | /appium/app/close                        | none | |
| POST   | /appium/app/background                   | seconds | |
| POST   | /appium/app/strings                      | | language, stringFile |
| POST   | /appium/element/:elementId/value         | value | |
| POST   | /appium/receive_async_response           | response | |
