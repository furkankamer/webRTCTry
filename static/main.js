'use strict';

/****************************************************************************
 * Initial setup
 ****************************************************************************/
var index = 0;

grabWebCamVideo();
var configuration = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }],
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
};

//var configuration = null;
var readyOn = 0;
// var roomURL = document.getElementById('url');
var video = document.querySelector('video');
var photo = document.getElementById('photo');
var photoContext = photo.getContext('2d');
var trail = document.getElementById('trail');
var snapBtn = document.getElementById('snap');
var sendBtn = document.getElementById('send');
var snapAndSendBtn = document.getElementById('snapAndSend');
var videoElem = document.getElementById("videoElem");
var photoContextW;
var photoContextH;

// Attach event handlers
snapBtn.addEventListener('click', snapPhoto);
sendBtn.addEventListener('click', sendPhoto);
snapAndSendBtn.addEventListener('click', snapAndSend);

// Disable send buttons by default.
sendBtn.disabled = true;
snapAndSendBtn.disabled = true;

// Create a random room if not already present in the URL.
var isInitiator;
var room = window.location.hash.substring(1);
if (!room) {
    room = window.location.hash = randomToken();
}


/****************************************************************************
 * Signaling server
 ****************************************************************************/

// Connect to the signaling server

/**
 * Updates URL on the page so that users can copy&paste it to their peers.
 */
// function updateRoomURL(ipaddr) {
//   var url;
//   if (!ipaddr) {
//     url = location.href;
//   } else {
//     url = location.protocol + '//' + ipaddr + ':2013/#' + room;
//   }
//   roomURL.innerHTML = url;
// }

/****************************************************************************
 * User media (webcam)
 ****************************************************************************/

function grabWebCamVideo() {
    console.log('Getting user media (video) ...');
    navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
        })
        .then(gotStream)
        .catch(function(e) {
            alert('getUserMedia() error: ' + e);
        });
}

