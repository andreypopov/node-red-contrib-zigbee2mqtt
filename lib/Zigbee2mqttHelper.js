'use strict';


class Zigbee2mqttHelper {
    static generateSelector(topic) {
        var arr = topic.split('/');
        return (arr[2]+'-'+arr[4]).replace(/[^a-zA-Z0-9_-]/g, '');
    }

    static convertRange(value, r1, r2 ) {
        var val = Math.ceil((value - r1[0]) * (r2[1] - r2[0]) / ( r1[1] - r1[0] ) + r2[0]);
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

    static cie2rgb(x, y, brightness)
    {
        //Set to maximum brightness if no custom value was given (Not the slick ECMAScript 6 way for compatibility reasons)
        if (brightness === undefined) {
            brightness = 254;
        }

        var z = 1.0 - x - y;
        var Y = (brightness / 254).toFixed(2);
        var X = (Y / y) * x;
        var Z = (Y / y) * z;

        //Convert to RGB using Wide RGB D65 conversion
        var red 	=  X * 1.656492 - Y * 0.354851 - Z * 0.255038;
        var green 	= -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
        var blue 	=  X * 0.051713 - Y * 0.121364 + Z * 1.011530;

        //If red, green or blue is larger than 1.0 set it back to the maximum of 1.0
        if (red > blue && red > green && red > 1.0) {

            green = green / red;
            blue = blue / red;
            red = 1.0;
        }
        else if (green > blue && green > red && green > 1.0) {

            red = red / green;
            blue = blue / green;
            green = 1.0;
        }
        else if (blue > red && blue > green && blue > 1.0) {

            red = red / blue;
            green = green / blue;
            blue = 1.0;
        }

        //Reverse gamma correction
        red 	= red <= 0.0031308 ? 12.92 * red : (1.0 + 0.055) * Math.pow(red, (1.0 / 2.4)) - 0.055;
        green 	= green <= 0.0031308 ? 12.92 * green : (1.0 + 0.055) * Math.pow(green, (1.0 / 2.4)) - 0.055;
        blue 	= blue <= 0.0031308 ? 12.92 * blue : (1.0 + 0.055) * Math.pow(blue, (1.0 / 2.4)) - 0.055;


        //Convert normalized decimal to decimal
        red 	= Math.round(red * 255);
        green 	= Math.round(green * 255);
        blue 	= Math.round(blue * 255);

        if (isNaN(red))
            red = 0;

        if (isNaN(green))
            green = 0;

        if (isNaN(blue))
            blue = 0;


        return {
            r :red,
            g :green,
            b :blue
        };
    }

    static rgb2hsv (r, g, b) {
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
            }else if (h > 1) {
                h -= 1;
            }
        }
        return {
            h: Math.round(h * 360),
            s: percentRoundFn(s * 100),
            v: percentRoundFn(v * 100)
        };
    }

    static payload2homekit(payload, device) {
        var msg = {};

        if (!payload) return msg;

        //Lightbulb
        if ("brightness" in payload) {
            if ("state" in payload && payload.state == "OFF") {
                msg["Lightbulb"] = { "On" : false };
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
                if ("color" in payload  && "hue" in payload.color && "saturation" in payload.color) {
                    hue = payload.color.hue;
                    sat = payload.color.saturation;
                } else if ("color" in payload && "x" in payload.color) {
                    var rgb = Zigbee2mqttHelper.cie2rgb(payload.color.x, payload.color.y, payload.brightness);
                    var hsv = Zigbee2mqttHelper.rgb2hsv(rgb.r, rgb.g, rgb.b);
                    hue = hsv.h;
                    sat = hsv.s;
                }
                var bri = Zigbee2mqttHelper.convertRange(parseInt(payload.brightness), [0, 255], [0, 100]);
                var ct = "color_temp" in payload?Zigbee2mqttHelper.convertRange(parseInt(payload.color_temp), [50,400], [140,500]):null;

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
        if ("state" in payload && (payload.state == "LOCK" || payload.state == "UNLOCK")) {
            msg["LockMechanism"] = {
                "LockCurrentState":payload.state == "LOCK"?1:0,
                "LockTargetState":payload.state == "LOCK"?1:0
            };
        }

        //Window
        //WindowCovering
        //Door
        if ('position' in payload) {
            msg["Window"] = msg["WindowCovering"] = msg["Door"] = {
                "CurrentPosition":parseInt(payload.position),
                "TargetPosition":parseInt(payload.position),
                "PositionState":payload.running?1:2 //increasing=1, stopped=2
            };
        }


        //TemperatureSensor
        if ('temperature' in payload) {
            msg["TemperatureSensor"] = {
                "CurrentTemperature":parseFloat(payload.temperature)
            };
        }

        //HumiditySensor
        if ('humidity' in payload) {
            msg["HumiditySensor"] = {
                "CurrentRelativeHumidity":parseFloat(payload.humidity)
            };
        }

        //LightSensor
        if ('illuminance_lux' in payload) {
            msg["LightSensor"] = {
                "CurrentAmbientLightLevel":parseInt(payload.illuminance_lux)
            };
        }

        //ContactSensor
        if ('contact' in payload) {
            msg["ContactSensor"] = {
                "ContactSensorState":payload.contact?0:1
            };
            msg["ContactSensor_Inverse"] = {
                "ContactSensorState":payload.contact?1:0
            };
        }

        //MotionSensor, OccupancySensor
        if ('occupancy' in payload) {
            msg["MotionSensor"] = {
                "MotionDetected":payload.occupancy
            };
            // msg["OccupancySensor"] = {
            //     "OccupancyDetected":payload.occupancy?1:0
            // };
        }

        //WaterLeak
        if ('water_leak' in payload) {
            msg["LeakSensor"] = {
                "LeakDetected":payload.water_leak?1:0
            };
        }

        //Smoke
        if ('smoke' in payload) {
            msg["SmokeSensor"] = {
                "SmokeDetected":payload.smoke?1:0
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
        if ("state" in payload && (payload.state == "ON" || payload.state == "OFF")) {
            msg["Switch"] = {
                "On":payload.state == "ON"
            };
        }


        return msg;
    }

    static formatPayload(payload, device) {
        var node = this;
        var result = {};

        //convert XY to RGB, HSV
        if ("color" in payload && "x" in payload.color) {
            var bri = "brightness" in payload?payload.brightness:255;
            var rgb = Zigbee2mqttHelper.cie2rgb(payload.color.x, payload.color.y, bri);
            var hsv = Zigbee2mqttHelper.rgb2hsv(rgb.r, rgb.g, rgb.b);
            result['color'] = {
                "rgb":rgb,
                "hsv":hsv
            };
        }
        return result;
    }
}

module.exports = Zigbee2mqttHelper;
