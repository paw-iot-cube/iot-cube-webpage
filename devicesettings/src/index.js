/*global document,$,window,uibuilder */
/*
  Copyright (c) 2017 Julian Knight (Totally Information)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
/** This script is usable as is though you will want to add your own code to process incoming and outgoing messages.
 *
 * uibuilderfe.js (or uibuilderfe.min.js) exposes the following global object.
 * Note that you can use webpack or similar to bundle uibuilder with your own code.
 *
 *   uibuilder: The main global object containing the following...
 *     External Methods:
 *       .onChange(property, callbackFn) - listen for changes to property and execute callback when it changes
 *       .get(property)        - Get any available property
 *       .set(property, value) - Set any available property (can't overwrite internal properties)
 *       .msg                  - Shortcut to get the latest value of msg. Equivalent to uibuilder.get('msg')
 *       .send(msg)            - Shortcut to send a msg back to Node-RED manually
 *       .sendCtrl(msg)        - Shortcut to send a control msg back to Node-RED manually (@since v0.4.8)
 *       .debug(true/false)    - Turn on/off debugging
 *       .uiDebug(type,msg)    - Utility function: Send debug msg to console (type=[log,info,warn,error,dir])
 *       .me()                 - Returns the self object if debugging otherwise just the current version string
 *       .autoSendReady(true/false) - If true, sends "ready for content" ctrl msg on window.load
 *                       If false, you will need to manually do
 *                       uibuilder.sendCtrl({'uibuilderCtrl':'ready for content', 'cacheControl':'REPLAY'})
 *                       (e.g. in an app.mounted event)  @since v0.4.8a
 *
 *     All properties can be read using the .get method
 *     New properties can be added via .set method as long as the property name does not clash with anything internal.
 *     All properties (including custom) can have change events associated with them by using the .onChange method
 *
 *     Externally settable properties using special methods only
 *       .autoSendReady - see .autoSendReady method
 *       .debug         - see .debug method, also see 'server connected' control msg from server
 *
 *     Externally settable properties via the .set method
 *       .allowScript   - Allow incoming msg to contain msg.script with JavaScript that will be automatically executed
 *       .allowStyle    - Allow incoming msg to contain msg.style with CSS that will be automatically executed
 *       .removeScript  - Delete msg.code after inserting to DOM if it exists on incoming msg
 *       .removeStyle   - Delete msg.style after inserting to DOM if it exists on incoming msg
 *
 *     Externally read only properties (may be changed internally)
 *       .msg           - Copy of the last msg sent from Node-RED over Socket.IO
 *       .sentMsg       - Copy of the last msg sent by us to Node-RED (both data and control)
 *       .ctrlMsg       - Copy of the last control msg received by us from Node-RED (Types: ['shutdown','server connected'])
 *       .msgsReceived  - How many standard messages have we received
 *       .msgsSent      - How many messages have we sent
 *       .msgsSentCtrl  - How many control messages have we sent
 *       .msgsCtrl      - How many control messages have we received
 *       .ioConnected   - Is Socket.IO connected right now? (true/false)
 *       ---- You are not likely to need any of these, they are for internal use ----
 *       .version       - check the current version of the uibuilder code
 *       .ioChannels    - List of the channel names in use [uiBuilderControl, uiBuilderClient, uiBuilder]
 *       .retryMs       - starting retry ms period for manual socket reconnections workaround
 *       .retryFactor   - starting delay factor for subsequent reconnect attempts
 *       .ioNamespace   - Get the namespace from the current URL
 *       .ioPath        - make sure client uses Socket.IO version from the uibuilder module (using path)
 *       .ioTransport   - ['polling', 'websocket']
 *       .timerid       - internal use only
 *       .events        - list of registered events
 */
//'use strict'

var dataMsg;

