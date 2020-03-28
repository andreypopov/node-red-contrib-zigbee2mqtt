'use strict';


class Zigbee2mqttHelper {
    static generateSelector(topic) {
        var arr = topic.split('/');
        return (arr[2]+'-'+arr[4]).replace(/[^a-zA-Z0-9_-]/g, '');
    }

    static convertRange(value, r1, r2 ) {
        return Math.ceil((value - r1[0]) * (r2[1] - r2[0]) / ( r1[1] - r1[0] ) + r2[0]);
    }

}

module.exports = Zigbee2mqttHelper;