function gotStream(stream) {
    console.log('getUserMedia video stream URL:', stream);
    window.stream = stream; // stream available to console
    video.srcObject = stream;
    video.onloadedmetadata = function() {
        photo.width = photoContextW = video.videoWidth;
        photo.height = photoContextH = video.videoHeight;
        console.log('gotStream with width and height:', photoContextW, photoContextH);
    };
    show(snapBtn);
    var peerConn;
    var peerConnThird;
    var dataChannel;
    function thirdPeer(){
      createPeerConnectionThird(isInitiator,configuration);
    }
    function signalingMessageCallback(message) {
        if (typeof message !== 'object')
            return;
        if (message.type === 'offer') {
            console.log('Got offer. Sending answer to peer.');
            peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                logError);
            peerConn.createAnswer(onLocalSessionCreated, logError);

        } else if (message.type === 'answer') {
            console.log('Got answer.');
            peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {},
                logError);

        } else if (message.type === 'candidate') {
            peerConn.addIceCandidate(new RTCIceCandidate({
                candidate: message.candidate,
                sdpMLineIndex: message.label,
                sdpMid: message.id
            }));

        }
    }
    function signalingMessageCallbackThird(message) {
        if (typeof message !== 'object')
            return;
        if (message.type === 'offer') {
            console.log('Got offer. Sending answer to peer.');
            peerConnThird.setRemoteDescription(new RTCSessionDescription(message), function() {},
                logError);
            peerConnThird.createAnswer(onLocalSessionCreatedThird, logError);

        } else if (message.type === 'answer') {
            console.log('Got answer.');
            peerConnThird.setRemoteDescription(new RTCSessionDescription(message), function() {},
                logError);

        } else if (message.type === 'candidate') {
            peerConnThird.addIceCandidate(new RTCIceCandidate({
                candidate: message.candidate,
                sdpMLineIndex: message.label,
                sdpMid: message.id
            }));

        }
    }

    var socket = io.connect();

    socket.on('ipaddr', function(ipaddr) {
        console.log('Server IP address is: ' + ipaddr);
        // updateRoomURL(ipaddr);
    });

    socket.on('created', function(data) {
        isInitiator = true;
        console.log('Created room', data["room"], '- my client ID is', data["id"]);
    });

    socket.on('joined', function(data) {
        index = data["index"];
        isInitiator = false;
        console.log('This peer has joined room', data["room"], 'with client ID', data["id"]);
        if(index < 2)
          createPeerConnection(isInitiator, configuration);
        else
          thirdPeer();
    });

    socket.on('full', function(room) {
        alert('Room ' + room + ' is full. We will create a new room for you.');
        window.location.hash = '';
        window.location.reload();
    });

    socket.on('ready', function() {
        console.log('Socket is ready');
        if(index < 2)
          createPeerConnection(isInitiator, configuration);
        else
          thirdPeer();
    });

    socket.on('log', function(array) {
        console.log.apply(console, array);
    });

    socket.on('message', function(message) {
        console.log('Client received message:', typeof message);
        if(index < 2)
          signalingMessageCallback(message);
        else
          signalingMessageCallbackThird(message);

    });

    // Joining a room.
    socket.emit('create or join', room);

    if (location.hostname.match(/localhost|127\.0\.0/)) {
        socket.emit('ipaddr');
    }

    // Leaving rooms and disconnecting from peers.
    socket.on('disconnect', function(reason) {
        console.log(`Disconnected: ${reason}.`);
        sendBtn.disabled = true;
        snapAndSendBtn.disabled = true;
    });

    socket.on('bye', function(room) {
        console.log(`Peer leaving room ${room}.`);
        sendBtn.disabled = true;
        snapAndSendBtn.disabled = true;
        // If peer did not create the room, re-enter to be creator.
        if (!isInitiator) {
            window.location.reload();
        }
    });

    window.addEventListener('unload', function() {
        console.log(`Unloading window. Notifying peers in ${room}.`);
        socket.emit('bye', room);
    });


    /**
     * Send message to signaling server
     */
    function sendMessage(message) {
        console.log('Client sending message: ', message);
        socket.emit('message', message);
    }
    function createPeerConnectionThird(isInitiator, config) {
        console.log('Creating Peer connection as initiator?', isInitiator, 'config:', config);
        peerConnThird = new RTCPeerConnection(config);
        peerConnThird.addEventListener('connectionstatechange', e => {
            console.log(e.target.connectionState);
        });

        // send any ice candidates to the other peer
        peerConnThird.onicecandidate = function(event) {
            if (event.candidate) {
                sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            } else console.log('End of candidates.');
        };



        peerConnThird.onnegotiationneeded = () => peerConnThird.createOffer()
            .then(offer => peerConnThird.setLocalDescription(offer))
            .then(() => sendMessage(peerConnThird.localDescription));

        if (isInitiator) {
            stream.getTracks().forEach(track => peerConnThird.addTrack(track, stream));
            peerConnThird.ontrack = e => videoElem2.srcObject = e.streams[0];
            console.log('Creating Data Channel');
            /*
            dataChannel = peerConnThird.createDataChannel('photos');
            onDataChannelCreated(dataChannel);
            console.log('Creating an offer');
            */
            peerConnThird.createOffer().then(offer => peerConnThird.setLocalDescription(offer))
                .then(() => sendMessage(peerConnThird.localDescription))
                .catch(logError);

        } else {
            setTimeout(() => stream.getTracks().forEach(track => peerConnThird.addTrack(track, stream)), 1000);
            peerConnThird.ontrack = e => videoElem2.srcObject = e.streams[0];
            /*
            peerConnThird.ondatachannel = e => {
                dataChannel = e.channel;
                onDataChannelCreated(dataChannel);
            };
            */
        }
    }

    function createPeerConnection(isInitiator, config) {
        console.log('Creating Peer connection as initiator?', isInitiator, 'config:', config);
        peerConn = new RTCPeerConnection(config);
        peerConn.addEventListener('connectionstatechange', e => {
            console.log(e.target.connectionState);
        });

        // send any ice candidates to the other peer
        peerConn.onicecandidate = function(event) {
            if (event.candidate) {
                sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            } else console.log('End of candidates.');
        };



        peerConn.onnegotiationneeded = () => peerConn.createOffer()
            .then(offer => peerConn.setLocalDescription(offer))
            .then(() => sendMessage(peerConn.localDescription));

        if (isInitiator) {
            stream.getTracks().forEach(track => peerConn.addTrack(track, stream));
            peerConn.ontrack = e => videoElem.srcObject = e.streams[0];
            console.log('Creating Data Channel');
            dataChannel = peerConn.createDataChannel('photos');
            onDataChannelCreated(dataChannel);
            console.log('Creating an offer');
            peerConn.createOffer().then(offer => peerConn.setLocalDescription(offer))
                .then(() => sendMessage(peerConn.localDescription))
                .catch(logError);

        } else {
            setTimeout(() => stream.getTracks().forEach(track => peerConn.addTrack(track, stream)), 1000);
            peerConn.ontrack = e => videoElem.srcObject = e.streams[0];
            peerConn.ondatachannel = e => {
                dataChannel = e.channel;
                onDataChannelCreated(dataChannel);
            };
        }
    }
    function onLocalSessionCreatedThird(desc) {
      console.log('local session created:', desc);
      peerConnThird.setLocalDescription(desc).then(() => {
          console.log('sending local desc:', peerConnThird.localDescription);
          sendMessage(peerConnThird.localDescription);
      }).catch(logError);
    }

    function onLocalSessionCreated(desc) {
        console.log('local session created:', desc);
        peerConn.setLocalDescription(desc).then(() => {
            console.log('sending local desc:', peerConn.localDescription);
            sendMessage(peerConn.localDescription);
        }).catch(logError);
    }

    function onDataChannelCreated(channel) {
        channel.onopen = () => {
            sendBtn.disabled = false;
            snapAndSendBtn.disabled = false;
        };

        channel.onclose = () => {
            sendBtn.disabled = true;
            snapAndSendBtn.disabled = true;
        }

        channel.onmessage = (adapter.browserDetails.browser === 'firefox') ?
            receiveDataFirefoxFactory() : receiveDataChromeFactory();
    }

    function receiveDataChromeFactory() {
        var buf, count;
        return function onmessage(event) {
            if (typeof event.data === 'string') {
                buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
                count = 0;
                console.log('Expecting a total of ' + buf.byteLength + ' bytes');
                return;
            }

            var data = new Uint8ClampedArray(event.data);
            buf.set(data, count);

            count += data.byteLength;
            console.log('count: ' + count);

            if (count === buf.byteLength) {
                renderPhoto(buf);
            }
        };
    }

    function receiveDataFirefoxFactory() {
        var count, total, parts;

        return function onmessage(event) {
            if (typeof event.data === 'string') {
                total = parseInt(event.data);
                parts = [];
                count = 0;
                console.log('Expecting a total of ' + total + ' bytes');
                return;
            }

            parts.push(event.data);
            count += event.data.size;
            console.log('Got ' + event.data.size + ' byte(s), ' + (total - count) +
                ' to go.');

            if (count === total) {
                console.log('Assembling payload');
                var buf = new Uint8ClampedArray(total);
                var compose = function(i, pos) {
                    var reader = new FileReader();
                    reader.onload = function() {
                        buf.set(new Uint8ClampedArray(this.result), pos);
                        if (i + 1 === parts.length) {
                            console.log('Done. Rendering photo.');
                            renderPhoto(buf);
                        } else {
                            compose(i + 1, pos + this.result.byteLength);
                        }
                    };
                    reader.readAsArrayBuffer(parts[i]);
                };
                compose(0, 0);
            }
        };
    }
}