// When JQuery is ready, update
$( document ).ready(function() {
    // Turn on debugging for uibuilderfe (default is off)
    uibuilder.debug(true);  

    // initialise confirmation plugin
    $('[data-toggle=confirmation]').confirmation({
        rootSelector: '[data-toggle=confirmation]'
        
    });



    // If Socket.IO connects/disconnects
    uibuilder.onChange('ioConnected', function(newVal){
        console.info('indexjs:ioConnected: Socket.IO Connection Status Changed: ', newVal);
    });

    // If a message is sent back to Node-RED
    uibuilder.onChange('msgsSent', function(newVal){
        console.info('New msg sent to Node-RED over Socket.IO. Total Count: ', newVal);
    });

    // If we receive a control message from Node-RED
    uibuilder.onChange('msgsCtrl', function(newVal){
        console.info('indexjs:msgsCtrl: New control msg sent to us from Node-RED over Socket.IO. Total Count: ', newVal);
    });

    // If msg changes - msg is updated when a standard msg is received from Node-RED over Socket.IO
    // Note that you can also listen for 'msgsReceived' as they are updated at the same time
    // but newVal relates to the attribute being listened to.
    uibuilder.onChange('msg', function(newMsg){
        console.info('indexjs:msg: property msg has changed! ', newMsg);

        if (newMsg.topic == "onLoadData" && newMsg.payload == "lastItem" && $('#sensorCardArea').children().length == 0 && $('#actuatorCardArea').children().length == 0) {
            dataMsg = newMsg;

            //generate items
            var sensorTemplate = generateSensorCardsTemplate(newMsg);
            $('#sensorCardArea').append(sensorTemplate);

            var actuatorTemplate = generateActuatorCardsTemplate(newMsg);
            $('#actuatorCardArea').append(actuatorTemplate);

            feather.replace();

            //fill items
            fillItems(newMsg);
            
        }
        else if (newMsg.topic == "updateData") {
            dataMsg = newMsg;
            fillItems(newMsg);
        }
        else if (newMsg.topic == "discoveryData") {
            dataMsg = newMsg;
            
            //delete old items
            $('#sensorCardArea').empty();
            $('#actuatorCardArea').empty();

            //generate items
            var sensorTemplate = generateSensorCardsTemplate(newMsg);
            $('#sensorCardArea').append(sensorTemplate);

            var actuatorTemplate = generateActuatorCardsTemplate(newMsg);
            $('#actuatorCardArea').append(actuatorTemplate);

            feather.replace();

            //fill items
            fillItems(newMsg);
        }
        else if (newMsg.topic.includes("activateCsvDownload")) {
            if (newMsg.topic == "activateCsvDownloadCon") {
                $('#aDownload').removeClass('disabled');
            }
            else if (newMsg.topic == "activateCsvDownloadDiscon") {
                $('#aDownloadDiscon').removeClass('disabled');
            }
        }
        
    });

}); // --- End of JQuery Ready --- //

var modalSensorConCaller;
var modalSensorDisconCaller;
var modalActuatorConCaller;
var modalActuatorDisconCaller;

$(document).on('shown.bs.modal', '#sensorModalCon', function(event) {
    //get element that triggered the modal
    var triggerElement = $(event.relatedTarget);
    
    console.log($(triggerElement[0]).attr('id'));
    modalSensorConCaller = $(triggerElement[0]).attr('id');

    fillSensorModal($(triggerElement[0]).attr('id').replace('card-', ''), 'sensorModalCon');
});

$(document).on('shown.bs.modal', '#sensorModalDiscon', function(event) {
    //get element that triggered the modal
    var triggerElement = $(event.relatedTarget);
    
    console.log($(triggerElement[0]).attr('id'));
    modalSensorDisconCaller = $(triggerElement[0]).attr('id');

    fillSensorModal($(triggerElement[0]).attr('id').replace('card-', ''), 'sensorModalDiscon');
});

$(document).on('shown.bs.modal', '#actuatorModalCon', function(event) {
    //get element that triggered the modal
    var triggerElement = $(event.relatedTarget);
    
    console.log($(triggerElement[0]).attr('id'));
    modalActuatorConCaller = $(triggerElement[0]).attr('id');

    fillActuatorModal($(triggerElement[0]).attr('id').replace('card-', ''), 'actuatorModalCon');
});

