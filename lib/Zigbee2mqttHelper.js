'use strict';


class Zigbee2mqttHelper {
    static generateSelector(topic) {
        var arr = topic.split('/');
        return (arr[2]+'-'+arr[4]).replace(/[^a-zA-Z0-9_-]/g, '');
    }
}

module.exports = Zigbee2mqttHelper;