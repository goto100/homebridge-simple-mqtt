'use strict';

const mqtt = require('mqtt');

const defaults = {
};
let Service, Characteristic, Formats;

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Formats = homebridge.hap.Characteristic.Formats;
    homebridge.registerAccessory('homebridge-mqttthing', 'mqttthing', Thing);
}

class Thing {
    constructor(log, config) {
        config = { ...defaults, ...config };
        this.log = log;
        log(config)

        const client = mqtt.connect(config.mqtt.address)
        client.on('connect', function () {
            log('mqtt connected');
        });
        this.client = client;

        this.services = [];
        Object.keys(config.services).forEach(name => {
            const serviceConfig = config.services[name];
            const service = this.makeService(config.name, serviceConfig);
            this.services.push(service);
        });
    }

    getServices() {
        return this.services;
    }

    makeService(name, serviceConfig) {
        const client = this.client;
        const log = this.log;

        const service = new Service[serviceConfig.type](name);
        const allCharNames = Array.from(new Set(Object.keys(serviceConfig.props || {}).concat(Object.keys(serviceConfig.topics || {}))));
        allCharNames.forEach(charName => {
            const char = service.getCharacteristic(Characteristic[charName])
            if (serviceConfig.props && charName in serviceConfig.props) {
                char.setProps(serviceConfig.props[charName]);
            }
            if (serviceConfig.topics && charName in serviceConfig.topics) {
                const topicDefines = serviceConfig.topics[charName];
                this.subscribeTopics(char, topicDefines);
                client.on('message', this.processMessage.bind(this, char, topicDefines));
                char.on('set', this.publishTopic.bind(this, char, topicDefines));
            }
        });
        return service;
    }

    coerceByCharacteristic(message, char) {
        let coerced = null;
        switch (char.props.format) {
            case Formats.INT:
            case Formats.FLOAT:
            case Formats.UINT8:
            case Formats.UINT16:
            case Formats.UINT32:
            case Formats.UINT64:
                coerced = Number(message);
                break;
            case Formats.BOOL:
                coerced = ['off', 'false', '0'].indexOf(message.toString()) == -1;
                break;
            case Formats.STRING:
                coerced = message.toString();
                break;
            default:
                throw new Error('unknown type ' + char.props.format)
        }
        return coerced;
    }

    publishTopic(char, topicDefines, state, callback) {
        const client = this.client;
        const log = this.log;

        client.publish(topicDefines.set, String(state));
        log(char.displayName + ' set to ' + state);
        callback(null);
    }

    processMessage(char, topicDefines, topic, message) {
        const client = this.client;
        const log = this.log;

        if (topicDefines.get == topic) {
            char.updateValue(this.coerceByCharacteristic(message, char));
            log(char.displayName + ' value updated to ' + message);
        }
        Object.keys(topicDefines.props || {}).forEach(propKey => {
            if (topicDefines.props[propKey] == topic) {
                char.setProps({
                    [propKey]: this.coerceByCharacteristic(message, char),
                });
                log(char.displayName + ' ' + propKey + ' updated to ' + message);
            }
        });
    }

    subscribeTopics(char, topicDefines) {
        const client = this.client;
        const log = this.log;

        client.subscribe(topicDefines.get, (err) => {
            if (!err) {
                log(topicDefines.get + ' subscribed');
            }
        });
        Object.keys(topicDefines.props || []).forEach(propKey => {
            client.subscribe(topicDefines.props[propKey], (err) => {
                if (!err) {
                    log(topicDefines.props[propKey] + ' subscribed');
                }
            });
        });
    }
}