$(document).on('shown.bs.modal', '#actuatorModalDiscon', function(event) {
    //get element that triggered the modal
    var triggerElement = $(event.relatedTarget);
    
    console.log($(triggerElement[0]).attr('id'));
    modalActuatorDisconCaller = $(triggerElement[0]).attr('id');

    fillActuatorModal($(triggerElement[0]).attr('id').replace('card-', ''), 'actuatorModalDiscon');
});

$('#formSensor').on('submit', function(event) {
    event.preventDefault();

    if ($('input:radio[name=radioVisibility]:checked').val() == 'visibilityTrue') {
        var isVisible = 1;
    }
    else if($('input:radio[name=radioVisibility]:checked').val() == 'visibilityFalse') {
        var isVisible = 0;
    }

    var collection = {
        'deviceId': $('#sensorId').text(),
        'dispName': $('#inputName').val(),
        'isVisible': isVisible,
        'shownDataPoints': $('#inputDataPointAmount').val(),
        'interval': $('#inputInterval').val()
        // TODO unit                                                        <<------------------------------------- !!
    };

    uibuilder.send({
        'topic': 'settingsSensor',
        'payload': collection
    });

    uibuilder.sendCtrl({
        'uibuilderCtrl': 'ready for content',
        'changedSettings': true
    });

    $('#sensorModalCon').modal('hide');
});

$('#formActuator').on('submit', function(event) {
    event.preventDefault();

    if ($('input:radio[name=radioManual]:checked').val() == 'manualOn') {
        var manControl = 1;
    }
    else if ($('input:radio[name=radioManual]:checked').val() == 'manualOff') {
        var manControl = 0;
    }

    var collection = {
        'deviceId': $('#actuatorId').text(),
        'deviceType': $('#actuatorType').text(),
        'dispName': $('#inputActuatorName').val(),
        'manControl': manControl,
        'linkedTo': $('#selectSensorLink option:selected').val(),
        'linkRule': $('#selectThreshold option:selected').val(),
        'threshold': $('#inputThreshold').val(),
        'linkedMeas': $('#selectMeasurand option:selected').val()
    };

    uibuilder.send({
        'topic': 'settingsActuator',
        'payload': collection
    });

    uibuilder.sendCtrl({
        'uibuilderCtrl': 'ready for content',
        'changedSettings': true
    });

    $('#actuatorModalCon').modal('hide');
});

//special treatment for "instant" manual control: send changes directly
$('input:radio[name=radioManual]').change(function() {
    if (this.value == 'manualOn') {
        uibuilder.send({
            'topic': 'actuatorManControl',
            'payload': {
                'deviceId': modalActuatorConCaller,
                'manControl': 1
            }
        });
    }
    else if (this.value == 'manualOff') {
        uibuilder.send({
            'topic': 'actuatorManControl',
            'payload': {
                'deviceId': modalActuatorConCaller,
                'manControl': 0
            }
        });
    }
});

//request CSV
$('#btnGenerateCSV').click(function (event) { 
    event.preventDefault();
    var sensorId = $(event.target).parent().find('#sensorId').text();
    var sensorType = $(event.target).parent().find('#sensorType').text();

    $(this).prop('disabled', true);

    var collection = {
        'topic': 'generateCSV',
        'sensorId': sensorId,
        'sensorType': sensorType,
        'modalType': 'connected'
    };

    uibuilder.send(collection);

    console.log('generateCSV');
});
$('#btnGenerateCSVDiscon').click(function (event) { 
    event.preventDefault();
    var sensorId = $(event.target).parent().find('#sensorIdDiscon').text();
    var sensorType = $(event.target).parent().find('#sensorTypeDiscon').text();

    $(this).prop('disabled', true);

    var collection = {
        'topic': 'generateCSV',
        'sensorId': sensorId,
        'sensorType': sensorType,
        'modalType': 'disconnected'
    };

    uibuilder.send(collection);

    console.log('generateCSV');
});

