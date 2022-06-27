'use strict';


class Zigbee2mqttHelper {
    static generateSelector(topic) {
        var transliterate = function(text) {
            text = text
                .replace(/\u0401/g, 'YO')
                .replace(/\u0419/g, 'I')
                .replace(/\u0426/g, 'TS')
                .replace(/\u0423/g, 'U')
                .replace(/\u041A/g, 'K')
                .replace(/\u0415/g, 'E')
                .replace(/\u041D/g, 'N')
                .replace(/\u0413/g, 'G')
                .replace(/\u0428/g, 'SH')
                .replace(/\u0429/g, 'SCH')
                .replace(/\u0417/g, 'Z')
                .replace(/\u0425/g, 'H')
                .replace(/\u042A/g, '')
                .replace(/\u0451/g, 'yo')
                .replace(/\u0439/g, 'i')
                .replace(/\u0446/g, 'ts')
                .replace(/\u0443/g, 'u')
                .replace(/\u043A/g, 'k')
                .replace(/\u0435/g, 'e')
                .replace(/\u043D/g, 'n')
                .replace(/\u0433/g, 'g')
                .replace(/\u0448/g, 'sh')
                .replace(/\u0449/g, 'sch')
                .replace(/\u0437/g, 'z')
                .replace(/\u0445/g, 'h')
                .replace(/\u044A/g, "'")
                .replace(/\u0424/g, 'F')
                .replace(/\u042B/g, 'I')
                .replace(/\u0412/g, 'V')
                .replace(/\u0410/g, 'a')
                .replace(/\u041F/g, 'P')
                .replace(/\u0420/g, 'R')
                .replace(/\u041E/g, 'O')
                .replace(/\u041B/g, 'L')
                .replace(/\u0414/g, 'D')
                .replace(/\u0416/g, 'ZH')
                .replace(/\u042D/g, 'E')
                .replace(/\u0444/g, 'f')
                .replace(/\u044B/g, 'i')
                .replace(/\u0432/g, 'v')
                .replace(/\u0430/g, 'a')
                .replace(/\u043F/g, 'p')
                .replace(/\u0440/g, 'r')
                .replace(/\u043E/g, 'o')
                .replace(/\u043B/g, 'l')
                .replace(/\u0434/g, 'd')
                .replace(/\u0436/g, 'zh')
                .replace(/\u044D/g, 'e')
                .replace(/\u042F/g, 'Ya')
                .replace(/\u0427/g, 'CH')
                .replace(/\u0421/g, 'S')
                .replace(/\u041C/g, 'M')
                .replace(/\u0418/g, 'I')
                .replace(/\u0422/g, 'T')
                .replace(/\u042C/g, "'")
                .replace(/\u0411/g, 'B')
                .replace(/\u042E/g, 'YU')
                .replace(/\u044F/g, 'ya')
                .replace(/\u0447/g, 'ch')
                .replace(/\u0441/g, 's')
                .replace(/\u043C/g, 'm')
                .replace(/\u0438/g, 'i')
                .replace(/\u0442/g, 't')
                .replace(/\u044C/g, "'")
                .replace(/\u0431/g, 'b')
                .replace(/\u044E/g, 'yu');

            return text;
        };

        topic = transliterate(topic);
        return topic.split('/').join('_').replace(/[^a-zA-Z0-9_-]/g, '');
    }

    static convertRange(value, r1, r2) {
        var val = Math.ceil((value - r1[0]) * (r2[1] - r2[0]) / (r1[1] - r1[0]) + r2[0]);
        if (val < r2[0]) val = r2[0];
        if (val > r2[1]) val = r2[1];
        return val;
    }

