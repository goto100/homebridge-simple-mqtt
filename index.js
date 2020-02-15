'use strict';

const mqtt = require('mqtt');

const defaults = {
};
let Service, Characteristic, Formats;

module.exports = homebridge => {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Formats = homebridge.hap.Characteristic.Formats;
    homebridge.registerAccessory('homebridge-simple-mqtt', 'simple-mqtt', Thing);
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

    publishTopic(char, topicDefines, state, callback) {
        const client = this.client;
        const log = this.log;

        client.publish(topicDefines.set, JSON.stringify({
            value: state,
        }));
        log(char.displayName + ' set to ' + state);
        callback(null);
    }

    processMessage(char, topicDefines, topic, message) {
        const client = this.client;
        const log = this.log;
        const payload = JSON.parse(message);

        if (topicDefines.get == topic) {
            char.updateValue(payload.value);
            log(char.displayName + ' value updated to ' + payload.value);
        }
        Object.keys(topicDefines.props || {}).forEach(propKey => {
            if (topicDefines.props[propKey] == topic) {
                char.setProps({
                    [propKey]: payload.value,
                });
                log(char.displayName + ' ' + propKey + ' updated to ' + payload.value);
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