//restore disabled attributes afterwards
$('#aDownload').click(function(event) {
    $('#btnGenerateCSV').prop('disabled', false);
    $(this).addClass('disabled');
});
$('#aDownloadDiscon').click(function(event) {
    $('#btnGenerateCSVDiscon').prop('disabled', false);
    $(this).addClass('disabled');
});

//handle device removal when confirmed
$(document).on('confirmed.bs.confirmation', function(event) {
    var triggerElementId = $(event.target).attr('id');
    
    removeDevice(triggerElementId);
});

//automatically generate measurand options when selected sensor changes
$('#selectSensorLink').on('change', function(event) {
    var optionSelected = $('option:selected', this);
    var valueSelected = this.value;
    console.log(optionSelected);
    console.log(valueSelected);
    console.log(dataMsg.settingsInputData.find(x => x.deviceId === parseInt(valueSelected)));
    if (valueSelected == "0") {
        addOptionsSelectMeasurand('#selectMeasurand', '');
    }
    else {
        addOptionsSelectMeasurand('#selectMeasurand', dataMsg.settingsInputData.find(x => x.deviceId === parseInt(valueSelected)).deviceType);
    }
});

function generateSensorCardsTemplate(msg) {
    var colOpenTemplate = '<div class="col-auto mb-3">';
    var template = '';

    msg.settingsInputData.forEach(function(element, index) {
        if (element.deviceCategory == "sensor") {
            var cardOpenTemplate = '<div class="card card-custom" style="max-width: 18rem;" data-toggle="modal" id="card-'
                                + element.deviceId + '">';
            var overlayTemplate = '<div class="overlay overlayFade">'
                                + '<div class="overlayText text-center">'
                                + '<p></p>'
                                + '<i data-feather="edit"></i>'
                                + '<p>Configure</p>'
                                + '</div>'
                                + '</div>';
            template += colOpenTemplate;
            template += cardOpenTemplate;
            template += overlayTemplate;

            template += '<img class="card-img" src="" alt="Card image" id="img-' + element.deviceId + '">';
            template += '<div class="card-img-overlay">'
                        + '<h6 class="card-title text-uppercase" id="title-' + element.deviceId + '"></h6>'
                        + '<h6 class="card-subtitle mb-2 text-muted" id="name-' + element.deviceId + '"></h6>'
                        + '<p class="text-success" id="status-' + element.deviceId + '"></p>'
                        + '<p class="text-body" id="smallInfo-' + element.deviceId + '">'
                        + 'IP: <span class="text-primary" id="ip-' + element.deviceId + '"></span><br>'
                        + 'Latest value: <span class="text-primary" id="latest-' + element.deviceId + '"></span>'
                        + '</p>'
                        + '</div>'
                        + '</div>'
                        + '</div>';
        }

    });
    
    return template;
}

function generateActuatorCardsTemplate(msg) {
    var colOpenTemplate = '<div class="col-auto mb-3">';
    var template = '';

    msg.settingsInputData.forEach(function(element, index) {
        if (element.deviceCategory == "actuator") {
            var cardOpenTemplate = '<div class="card card-custom" style="width: 18rem;" data-toggle="modal" id="card-'
                                + element.deviceId + '">';
            var overlayTemplate = '<div class="overlay overlayFade">'
                                + '<div class="overlayText text-center">'
                                + '<p></p>'
                                + '<i data-feather="edit"></i>'
                                + '<p>Configure</p>'
                                + '</div>'
                                + '</div>';
            template += colOpenTemplate;
            template += cardOpenTemplate;
            template += overlayTemplate;

            template += '<img class="card-img" src="" alt="Card image" id="img-' + element.deviceId + '">';
            template += '<div class="card-img-overlay">'
                        + '<h6 class="card-title text-uppercase" id="title-' + element.deviceId + '"></h6>'
                        + '<h6 class="card-subtitle mb-2 text-muted" id="name-' + element.deviceId + '"></h6>'
                        //+ '<p class="text-success" id="status-' + element.deviceId + '"></p>'
                        + '<p><br></p>'
                        + '<p class="text-body" id="smallInfo-' + element.deviceId + '">'
                        + 'IP: <span class="text-primary" id="ip-' + element.deviceId + '"></span><br>'
                        + '</p>'
                        + '</div>'
                        + '</div>'
                        + '</div>';
        }
    });

    return template;
}