/****************************************************************************
 * WebRTC peer connection and data channel
 ****************************************************************************/



/****************************************************************************
 * Aux functions, mostly UI-related
 ****************************************************************************/

function snapPhoto() {
    photoContext.drawImage(video, 0, 0, photo.width, photo.height);
    show(photo, sendBtn);
}

function sendPhoto() {
    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;
    console.log('width and height ', photoContextW, photoContextH);
    var img = photoContext.getImageData(0, 0, photoContextW, photoContextH),
        len = img.data.byteLength,
        n = len / CHUNK_LEN | 0;

    console.log('Sending a total of ' + len + ' byte(s)');

    if (!dataChannel) {
        logError('Connection has not been initiated. ' +
            'Get two peers in the same room first');
        return;
    } else if (dataChannel.readyState === 'closed') {
        logError('Connection was lost. Peer closed the connection.');
        return;
    }

    dataChannel.send(len);

    // split the photo and send in chunks of about 64KB
    for (var i = 0; i < n; i++) {
        var start = i * CHUNK_LEN,
            end = (i + 1) * CHUNK_LEN;
        console.log(start + ' - ' + (end - 1));
        dataChannel.send(img.data.subarray(start, end));
    }

    // send the reminder, if any
    if (len % CHUNK_LEN) {
        console.log('last ' + len % CHUNK_LEN + ' byte(s)');
        dataChannel.send(img.data.subarray(n * CHUNK_LEN));
    }
}

function snapAndSend() {
    snapPhoto();
    sendPhoto();
}

function renderPhoto(data) {
    console.log(data);
    var canvas = document.getElementById("snapImg")
    canvas.width = photoContextW;
    canvas.height = photoContextH;
    canvas.classList.add('incomingPhoto');
    // trail is the element holding the incoming images

    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    var img = context.createImageData(photoContextW, photoContextH);
    img.data.set(data);
    context.putImageData(img, 0, 0);
}

function show() {
    Array.prototype.forEach.call(arguments, function(elem) {
        elem.style.display = null;
    });
}

function hide() {
    Array.prototype.forEach.call(arguments, function(elem) {
        elem.style.display = 'none';
    });
}

function randomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
    if (!err) return;
    if (typeof err === 'string') {
        console.warn(err);
    } else {
        console.warn(err.toString(), err);
    }
}