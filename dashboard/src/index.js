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

// When JQuery is ready, update
$( document ).ready(function() {
    // Turn on debugging for uibuilderfe (default is off)
    uibuilder.debug(true);

    // You can get attributes manually. Non-existent attributes return 'undefined'
    //console.dir(uibuilder.get('msg'))

    // You can also set things manually. See the list of attributes top of page.
    // You can add arbitrary attributes to the object, you cannot overwrite internal attributes

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
        //check if msg is data supply on page load or data update
        if (newMsg.topic == "onLoadData" && newMsg.payload == "lastItem") {
            //ensure, every item has data points attached
            var isMissingDataPoints = false;
            newMsg.dashboardData.forEach(element => {
                if (typeof element.DataPoints === 'undefined') {
                    isMissingDataPoints = true;
                }
            });

            if (!isMissingDataPoints) {
                fillDashboardWithData(newMsg);
            }

            console.log("new charts");
        }
        else if (newMsg.topic == "updateData") {
            addToLineChart(lineChart, newMsg, '#007bff');
            console.log("add/update");
        }

        
    });
    
}); // --- End of JQuery Ready --- //


function fillDashboardWithData(msg) {
    //colour for chart lines
    var colour = '#007bff';

    msg.dashboardData.forEach(element => {
        //build ids for linking with template
        var groupId = "card-grp-" + element.numberGroup.toString();
        var itemId = groupId + "-item-" + element.numberItem.toString();
        if (element.htmlId.includes("chart")) {
            var canvasId = "canv-grp-" + element.numberGroup.toString() + "-item-" + element.numberItem.toString();
        }

        //fill said ids with data
        //fill group titles
        $('#' + groupId).find('.card-header').text(msg.dashboardGroups.find(x => x.htmlId === groupId).name);
        
        //fill item titles and values
        switch (element.measType) {
            case "Hum":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current humidity");
                    if (typeof element.DataPoints[0] !== 'undefined') {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " %");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Humidity history [%]");
                    if (typeof element.DataPoints[0] !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour);
                    }
                }
                break;
            case "Temp":
                if (element.uiType == "val") {
                    $('#' + itemId).find('.card-title').text("Current temperature");
                    if (typeof element.DataPoints[0] !== 'undefined') {
                        $('#' + itemId).find('.display-4').text(element.DataPoints[0].value.toString() + " °C");
                    }
                }
                else if (element.uiType == "chart") {
                    $('#' + itemId).find('.card-title').text("Temperature history [°C]");
                    if (typeof element.DataPoints[0] !== 'undefined') {
                        makeChart(element.DataPoints, canvasId, colour);
                    }
                }
                break;
            //add other cases
        
            default:
                break;
        }

    });
}




var lineChart;

function makeChart(dataArray, canvasId, colour) {
    // chart
    var canvas = $('#' + canvasId);

    var inputTimes = [];
    var inputData = [];
    //extract data parts from array
    dataArray.forEach(element => {
        inputTimes.push(element.timeunix);
        inputData.push(element.value);
    });



    //var inputTitle = "Humidity history";
    //var inputTimes = [1558121936, 1558121937, 1558121938, 1558121939, 1558121940];
    //var inputData = [30, 31, 33.5, 30.2, 29.4];
    
    var inputLabels = [];
    
    var timeFormat =  'HH:mm:ss';
    //console.log(inputData);
    
    //generate displayed time
    $.each(inputTimes, function (indexInArray, valueOfElement) {
        inputLabels.push(moment.unix(valueOfElement).format(timeFormat));
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
    
    if (canvas) {
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
}

function addToLineChart(chart, msgObject, colour) {
    var inputTimes = msgObject.chart.times;
    var inputData = msgObject.chart.data;
    var inputLabels = [];

    console.log(inputData);
    
    var timeFormat =  'HH:mm:ss';
    
    //generate displayed time
    $.each(inputTimes, function (indexInArray, valueOfElement) {
        inputLabels.push(moment.unix(valueOfElement).format(timeFormat));
    });
    
    console.log(chart.data.labels);
    
    chart.data.labels = [];
    inputLabels.forEach((label) => {
        chart.data.labels.push(label);
    });
    chart.data.datasets.pop();
    chart.data.datasets.push({
            label: inputLabels,
            data: inputData,
            borderColor: colour,
            borderWidth: 4,
            pointBackgroundColor: colour
    });

    chart.update();
}