function fillItems(msg) {
    msg.settingsInputData.forEach(function(element, index) {
        $('#img-' + element.deviceId.toString()).attr('src', 'bg/' + element.deviceType + '.png');
        $('#title-' + element.deviceId.toString()).text(element.deviceType);
        $('#name-' + element.deviceId.toString()).text(element.dispName);
        $('#status-' + element.deviceId.toString()).text(element.status.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); }));
        
        if (element.status == "connected") {
            if ($('#smallInfo-' + element.deviceId.toString()).children().length == 0) {
                $('#smallInfo-' + element.deviceId.toString()).append('IP: <span class="text-primary" id="ip-' + element.deviceId + '"></span><br>'
                                                                    + 'Latest value: <span class="text-primary" id="latest-' + element.deviceId + '"></span>'
                );
            }                    
            $('#ip-' + element.deviceId.toString()).text(element.deviceIp);
            $('#status-' + element.deviceId.toString()).removeClass('text-danger').addClass('text-success');
        
            if (element.deviceCategory == "sensor") {
                $('#card-' + element.deviceId.toString()).attr('data-target', '#sensorModalCon').removeClass('border-danger');
                $('#latest-' + element.deviceId.toString()).text(element.lastReceivedVal.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); }));
            }
            else if (element.deviceCategory == "actuator") {
                $('#card-' + element.deviceId.toString()).attr('data-target', '#actuatorModalCon').removeClass('border-danger');
            }
        }
        else {
            $('#status-' + element.deviceId.toString()).removeClass('text-success').addClass('text-danger');
            $('#smallInfo-' + element.deviceId.toString()).empty();

            if (element.deviceCategory == "sensor") {
                $('#card-' + element.deviceId.toString()).attr('data-target', '#sensorModalDiscon').addClass('border-danger');
            }
            else if (element.deviceCategory == "actuator") {
                $('#card-' + element.deviceId.toString()).attr('data-target', '#actuatorModalDiscon').addClass('border-danger');
            }
        }
    });
}

function fillSensorModal(callerId, modalType) {
    var sensorDataElement = dataMsg.settingsInputData.find(x => x.deviceId.toString() === callerId);
    
    if (modalType == 'sensorModalCon') {
        $('#sensorId').text(sensorDataElement.deviceId);
        $('#sensorIp').text(sensorDataElement.deviceIp);
        $('#sensorType').text(sensorDataElement.deviceType);
        $('#sensorConn').text(sensorDataElement.status.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); }));

        $('#inputName').val(sensorDataElement.dispName);
        if (sensorDataElement.isVisible == 1) {
            $('input:radio[name=radioVisibility]')[0].checked = true;
        }
        else if (sensorDataElement.isVisible == 0) {
            $('input:radio[name=radioVisibility]')[1].checked = true;
        }

        $('#inputDataPointAmount').val(sensorDataElement.shownDataPoints);
        $('#inputInterval').val(sensorDataElement.interval);
        
        // TODO  unit matching type                                                                <<--------------------------------  !!
    }
    else if (modalType == 'sensorModalDiscon') {
        $('#sensorIdDiscon').text(sensorDataElement.deviceId);
        $('#sensorIpDiscon').text(sensorDataElement.deviceIp);
        $('#sensorTypeDiscon').text(sensorDataElement.deviceType);
        $('#sensorConnDiscon').text(sensorDataElement.status.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); }));

        $('#inputNameDiscon').val(sensorDataElement.dispName);
        if (sensorDataElement.isVisible == 1) {
            $('input:radio[name=radioVisibilityDiscon]')[0].checked = true;
        }
        else if (sensorDataElement.isVisible == 0) {
            $('input:radio[name=radioVisibilityDiscon]')[1].checked = true;
        }

        $('#inputDataPointAmountDiscon').val(sensorDataElement.shownDataPoints);
        $('#inputIntervalDiscon').val(sensorDataElement.interval);
        
        // TODO  unit matching type                                                                <<--------------------------------  !!
    }
}

