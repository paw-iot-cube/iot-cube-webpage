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

    // If msg changes - msg is updated when a standard msg is received from Node-RED over Socket.IO
    // Note that you can also listen for 'msgsReceived' as they are updated at the same time
    // but newVal relates to the attribute being listened to.
    uibuilder.onChange('msg', function(newVal){
        console.info('indexjs:msg: property msg has changed! ', newVal);
        $('#showMsg').text(JSON.stringify(newVal));
        //uibuilder.set('msgCopy', newVal)
        
        $('#latestPayload').text(newVal.payload);
    });

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
    
    //------------------------------------------------------------------
    $('#list').click(function(event){
        event.preventDefault();
        $('#elements .item').addClass('list-group-item');
    });
    $('#grid').click(function(event) {
        event.preventDefault();
        $('#elements .item').removeClass('list-group-item');
        $('#elements .item').addClass('grid-group-item');
    });

    var modalAddCaller;
    var modalDelCaller;

    $(document).on('shown.bs.modal', '#modalAdd', function(event) {
        //get element that triggered the modal
        var triggerElement = $(event.relatedTarget);
        modalAddCaller = triggerElement[0].parentElement.parentElement;
        console.log(triggerElement[0].parentElement.parentElement);
    });
    
    $(document).on('shown.bs.modal', '#modalDelete', function(event) {
        //get element that triggered the modal
        var triggerElement = $(event.relatedTarget);
        modalDelCaller = triggerElement[0].parentElement.parentElement.parentElement.parentElement.parentElement;
        console.log(triggerElement[0].parentElement.parentElement.parentElement.parentElement.parentElement);
    });

    // modal type dropdown
    $('.dropdown-menu li a').click(function() {
        $(this).parents('.dropdown').find('.btn').html($(this).text() + ' <span class="caret"></span>');
        $(this).parents('.dropdown').find('.btn').val($(this).data('value'));
    });

    // handle modal submit
    $('#modalForm').on('submit', function(e) {
        e.preventDefault();
        var nameVal = $('#formName').val();
        var typeVal = $('#dropdownType').val();
        if (typeVal === "") {
            //no type specified
            alert("Please choose a sensor type");
            return;
        }
        var delayVal = $('#formDelay').val();
        var gpioVal = $('#formGpio').val();
        var ipVal = $('#formIp').val();

        var collection = {
            'nameVal': nameVal,
            'typeVal': typeVal,
            'delayVal': delayVal,
            'gpioVal': gpioVal,
            'ipVal': ipVal
        };
        uibuilder.send({'topic':'modalDataAdd', 'payload': collection});       

        //close modal
        $('#modalAdd').modal('hide');
        
        //replace empty element with completed one
        var completeTemplate = $('#templateFullElem').html();
        completeTemplate = completeTemplate
            .replace('%TITLE%', nameVal)
            .replace('%DELAY%', delayVal)
            .replace('%GPIO%', gpioVal)
            .replace('%IP%', ipVal);
        if (typeVal != "sensorOther") {
            switch (typeVal) {
                case 'sensorDHT11':
                    completeTemplate = completeTemplate.replace('sensor.jpg', 'static/dht11.jpg');
                    break;
                case 'sensorBME280':
                    completeTemplate = completeTemplate.replace('sensor.jpg', 'static/bme280.jpg');
                    break;
                case 'sensorHCSR501':
                    completeTemplate = completeTemplate.replace('sensor.jpg', 'static/hcsr501.jpg');
                    break;
                case 'sensorButton':
                    completeTemplate = completeTemplate.replace('sensor.jpg', 'static/button.jpg');
                    break;
            
                default:
                    break;
            }
        }


        $(modalAddCaller).replaceWith($(completeTemplate).clone());
        addDragEventListeners();    //recall listener adding to make new elements draggable
    });
    
    $('#modalDelConfirm').click(function() {
        uibuilder.send({'topic': 'modalDel', 'payload':'THIS NEEDS TO BE CHANGED'});
        
        //close modal
        $('#modalDelete').modal('hide');
        
        //replace complete element with empty one
        var emptyTemplate = $('#templateEmptyElem').html();
        $(modalDelCaller).replaceWith($(emptyTemplate).clone());
        addDragEventListeners();    //recall listener adding to make new elements draggable
    });
    
    // add empty elements
    $('button.addRow').click(function(){
        var emptyTemplate = $('#templateEmptyElem').html();
        addRowFunc(emptyTemplate);
    });

    function addRowFunc(template) {
        var item = $(template).clone();
        $('#elements').append(item);
        addDragEventListeners();    //recall listener adding to make new elements draggable
    }
    
}); // --- End of JQuery Ready --- //


//++++++++++++++++++++++++++++++++++++++++++++Drag-and-Drop++++++++++++++++++++++++++++++++++++++++++++

var dragSrcEl = null;

function handleDragStart(e) {
    this.style.opacity = '0.4';  // this / e.target is the source node.
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault(); // Necessary. Allows us to drop.
    }

    e.dataTransfer.dropEffect = 'move';

    return false;
}

function handleDragEnter(e) {
    // this / e.target is the current hover target.
    this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');  // this / e.target is previous target element.
}

function handleDrop(e) {
    // this / e.target is current target element.

    if (e.stopPropagation) {
        e.stopPropagation(); // stops the browser from redirecting.
    }

    if (dragSrcEl != this) {
        // Set the source column's HTML to the HTML of the columnwe dropped on.
        dragSrcEl.innerHTML = this.innerHTML;
        this.innerHTML = e.dataTransfer.getData('text/html');
    }

    return false;
}

function handleDragEnd(e) {
    // this/e.target is the source node.
    this.style.opacity = '1.0';

    var cols = document.querySelectorAll('#elements .item .thumbnail');
    [].forEach.call(cols, function (col) {
        col.classList.remove('over');
    });
}

function addDragEventListeners(e) {
    var cols = document.querySelectorAll('#elements .item .thumbnail');
    [].forEach.call(cols, function(col) {
        col.addEventListener('dragstart', handleDragStart, false);
        col.addEventListener('dragenter', handleDragEnter, false);
        col.addEventListener('dragover', handleDragOver, false);
        col.addEventListener('dragleave', handleDragLeave, false);
        col.addEventListener('drop', handleDrop, false);
        col.addEventListener('dragend', handleDragEnd, false);
    });
}

addDragEventListeners();

