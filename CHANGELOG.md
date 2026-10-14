# Changelog

## [3.1.0] - 2026-10-14

Changes since [3.0.1](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/releases/tag/v3.0.1).

### Added and improved

- Expose In nodes to Home Assistant with an optional switch to pause forwarding ([#182](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/182)).
- Add optional state output after Out-node commands ([#177](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/177)).
- Add configurable labels for Server nodes and log visibility levels ([#176](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/176), [#185](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/185)).
- Let In nodes compare selected properties when filtering state changes ([#179](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/179)).

### Fixed

- Replay MQTT state messages that arrive before the device inventory loads and avoid repeated startup reads for unavailable devices ([#180](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/180), [#181](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/181)).
- Request missing state for single-device Get nodes while keeping multi-device reads cache-only ([#183](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/183)).
- Correct In-node retain warnings and property change filtering ([#178](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/178), [#179](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/179)).
- Clear a cached Zigbee `action` when a later message omits it, so button events are not replayed by telemetry. This corrects the regression introduced by [#169](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/169) ([#186](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/186)).

### Documentation and localization

- Clarify Out-node device topic routing and the Home Assistant pause control ([#175](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/175), [#184](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/184)).

## [3.0.1] - 2026-10-12

Changes since [3.0.0](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/releases/tag/v3.0.0).

### Fixed

- Handle plain-text MQTT state payloads such as `ON` and `OFF` without crashing HomeKit conversion ([#162](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/162)).
- Use the current Zigbee2MQTT Permit Join request API to start and stop pairing ([#163](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/163)).
- Forward Zigbee2MQTT `tamper` values to the HomeKit occupancy sensor while preserving output when the field is absent ([#166](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/166)).
- Preserve cached device properties when MQTT sends a partial state update ([#169](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/169)).
- Refresh device and group inventories from retained MQTT topics when requested in the editor ([#170](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/170)).
- Reject blank group names and trim surrounding whitespace ([#171](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/171)).
- Normalize dynamic color command payloads while keeping already wrapped payloads intact ([#168](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/168)).

### Added and improved

- Generate clearer default labels for Out nodes from the selected action, device, and endpoint, while preserving custom names ([#164](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/164)).
- Add the Zigbee2MQTT blind `tilt` command with numeric payload conversion ([#165](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/165)).
- Offer device-specific writable exposes in the Out node command menu, including enum and binary values and fractional numeric payloads ([#167](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/167)).
- Route Out-node commands using a full `msg.topic` device `/set` or endpoint `/<endpoint>/set` topic, while retaining device-only routing ([#172](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/172)).

### Documentation and locales

- Add complete editor translations for Russian, Spanish, German, and Simplified Chinese, and complete and align the Slovak translations across all five nodes ([#173](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/173)).
- Clarify Out-node `msg.topic` routing and multiple-device controls, add missing labels, and fix the Get node's malformed translation reference. The English README was reviewed and remains current ([#172](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/172), [#173](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/pull/173)).

### Tests

- Add regression coverage for the fixes and output-node features above. The existing CI workflow runs the test suite and npm package-content check on Node.js 22 and 24.