function fillActuatorModal(callerId, modalType) {
    var actuatorDataElement = dataMsg.settingsInputData.find(x => x.deviceId.toString() === callerId);
    
    if (modalType == 'actuatorModalCon') {
        $('#actuatorId').text(actuatorDataElement.deviceId);
        $('#actuatorIp').text(actuatorDataElement.deviceIp);
        $('#actuatorType').text(actuatorDataElement.deviceType);
        $('#actuatorConn').text(actuatorDataElement.status.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); }));
        
        $('#inputActuatorName').val(actuatorDataElement.dispName);
        if (actuatorDataElement.manControl == 1) {
            $('input:radio[name=radioManual]')[0].checked = true;
        }
        else if (actuatorDataElement.manControl == 0) {
            $('input:radio[name=radioManual]')[1].checked = true;
        }

        //generate options for all sensors
        $('#selectSensorLink').empty();
        $('#selectSensorLink').append(new Option('None', '0'));
        dataMsg.settingsInputData.forEach(function(element, index) {
            if (element.deviceCategory == 'sensor') {
                $('#selectSensorLink').append(new Option(element.deviceType + ' - ' + element.dispName, element.deviceId.toString()));
            }
        });

        if (actuatorDataElement.linkedTo == 0) {
            $('#selectSensorLink option[value="0"]').attr('selected', true);
        }
        else {
            var linkedSensor = dataMsg.settingsInputData.find(x => x.deviceId === actuatorDataElement.linkedTo);
            $('#selectSensorLink option[value="' + linkedSensor.deviceId + '"]').attr('selected', true);

            //generate options for linked sensor
            addOptionsSelectMeasurand('#selectMeasurand', linkedSensor.deviceType);
        }

        $('#selectThreshold option[value="' + actuatorDataElement.linkRule + '"]').attr('selected', true);
        $('#inputThreshold').val(actuatorDataElement.threshold);

        $('#selectMeasurand option[value="' + actuatorDataElement.linkedMeas + '"]').attr('selected', true);

        

    }
    else if (modalType == 'actuatorModalDiscon') {
        $('#actuatorIdDiscon').text(actuatorDataElement.deviceId);
        $('#actuatorIpDiscon').text(actuatorDataElement.deviceIp);
        $('#actuatorTypeDiscon').text(actuatorDataElement.deviceType);
        $('#actuatorConnDiscon').text(actuatorDataElement.status.replace(/\b[a-z]/g, function(letter) { return letter.toUpperCase(); }));
        
        $('#inputActuatorNameDiscon').val(actuatorDataElement.dispName);
        if (actuatorDataElement.manControl == 1) {
            $('input:radio[name=radioManualDiscon]')[0].checked = true;
        }
        else if (actuatorDataElement.manControl == 0) {
            $('input:radio[name=radioManualDiscon]')[1].checked = true;
        }

        //generate options for all sensors
        $('#selectSensorLinkDiscon').empty();
        $('#selectSensorLinkDiscon').append(new Option('None', '0'));
        dataMsg.settingsInputData.forEach(function(element, index) {
            if (element.deviceCategory == 'sensor') {
                $('#selectSensorLinkDiscon').append(new Option(element.deviceType + ' - ' + element.dispName, element.deviceId.toString()));
            }
        });

        if (actuatorDataElement.linkedTo == 0) {
            $('#selectSensorLinkDiscon option[value="0"]').attr('selected', true);
        }
        else {
            var linkedSensor = dataMsg.settingsInputData.find(x => x.deviceId === actuatorDataElement.linkedTo);
            $('#selectSensorLinkDiscon option[value="' + linkedSensor.deviceId + '"]').attr('selected', true);

            //generate options for linked sensor
            addOptionsSelectMeasurand('#selectMeasurandDiscon', linkedSensor.deviceType);
        }

        $('#selectThresholdDiscon option[value="' + actuatorDataElement.linkRule + '"]').attr('selected', true);
        $('#inputThresholdDiscon').val(actuatorDataElement.threshold);

        $('#selectMeasurandDiscon option[value="' + actuatorDataElement.linkedMeas + '"]').attr('selected', true);
    }
}