    static isJson(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    static cie2rgb(x, y, brightness) {
        //Set to maximum brightness if no custom value was given (Not the slick ECMAScript 6 way for compatibility reasons)
        if (brightness === undefined) {
            brightness = 254;
        }

        var z = 1.0 - x - y;
        var Y = (brightness / 254).toFixed(2);
        var X = (Y / y) * x;
        var Z = (Y / y) * z;

        //Convert to RGB using Wide RGB D65 conversion
        var red = X * 1.656492 - Y * 0.354851 - Z * 0.255038;
        var green = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
        var blue = X * 0.051713 - Y * 0.121364 + Z * 1.011530;

        //If red, green or blue is larger than 1.0 set it back to the maximum of 1.0
        if (red > blue && red > green && red > 1.0) {

            green = green / red;
            blue = blue / red;
            red = 1.0;
        } else if (green > blue && green > red && green > 1.0) {

            red = red / green;
            blue = blue / green;
            green = 1.0;
        } else if (blue > red && blue > green && blue > 1.0) {

            red = red / blue;
            green = green / blue;
            blue = 1.0;
        }

        //Reverse gamma correction
        red = red <= 0.0031308 ? 12.92 * red : (1.0 + 0.055) * Math.pow(red, (1.0 / 2.4)) - 0.055;
        green = green <= 0.0031308 ? 12.92 * green : (1.0 + 0.055) * Math.pow(green, (1.0 / 2.4)) - 0.055;
        blue = blue <= 0.0031308 ? 12.92 * blue : (1.0 + 0.055) * Math.pow(blue, (1.0 / 2.4)) - 0.055;

        //Convert normalized decimal to decimal
        red = Math.round(red * 255);
        green = Math.round(green * 255);
        blue = Math.round(blue * 255);

        if (isNaN(red))
            red = 0;

        if (isNaN(green))
            green = 0;

        if (isNaN(blue))
            blue = 0;

        return {
            r: red,
            g: green,
            b: blue
        };
    }

    static rgb2hsv(r, g, b) {
        let rabs, gabs, babs, rr, gg, bb, h, s, v, diff, diffc, percentRoundFn;
        rabs = r / 255;
        gabs = g / 255;
        babs = b / 255;
        v = Math.max(rabs, gabs, babs),
            diff = v - Math.min(rabs, gabs, babs);
        diffc = c => (v - c) / 6 / diff + 1 / 2;
        percentRoundFn = num => Math.round(num * 100) / 100;
        if (diff == 0) {
            h = s = 0;
        } else {
            s = diff / v;
            rr = diffc(rabs);
            gg = diffc(gabs);
            bb = diffc(babs);

            if (rabs === v) {
                h = bb - gg;
            } else if (gabs === v) {
                h = (1 / 3) + rr - bb;
            } else if (babs === v) {
                h = (2 / 3) + gg - rr;
            }
            if (h < 0) {
                h += 1;
            } else if (h > 1) {
                h -= 1;
            }
        }
        return {
            h: Math.round(h * 360),
            s: percentRoundFn(s * 100),
            v: percentRoundFn(v * 100)
        };
    }

    static payload2homekit(payload) {
        var msg = {};

        if (!payload) return msg;

        //Lightbulb
        if ("brightness" in payload) {
            if ("state" in payload && payload.state === "OFF") {
                msg["Lightbulb"] = {"On": false};
                if ("color_temp" in payload) {
                    msg["Lightbulb_CT"] = {"On": false};
                }
                if ("color" in payload) {
                    msg["Lightbulb_RGB"] = {"On": false};
                }
                if ("color" in payload && "color_temp" in payload) {
                    msg["Lightbulb_RGB_CT"] = {"On": false};
                }
            } else {

                var hue = null;
                var sat = null;
                if ("color" in payload && "hue" in payload.color && "saturation" in payload.color) {
                    hue = payload.color.hue;
                    sat = payload.color.saturation;
                } else if ("color" in payload && "x" in payload.color) {
                    var rgb = Zigbee2mqttHelper.cie2rgb(payload.color.x, payload.color.y, payload.brightness);
                    var hsv = Zigbee2mqttHelper.rgb2hsv(rgb.r, rgb.g, rgb.b);
                    hue = hsv.h;
                    sat = hsv.s;
                }
                var bri = Zigbee2mqttHelper.convertRange(parseInt(payload.brightness), [0, 255], [0, 100]);
                var ct = "color_temp" in payload ? Zigbee2mqttHelper.convertRange(parseInt(payload.color_temp), [150, 500], [150, 500]) : null;

                msg["Lightbulb"] = {
                    "On": true,
                    "Brightness": bri
                }
                if ("color_temp" in payload) {
                    msg["Lightbulb_CT"] = {
                        "On": true,
                        "Brightness": bri,
                        "ColorTemperature": ct
                    }
                }
                if ("color" in payload) {
                    msg["Lightbulb_RGB"] = {
                        "On": true,
                        "Brightness": bri,
                        "Hue": hue,
                        "Saturation": sat
                    }
                }
                if ("color" in payload && "color_temp" in payload) {
                    msg["Lightbulb_RGB_CT"] = {
                        "On": true,
                        "Brightness": bri,
                        "Hue": hue,
                        "Saturation": sat,
                        "ColorTemperature": ct
                    }
                }
            }
        }

        //LockMechanism
        if ("state" in payload && (payload.state === "LOCK" || payload.state === "UNLOCK")) {
            msg["LockMechanism"] = {
                "LockCurrentState": payload.state === "LOCK" ? 1 : 0,
                "LockTargetState": payload.state === "LOCK" ? 1 : 0
            };
        }



        // 0: "stopped"
        // 1: "opening"
        // 2: "closing"
        // public static readonly DECREASING = 0;
        // public static readonly INCREASING = 1;
        // public static readonly STOPPED = 2;
        if ('position' in payload && 'motor_state' in payload) {
            let motor_state = null;
            let position = 0; //closed
            switch (payload.motor_state) {
                case 'closing':
                    motor_state = 0;
                    position = 0;
                    break;
                case 'opening':
                    motor_state = 1;
                    position = 100;
                    break;
                case 'stopped':
                default:
                    motor_state = 2;
                    position = parseInt(payload.position) || 0;
                    break;
            }

            msg["Window"] = msg["WindowCovering"] = msg["Door"] = {
                "CurrentPosition": parseInt(payload.position),
                "TargetPosition": position,
                "PositionState": motor_state
            };

        } else if ('position' in payload && 'running' in payload) { //old??
            msg["Window"] = msg["WindowCovering"] = msg["Door"] = {
                "CurrentPosition": parseInt(payload.position),
                "TargetPosition": parseInt(payload.position),
                "PositionState": payload.running ? 1 : 2 //increasing=1, stopped=2
            };
        }

        //TemperatureSensor
        if ('temperature' in payload) {
            msg["TemperatureSensor"] = {
                "CurrentTemperature": parseFloat(payload.temperature)
            };
        }

        //HumiditySensor
        if ('humidity' in payload) {
            msg["HumiditySensor"] = {
                "CurrentRelativeHumidity": parseFloat(payload.humidity)
            };
        }

        //LightSensor
        if ('illuminance_lux' in payload) {
            msg["LightSensor"] = {
                "CurrentAmbientLightLevel": parseInt(payload.illuminance_lux)
            };
        }

        //ContactSensor
        if ('contact' in payload) {
            msg["ContactSensor"] = {
                "ContactSensorState": payload.contact ? 0 : 1
            };
            msg["ContactSensor_Inverse"] = {
                "ContactSensorState": payload.contact ? 1 : 0
            };
        }

        //MotionSensor, OccupancySensor
        if ('occupancy' in payload) {
            msg["MotionSensor"] = {
                "MotionDetected": payload.occupancy
            };
            msg["OccupancySensor"] = {
                "OccupancyDetected":payload.occupancy?1:0
            };
        }

        //WaterLeak
        if ('water_leak' in payload) {
            msg["LeakSensor"] = {
                "LeakDetected": payload.water_leak ? 1 : 0
            };
        }

        //Smoke
        if ('smoke' in payload) {
            msg["SmokeSensor"] = {
                "SmokeDetected": payload.smoke ? 1 : 0
            };
        }

        //Battery
        // if ("powerSource" in device && "Battery" == device.powerSource && "battery" in payload && parseInt(payload.battery)>0) {
        if ('battery' in payload) {
            msg["Battery"] = {
                "BatteryLevel": parseInt(payload.battery),
                "StatusLowBattery": parseInt(payload.battery) <= 15 ? 1 : 0
            };
        }

        //Switch
        if ("state" in payload && (payload.state === "ON" || payload.state === "OFF")) {
            msg["Switch"] = {
                "On": payload.state === "ON"
            };
        }

        return msg;
    }

    static formatPayload(payload, device) {
        var node = this;
        var result = {};

        //convert XY to RGB, HSV
        if (payload && "color" in payload && "x" in payload.color) {
            var bri = "brightness" in payload ? payload.brightness : 255;
            var rgb = Zigbee2mqttHelper.cie2rgb(payload.color.x, payload.color.y, bri);
            var hsv = Zigbee2mqttHelper.rgb2hsv(rgb.r, rgb.g, rgb.b);
            result['color'] = {
                "rgb": rgb,
                "hsv": hsv
            };
        }
        return result;
    }

    static formatMath(data) {
        var result = {};

        for (var i in data) {
            for (var key in data[i]) {
                var val = data[i][key];
                if (Zigbee2mqttHelper.isNumber(val)) {
                    if (!(key in result)) result[key] = {"count": 0, "avg": 0, "min": null, "max": null, "sum": 0};

                    result[key]["count"] += 1;
                    result[key]["sum"] =  Math.round((result[key]["sum"] + val) * 100) / 100;
                    result[key]["min"] = result[key]["min"] == null || val < result[key]["min"] ? val : result[key]["min"];
                    result[key]["max"] = result[key]["max"] == null || val > result[key]["max"] ? val : result[key]["max"];
                    result[key]["avg"] = Math.round((result[key]["sum"] / result[key]["count"]) * 100) / 100;
                }
            }
        }

        return result;
    }

    static statusUpdatedAt() {
        return ' [' + new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString() + ']'
    }

    static isNumber(n)
    {
        return Zigbee2mqttHelper.isInt(n) || Zigbee2mqttHelper.isFloat(n);
    }

    static isInt(n)
    {
        if (n === 'true' || n === true || n === 'false' || n === false) return false;
        return n !== "" && !isNaN(n) && Math.round(n) === n;
    }

    static isFloat(n){
        if (n === 'true' || n === true || n === 'false' || n === false) return false;
        return n !== "" && !isNaN(n) && Math.round(n) !== n;
    }

    // static objectsDiff(obj1, obj2) {
    //     if (obj1 && typeof(obj1) === 'object' && obj2 && typeof(obj2) === 'object') {
    //         var diffObj = Array.isArray(obj2) ? [] : {}
    //         Object.getOwnPropertyNames(obj2).forEach(function(prop) {
    //             if (typeof obj2[prop] === 'object') {
    //                 diffObj[prop] = deepCompare(obj1[prop], obj2[prop])
    //                 // if it's an array with only length property => empty array => delete
    //                 // or if it's an object with no own properties => delete
    //                 if (Array.isArray(diffObj[prop]) && Object.getOwnPropertyNames(diffObj[prop]).length === 1 ||
    //                     Object.getOwnPropertyNames(diffObj[prop]).length === 0) {
    //                     delete diffObj[prop]
    //                 }
    //             } else if (obj1[prop] !== obj2[prop]) {
    //                 diffObj[prop] = obj2[prop]
    //             }
    //         });
    //         return diffObj
    //     } else {
    //         return null;
    //     }
    // }
}

module.exports = Zigbee2mqttHelper;
