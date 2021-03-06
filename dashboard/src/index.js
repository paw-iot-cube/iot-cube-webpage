// jshint maxerr:1000
/*global document,$,window,uibuilder */
/*
  Based on uibuilder example by Julian Knight (Totally Information)
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
//'use strict';

var dataMsg;

// When JQuery is ready, update
$( document ).ready(function() {
    // Turn on debugging for uibuilderfe (default is off)
    uibuilder.debug(true);

    // initialise confirmation plugin
    $('[data-toggle=confirmation]').confirmation({
        rootSelector: '[data-toggle=confirmation]'
        
    });

    uibuilder.sendCtrl({
        'uibuilderCtrl': 'ready for content',
        'test': 'test'
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
    uibuilder.onChange('msg', function(newMsg) {
        console.info('indexjs:msg: property msg has changed! ', newMsg);
        console.info('msg has changed');
        //check if msg is data supply on page load or data update
        if (newMsg.topic == "onLoadData" && newMsg.payload == "lastItem") {
            //ensure, every item has data points attached
            var isMissingDataPoints = false;
            newMsg.dashboardData.forEach(element => {
                if (typeof element.DataPoints === 'undefined') {
                    isMissingDataPoints = true;
                }
            });

            if (typeof newMsg.dashboardGroups === 'undefined') {
                isMissingDataPoints = true;
            }
            console.log("missing datapoints? -> " + isMissingDataPoints.toString());

            if (!isMissingDataPoints) { //&& $('#grid').children().length == 0) {           
                $('#grid').empty();     
                //sort groups to match htmlid sequence
                newMsg.dashboardGroups.sort(function(a, b) {
                    var a1 = a.htmlId, b1 = b.htmlId;
                    if (a1 == b1) return 0;
                    return a1 > b1 ? 1: -1;
                });

                dataMsg = newMsg;

                generateGrid(newMsg);

                console.log("onLoad");
                fillDashboardWithData(newMsg);
            }            
        }
        else if (newMsg.topic == "updateData") {
            console.log("add/update");
            dataMsg = newMsg;
            fillDashboardWithData(newMsg);            
        }
        else if (newMsg.topic == "discoveryData") {
            console.log("discovery");

            dataMsg = newMsg;

            //check if new group and items needed
            if ($('#card-grp-' + newMsg.itemData.numberGroup).length == 0) {
                //check if new group can be put into an existing row or not, based on maxGroupsInRow value (same as in generateGrid function)
                var maxGroupsInRow = 2;
                var newGroupId = newMsg.itemData.numberGroup;

                if ((newGroupId % 2) == 0) {
                    //newGroupId is even, so last already existing id is odd -> if maxGroupsInRow even, then enough space for new group in row
                    var newGroupTemplate = generateGridGroupWithItems(newGroupId, newMsg.itemList);
                    $('#grid').children().last().append(newGroupTemplate);
                }
                else if ((newGroupId % 2) == 1) {
                    //newGroupId is odd -> need new row, if maxGroupsInRow is even
                    var rowOpenTemplate = '<!--Row-->'
                                        + '<div class="card-deck mt-3">';
                    var newGroupTemplate = generateGridGroupWithItems(newGroupId, newMsg.itemList);

                    var template = rowOpenTemplate;
                    template += newGroupTemplate;
                    template += '</div>';
                    
                    $('#grid').last().append(template);
                }
            }

            newMsg.dashboardData = [];
            newMsg.dashboardData.push(newMsg.itemData);
            fillDashboardWithData(newMsg);

        }

        feather.replace();
    });
    
}); // --- End of JQuery Ready --- //

var modalEditCaller;

$(document).on('shown.bs.modal', '#editModal', function(event) {
    //get element that triggered the modal
    var triggerElement = $(event.relatedTarget);
    
    console.log($(triggerElement[0]).parent().parent().attr('id'));
    //save caller id
    modalEditCaller = $(triggerElement[0]).parent().parent().attr('id');

    fillEditModal($(triggerElement[0]).parent().parent().attr('id').replace('card-grp-', ''));
});

$('#formEditGroup').on('submit', function(event) {
    event.preventDefault();

    

    var collection = {
        'htmlId': $('#spanGroupNum').text(),
        'name': $('#inputGroupName').val()
    };

    uibuilder.send({
        'topic': 'groupNameEdit',
        'payload': collection
    });

    $('#card-grp-' + $('#spanGroupNum').text()).find('.card-header span').text($('#inputGroupName').val());

    $('#editModal').modal('hide');
});

//handle group removal when confirmed
$(document).on('confirmed.bs.confirmation', function(event) {
    var triggerGroupId = $(event.target).parent().parent().attr('id');
    
    removeGroupAndItems(triggerGroupId);
});

function removeGroupAndItems(groupId) {
    var itemIdsInGroup = [];
    
    //get all items in this group
    $('.card', $('#' + groupId)).each(function() {
        itemIdsInGroup.push($(this).attr('id').split('-')[4]);
    });

    var collection = {
        'topic': 'removeGroupAndItems',
        'items' : itemIdsInGroup,
        'group' : groupId.split('-')[2]
    };

    uibuilder.send(collection);
}


function generateGrid(msg) {
    var maxGroupsInRow = 2;
    var rowOpenTemplate = '<!--Row-->'
                        + '<div class="card-deck mt-3">';
    var template = '';

    if (msg.dashboardGroups.length > maxGroupsInRow) {
        for (let i = 0; i < (msg.dashboardGroups.length); i += maxGroupsInRow) {
            template += rowOpenTemplate;

            //generate group templates
            template += generateGridGroupWithItems(msg.dashboardGroups[i].htmlId, msg.dashboardGroups[i].items);
            //check if odd number of groups and not last groups to prevent exception in last group
            if ((msg.dashboardGroups.length % 2) == 0 || i < (msg.dashboardGroups.length - maxGroupsInRow)) {
                template += generateGridGroupWithItems(msg.dashboardGroups[i+1].htmlId, msg.dashboardGroups[i+1].items);
            }

            template += '</div>';
        }       

    }
    else {
        template += rowOpenTemplate;

        //generate group templates
        msg.dashboardGroups.forEach(element => {
            template += generateGridGroupWithItems(element.htmlId, element.items);
        });

        template += '</div>';
    }

    $('#grid').append(template);

    //initialise confirmation plugin (for group deletion button)
    $('[data-toggle=confirmation]').confirmation({
        rootSelector: '[data-toggle=confirmation]'
        
    });
}

function generateGridGroupWithItems(grpId, items) {
    var groupOpenTemplate = '<!--Group-->'
                            + '<div class="card" id="card-grp-' + grpId + '">'
                            + '<div class="card-header">'
                            + '<span></span>'
                            + '<button type="button" class="btn ml-1" data-toggle="modal" data-target="#editModal">'
                            + '<i data-feather="edit-3"></i>'
                            + '</button>'
                            + '<button type="button" class="btn" data-toggle="confirmation" data-placement="right" data-singleton="true" data-title="Do you want to remove this group?" data-btn-ok-class="btn-danger">'
                            + '<i data-feather="trash-2"></i>'
                            + '</button>'
                            + '</div>'
                            + '<div class="card-body">';

    var template = '';
    template += groupOpenTemplate;

    template += generateGridItems(grpId, items);
    template += '</div>'
                + '</div>';
    
    return template;
}

function generateGridItems(grpId, items) {
    var itemRowTemplate = '<!--ItemRow-->'
                        + '<div class="card-deck mb-3">';

    var maxItemsInRow = 3;
    var template = '';
    var processedItemsCount = 0;

    if (items.length > maxItemsInRow) {
        for (let i = 0; i < (items.length); i += maxItemsInRow) {
            template += itemRowTemplate;
            
            for (let j = 0; j < maxItemsInRow; j++) {
                //generate item templates
                if (items.length > (i+j)) {
                    template += generateGridItem(grpId, (i + j + 1), items[(i + j)]);
                }
            }

            template += '</div>';
        }
    }
    else {
        template += itemRowTemplate;

        items.forEach(function(element, index) {
            template += generateGridItem(grpId, index+1, element);
        });

        template += '</div>';
    }

    return template;
}

function generateGridItem(grpId, itemId, itemType) {
    var itemOpenTemplate = '<div class="card draggable" id="card-grp-' + grpId + '-item-' + itemId + '" draggable="true" ondragstart="drag(event)">'
                        + '<div class="card-body">'
                        + '<h6 class="card-title text-uppercase"></h6>'
                        + '<h6 class="card-subtitle text-muted mb-1"></h6>';

    var itemValTemplate = '<h3 class="display-4"></h3>'
                        + '</div>'
                        + '</div>';
    var itemChartTemplate = '<canvas id="canv-grp-' + grpId + '-item-' + itemId + '"></canvas>'
                        + '</div>'
                        + '</div>';

    var template = '';
    template += itemOpenTemplate;

    if (itemType == "value") {
        template += itemValTemplate;
    }
    else if (itemType == "chart") {
        template += itemChartTemplate;
    }

    template += '<div class="dropzone rounded" ondrop="drop(event)" ondragover="allowDrop(event)" ondragleave="clearDrop(event)"> &nbsp; </div>';

    return template;
}



function fillDashboardWithData(msg) {
    //colour for chart lines
    var colour = '#0275d8';

    msg.dashboardData.forEach(element => {
        //build ids for linking with template
        var groupId = "card-grp-" + element.numberGroup.toString();
        var itemId = groupId + "-item-" + element.numberItem.toString();
        if (element.htmlId.includes("chart")) {
            var canvasId = "canv-grp-" + element.numberGroup.toString() + "-item-" + element.numberItem.toString();
        }

        //fill said ids with data
        if (msg.topic == "onLoadData") {
            //fill group titles
            $('#' + groupId).find('.card-header span').text(msg.dashboardGroups.find(x => x.htmlId === (element.numberGroup.toString())).name);
        }

        if (element.deviceStatus == "connected") {
            $('#' + itemId).removeClass('border-danger disabledDiv');
            colour = '#0275d8';
        }
        else if (element.deviceStatus == "disconnected") {
            $('#' + itemId).addClass('border-danger disabledDiv');
            colour = '#d9534f';
        }
        
        //fill item titles and values
        switch (element.measType) {
            case "Hum":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current humidity");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " %");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Humidity history [%]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Temp":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current temperature");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " °C");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Temperature history [°C]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Press":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current pressure");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " Pa");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Pressure history [Pa]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Mot":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current motion status");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " ");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Motion history");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "But":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current button status");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " ");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Button history");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Lum":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current illuminance");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " Lux");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Illuminance history [Lux]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Dist":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current distance");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " cm");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Distance history [cm]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Co2":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current CO2 value");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " ppm");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("CO2 history [ppm]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Voc":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current VOC");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " ppb");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("VOC history [ppb]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Gyro":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current Gyro");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " °/s");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Gyro history [°/s]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Acc":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current acceleration");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " m/s²");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Acceleration history [m/s²]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Uv":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current UV index");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " ");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("UV history");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Efi":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Currently touched");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text((element.DataPoints[0].value >>> 0).toString(2).padStart(8, '0') + " ");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Touch history");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Wind":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current wind speed");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " m/s");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Wind speed history [m/s]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;
            case "Ana":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current voltage");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined' && element.DataPoints.length > 0) {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " V");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Voltage history [V]");
                    $('#' + itemId).find('.card-subtitle').text(element.dispName);
                    if (typeof element.DataPoints !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour, msg.topic);
                    }
                }
                break;


            default:
                break;
        }

    });
}

function fillEditModal(callerId) {
    console.log(dataMsg);
    var dataElement = dataMsg.dashboardGroups.find(x => x.htmlId.toString() === callerId);
    
    $('#spanGroupNum').text(dataElement.htmlId);
    $('#inputGroupName').val(dataElement.name);
}


var lineChart;

function makeChart(dataArray, canvasId, colour, msgTopic) {
    // chart
    var canvas = $('#' + canvasId);

    var inputTimes = [];
    var inputData = [];
    //extract data parts from array
    dataArray.forEach(element => {
        inputTimes.push(element.timeunix);
        inputData.push(element.value);
    });

    //var inputTimes = [1558121936, 1558121937, 1558121938, 1558121939, 1558121940];
    //var inputData = [30, 31, 33.5, 30.2, 29.4];
    
    var inputLabels = [];
    
    var timeFormat =  'HH:mm:ss';
    
    //generate displayed time
    $.each(inputTimes, function (indexInArray, valueOfElement) {
        inputLabels.push(moment(valueOfElement).format(timeFormat));
    });
    
    // for testing: moment.unix(1558121936).format(timeFormat) with timeFormat = 'YYYY-MM-DD HH:mm:ss'
    
    var chartData = {
        labels: inputLabels,
        datasets: [{
            data: inputData,
            borderColor: colour,
            borderWidth: 4,
            pointBackgroundColor: colour
        }]
    };

    //console.log(chartData);
    //console.log(canvasId);
    
    if (canvas) {
        if (msgTopic == "onLoadData") {
            lineChart = new Chart(canvas, {
                type: 'line',
                data: chartData,
                options: {
                    scales: {
                        yAxes: [{
                            ticks: {
                                beginAtZero: false
                            }
                        }]
                    },
                    legend: {
                        display: false
                    }
                }
            });
        }
        else {
            lineChart = new Chart(canvas, {
                type: 'line',
                data: chartData,
                options: {
                    scales: {
                        yAxes: [{
                            ticks: {
                                beginAtZero: false
                            }
                        }]
                    },
                    legend: {
                        display: false
                    },
                    animation: {
                        duration: 0
                    }
                }
            });
        }
    }
}



//----------------------------------------
//              drag and drop
//----------------------------------------

const drag = (event) => {
    event.dataTransfer.setData("text/plain", event.target.id);
}
  
const allowDrop = (ev) => {
    ev.preventDefault();
    if (hasClass(ev.target,"dropzone")) {
        addNewClass(ev.target,"droppable");
    }
}

const clearDrop = (ev) => {
    removeAClass(ev.target,"droppable");
}

const drop = (event) => {
    event.preventDefault();
    const data = event.dataTransfer.getData("text/plain");
    const element = document.querySelector(`#${data}`);
    try {
        // remove the spacer content from dropzone
        event.target.removeChild(event.target.firstChild);
        // add the draggable content
        event.target.appendChild(element);
        // remove the dropzone parent
        unwrap(event.target);

        // send moved item information back to Node-Red
        var prevCardId = $('#'+data).prev('.card').attr('id');
        if ($('#'+data).next('.card').length > 0) {
            var nextCardId = $('#'+data).next('.card').attr('id');
        }
        else {
            var nextCardId = '';
        }

        var items = [];

        $('.card.draggable').each(function() {
            items.push(this.id);
            if ($(this).nextAll().length < 2) {
                items.push($(this).parent().parent().parent().attr('id'));
                //console.log($(this).parent().parent().parent());
            }
            
        });

        uibuilder.send({
            'topic': 'itemPositionEdit',
            'prevCardId': prevCardId,
            'nextCardId': nextCardId,
            'movedItemId': data,
            'items': items
        });


    } catch (error) {
        console.warn("can't move the item to the same place")
    }
    updateDropzones();
}

const updateDropzones = () => {
    /* after dropping, refresh the drop target areas
    so there is a dropzone after each item */    
    var dz = $('<div class="dropzone rounded" ondrop="drop(event)" ondragover="allowDrop(event)" ondragleave="clearDrop(event)"> &nbsp; </div>');
    
    // delete old dropzones
    $('.dropzone').remove();

    // insert new dropdzone after each item   
    dz.insertAfter('.card.draggable');
    
    // insert new dropzone in any empty swimlanes
    $(".items:not(:has(.card.draggable))").append(dz);
};

// helpers
function hasClass(target, className) {
    return new RegExp('(\\s|^)' + className + '(\\s|$)').test(target.className);
}

function addNewClass(element, clss) {
    if (!hasClass(element,clss)) element.className += " " + clss;
}

function removeAClass(element,clss) {
    if (hasClass(element,clss)) {
        var reg = new RegExp('(\\s|^)' + clss + '(\\s|$)');
        element.className = element.className.replace(reg, ' ');
    }
}

function unwrap(node) {
    node.replaceWith(...node.childNodes);
}
  