function addOptionsSelectMeasurand(id, deviceType) {
    $(id).empty();
    switch (deviceType) {
        case "DHT22":
            $(id).append(new Option("Temperature", "T"));
            $(id).append(new Option("Humidity", "H"));
            break;
        case "BME280":
            $(id).append(new Option("Temperature", "T"));
            $(id).append(new Option("Humidity", "H"));
            $(id).append(new Option("Pressure", "P"));
            break;
        case "HCSR501":
            $(id).append(new Option("Motion", "M"));
            break;
        case "BUTTON":
            $(id).append(new Option("Button push", "B"));
            break;
        case "HCSR04":
            $(id).append(new Option("Distance", "D"));
            break;
        case "CCS811":
            $(id).append(new Option("eCO2", "C"));
            $(id).append(new Option("VOC", "V"));
            break;
        case "MAX44009":
            $(id).append(new Option("Light intensity", "L"));
            break;
        case "BMP280":
            $(id).append(new Option("Temperature", "T"));
            $(id).append(new Option("Humidity", "H"));
            $(id).append(new Option("Pressure", "P"));
            $(id).append(new Option("VOC", "V"));
            break;
        case "MPR121":
            $(id).append(new Option("E-field", "E"));
            break;
        case "MPU6050":
            $(id).append(new Option("Gyro", "G"));
            $(id).append(new Option("Acceleration", "A"));
            break;
        case "SI1145":
            $(id).append(new Option("UV", "U"));
            break;
        case "TSL2561":
            $(id).append(new Option("Light intensity", "L"));
            break;
        case "TX20":
            $(id).append(new Option("Wind speed", "W"));
            break;
        case "VEML6070":
            $(id).append(new Option("UV", "U"));
            break;
        case "ANALOG":
            $(id).append(new Option("Voltage", "O"));
            break;
        case "BLUEDOT":
            $(id).append(new Option("Temperature", "T"));
            $(id).append(new Option("Humidity", "H"));
            $(id).append(new Option("Pressure", "P"));
            $(id).append(new Option("Light intensity", "L"));
            break;
        default:
            $(id).append(new Option("-", ""));
            break;
    }
}


function removeDevice(caller) {
    var idToRemove = '0';
    switch(caller) {
        case 'btnSensorDelete':
            idToRemove = modalSensorConCaller.split('-')[1];
            $(modalSensorConCaller).parent().remove();
            $('#sensorModalCon').modal('hide');
            break;
        case 'btnSensorDeleteDiscon':
            idToRemove = modalSensorDisconCaller.split('-')[1];
            $(modalActuatorDisconCaller).parent().remove();
            $('#sensorModalDiscon').modal('hide');
            break;
        case 'btnActuatorDelete':
            idToRemove = modalActuatorConCaller.split('-')[1];
            $(modalActuatorConCaller).parent().remove();
            $('#actuatorModalCon').modal('hide');
            break;
        case 'btnActuatorDeleteDiscon':
            idToRemove = modalActuatorDisconCaller.split('-')[1];
            $(modalActuatorDisconCaller).parent().remove();
            $('#actuatorModalDiscon').modal('hide');
            break;
        default:
            break;
    }

    uibuilder.send({
        'topic': 'removeDevice',
        'payload': idToRemove
    });

    uibuilder.sendCtrl({
        'uibuilderCtrl': 'ready for content',
        'removedDevice': true
    });
}