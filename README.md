# node-red-contrib-zigbee2mqtt
[![platform](https://img.shields.io/badge/platform-Node--RED-red?logo=nodered)](https://nodered.org)
[![Min Node Version](https://img.shields.io/node/v/node-red-contrib-zigbee2mqtt.svg)](https://nodejs.org/en/)
[![GitHub version](https://img.shields.io/github/package-json/v/andreypopov/node-red-contrib-zigbee2mqtt?logo=npm)](https://www.npmjs.com/package/node-red-contrib-zigbee2mqtt)
[![GitHub stars](https://img.shields.io/github/stars/andreypopov/node-red-contrib-zigbee2mqtt)](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/stargazers)
[![Package Quality](https://packagequality.com/shield/node-red-contrib-zigbee2mqtt.svg)](https://packagequality.com/#?package=node-red-contrib-zigbee2mqtt)

[![issues](https://img.shields.io/github/issues/andreypopov/node-red-contrib-zigbee2mqtt?logo=github)](https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/issues)
![GitHub last commit](https://img.shields.io/github/last-commit/andreypopov/node-red-contrib-zigbee2mqtt)
![NPM Total Downloads](https://img.shields.io/npm/dt/node-red-contrib-zigbee2mqtt.svg)
![NPM Downloads per month](https://img.shields.io/npm/dm/node-red-contrib-zigbee2mqtt)
![Repo size](https://img.shields.io/github/repo-size/andreypopov/node-red-contrib-zigbee2mqtt)

Node-Red Nodes for Zigbee2mqtt connectivity.

Available nodes are:
* zigbee2mqtt-in: listen to device
* zigbee2mqtt-get: get current value of device
* zigbee2mqtt-out: send command to device
* zigbee2mqtt-bridge: logs, options, other events

Extra features:
* groups support
* network map generation

## Initial device state

When the Server node connects, it waits briefly for retained device messages before requesting missing state. It skips devices marked disabled and devices reported offline by Zigbee2MQTT's availability feature. A failed request is not repeated on each device-list update; another attempt is made after the device comes online, is re-enabled or re-added, or the MQTT connection reconnects. To have the MQTT broker replay a device's last published state after reconnecting, enable retain for that device in Zigbee2MQTT's `configuration.yaml`:

Offline detection requires Zigbee2MQTT's availability feature to be enabled.

```yaml
devices:
  '0x00158d0001abcdef':
    retain: true
```

Retained state is the last value published by the device; enabling retain stores a value after the device publishes again.

## Filtering In node output

Enable **Filter** to send a message only when the selected value changes. When **Payload output** is set to the complete state, or **Multiple devices** is enabled, **Compare properties** lets you select exposed state properties for the selected device or devices. Changes to other fields such as linkquality will not trigger output, while the emitted message still contains the complete payload. In multiple-device mode, the selected fields are compared separately for each device. Leave the selection empty to compare the full payload.

The Server node has an optional **Flow label**. When set, it is appended to the labels of the Bridge, In, Get, and Out nodes that use that server, making multiple Zigbee2MQTT instances easier to distinguish in a flow. For example, set it to `Upstairs` to show `Lamp [Upstairs]`.

## Log visibility

Set the Server node's **Log level** to choose the minimum severity for package logs: `notice` shows all messages, `warning` shows warnings and errors, and `error` shows errors only. This filters log output without changing node status or message routing; errors remain available to Catch nodes at every level.

## Control an In node from Home Assistant

Enable **Expose to Home Assistant** on an In node to create an MQTT switch for it through Home Assistant MQTT Discovery. Home Assistant and the Server node must use the same MQTT broker. If Home Assistant uses a custom discovery prefix, set it in the Server node's **Home Assistant discovery prefix** field.

Turning the switch off pauses messages from that In node. Its MQTT subscription and the Zigbee2MQTT device remain active; messages received while paused are not replayed when it is enabled again. The option is off by default. The switch state is retained by MQTT; its discovery entry and retained state are cleared when exposure is disabled or the In node is removed.

## Dynamic device and endpoint topics in the Out node

To choose the target for each incoming message, set the Out node's **Device** field to `msg.topic`. The value is matched against devices and groups in the connected Zigbee2MQTT server node. A fixed **Device** selection takes precedence and ignores `msg.topic`.

The following device identifiers select the device's default command topic (`<base topic>/<device>/set`):

- The device's `friendly_name`, for example `living_room`.
- Its IEEE address, for example `0x00158d0003a27716`.
- Its numeric Zigbee2MQTT device ID, if present, for example `1`.
- The device topic itself, either relative to the base topic (`living_room`) or fully qualified (`zigbee2mqtt/living_room`). The fully qualified form must use the server node's configured base topic.
- The normalized selector value used by the Device list, for example `zigbee2mqtt_living_room`.

You can also pass a command topic explicitly:

| `msg.topic` value | Result |
| --- | --- |
| `living_room/set` or `zigbee2mqtt/living_room/set` | Selects the device and publishes to its default `/set` topic. |
| `living_room/left/set` or `zigbee2mqtt/living_room/left/set` | Selects the `left` endpoint and publishes to that endpoint topic. |
| `0x00158d0003a27716/2/set` or `zigbee2mqtt/0x00158d0003a27716/2/set` | Selects endpoint `2`. Endpoint names such as `left`, `right`, or `l1` work the same way. |

Relative command topics are combined with the server node's configured base topic; fully qualified topics must use that base topic. The device or group must exist in the server node's current inventory. Groups support device-only routing (including `/set`); endpoint routing is for devices. An endpoint is one path segment before `/set`. The node passes that segment through and does not check whether the device actually has that endpoint.

A bare device name or topic is supported and defaults to `/set`. An endpoint topic must include `/set`: `living_room/left` is not recognized. If the device or group cannot be resolved, the Out node reports `no device` and does not publish.

`msg.topic` selects the MQTT destination. The Out node still builds the JSON command payload from its **Command** and **Payload** settings. For example, with command `state` and payload `on`, `zigbee2mqtt/living_room/left/set` is published with `{"state":"on"}`.

## Optional Out node output

Enable **Output after state update** to add an output port. After publishing a command to a device, the node waits for the next live state update from that device, for up to 30 seconds. The output is a copy of the input message with:

- `msg.payload_in`: the original input `msg.payload`.
- `msg.payload` and `msg.payload_raw`: the full state reported by the device after the update.
- `msg.topic`: the device's state topic, without an endpoint or `/set` suffix.

If no live update arrives within 30 seconds, the node warns and sends no output. Group commands do not produce an output because a group has no single device state. Zigbee2MQTT does not correlate state updates with commands, so the output represents the next live update from that device after publishing, not a confirmation that this command caused it.

<img src="https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/blob/master/readme/1.png?raw=true">
<img src="https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/blob/master/readme/2.png?raw=true">
<img src="https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/blob/master/readme/3.png?raw=true">
<img src="https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/blob/master/readme/4.png?raw=true">
<img src="https://github.com/andreypopov/node-red-contrib-zigbee2mqtt/blob/master/readme/5.png?raw=true">

# Support
Developing and supporting this plugin needs time and efforts. Appreciate your support on [Patreon](https://www.patreon.com/bePatron?u=12661781). Here, you can sign up to be a member and help support my project.
