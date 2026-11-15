// =====================================================================
// Voice and video calls (WebRTC)
//
// How it works, in plain words:
//   1. The audio/video travels DIRECTLY between the two browsers.
//   2. Our Django server is only used to pass small "setup notes" between
//      them (who is calling, and how to connect). It uses the same
//      WebSocket as the chat. This is called "signaling".
//
// This file uses chat.js for: sendSignal(), isSocketOpen(), showToast()
// =====================================================================
(function () {

    // A STUN server helps two browsers find each other across home routers.
    // (Without internet, calls still work on the same computer or same Wi-Fi.)
    const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
    const RING_TIME = 30000;            // stop ringing after 30 seconds

    // ---------- Page elements ----------
    const voiceBtn = document.getElementById('voice-call-btn');
    const videoBtn = document.getElementById('video-call-btn');

    const overlay = document.getElementById('call-overlay');
    const remoteVideo = document.getElementById('remote-video');
    const localVideo = document.getElementById('local-video');
    const callStatus = document.getElementById('call-status');
    const callTimer = document.getElementById('call-timer');
    const callAvatar = document.getElementById('call-avatar');
    const muteBtn = document.getElementById('mute-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const hangupBtn = document.getElementById('hangup-btn');

    const incoming = document.getElementById('incoming-call');
    const incomingTitle = document.getElementById('incoming-title');
    const incomingAvatar = document.getElementById('incoming-avatar');
    const acceptBtn = document.getElementById('accept-btn');
    const declineBtn = document.getElementById('decline-btn');

    const peerAvatar = document.getElementById('peer-avatar');


    // ---------- Call state ----------
    // 'idle'       nothing is happening
    // 'calling'    I started a call, waiting for the other person to answer
    // 'ringing'    someone is calling me
    // 'connecting' the call was accepted, connecting the two browsers
    // 'active'     the call is running
    let callState = 'idle';
    let callMedia = 'audio';            // 'audio' or 'video'
    let peer = null;                    // the RTCPeerConnection
    let localStream = null;             // my microphone (and camera)
    let queuedCandidates = [];          // connection hints that arrived too early
    let ringTimer = null;
    let tickTimer = null;
    let lostTimer = null;
    let startedAt = 0;


    // ---------- Small helpers ----------
    function say(action, extra) {
        const note = { type: 'call', action: action };
        if (extra) {
            Object.assign(note, extra);
        }
        sendSignal(note);
    }

    function copyPeerPicture(target) {
        target.innerHTML = peerAvatar.innerHTML;
    }

    function friendlyError(err) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return 'Calls need a secure page: use https:// or http://localhost.';
        }
        if (err && err.name === 'NotAllowedError') {
            return 'Permission denied. Allow the microphone/camera in your browser and try again.';
        }
        if (err && err.name === 'NotFoundError') {
            return 'No microphone was found.';
        }
        if (err && err.name === 'NotReadableError') {
            return 'The microphone or camera is being used by another app.';
        }
        return 'Could not start the microphone or camera.';
    }

    // Ask the browser for the microphone (and camera for video calls)
    async function getLocalMedia(media) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('unsupported');
        }
        if (media === 'video') {
            try {
                return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            } catch (err) {
                // No camera? Carry on with voice only.
                if (err.name === 'NotFoundError' || err.name === 'NotReadableError') {
                    const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
                    showToast('Camera not available. Continuing with voice only.');
                    return audioOnly;
                }
                throw err;
            }
        }
        return navigator.mediaDevices.getUserMedia({ audio: true });
    }

    function stopLocalMedia() {
        if (localStream) {
            localStream.getTracks().forEach(function (track) {
                track.stop();
            });
            localStream = null;
        }
    }


    // ---------- Call screen ----------
    function updateLayout() {
        const hasLocalVideo = localStream !== null && localStream.getVideoTracks().length > 0;

        let hasRemoteVideo = false;
        if (remoteVideo.srcObject) {
            hasRemoteVideo = remoteVideo.srcObject.getVideoTracks().length > 0;
        }

        overlay.classList.toggle('show-remote', hasRemoteVideo);
        overlay.classList.toggle('show-local', hasLocalVideo);
        cameraBtn.hidden = !hasLocalVideo;
    }

    function openCallScreen(statusText) {
        copyPeerPicture(callAvatar);
        localVideo.srcObject = localStream;
        callStatus.textContent = statusText;
        callTimer.textContent = '';
        toastEl.hidden = true;          // hide an old pop-up (like "Call ended.") from a previous call
        overlay.hidden = false;
        document.body.classList.add('in-call');
        updateLayout();
    }

    function tick() {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
        const ss = String(seconds % 60).padStart(2, '0');
        callTimer.textContent = mm + ':' + ss;
    }

    function callIsNowActive() {
        if (callState === 'active') {
            return;
        }
        callState = 'active';
        callStatus.textContent = (callMedia === 'video') ? 'Video call' : 'Voice call';
        startedAt = Date.now();
        tick();
        tickTimer = setInterval(tick, 1000);
    }


    // ---------- Finish a call (clean everything up) ----------
    function resetCall() {
        clearTimeout(ringTimer);
        clearTimeout(lostTimer);
        clearInterval(tickTimer);

        if (peer) {
            peer.onicecandidate = null;
            peer.ontrack = null;
            peer.onconnectionstatechange = null;
            peer.close();
            peer = null;
        }
        stopLocalMedia();

        remoteVideo.srcObject = null;
        localVideo.srcObject = null;
        overlay.hidden = true;
        overlay.classList.remove('show-remote', 'show-local');
        incoming.hidden = true;
        document.body.classList.remove('in-call');

        muteBtn.classList.remove('off');
        cameraBtn.classList.remove('off');
        callTimer.textContent = '';

        queuedCandidates = [];
        callState = 'idle';
    }

    function endCall(tellOtherPerson) {
        if (callState === 'idle') {
            return;
        }
        if (tellOtherPerson) {
            say('end');
        }
        resetCall();
    }


    // ---------- The connection between the two browsers ----------
    function createPeer() {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peer = pc;

        localStream.getTracks().forEach(function (track) {
            pc.addTrack(track, localStream);
        });

        // Our browser found a way to be reached: pass it to the other person
        pc.onicecandidate = function (event) {
            if (event.candidate && pc === peer) {
                say('candidate', { candidate: event.candidate.toJSON() });
            }
        };

        // The other person's audio/video arrived
        pc.ontrack = function (event) {
            if (pc !== peer) {
                return;
            }
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
            remoteVideo.play().catch(function () { });
            event.track.onunmute = updateLayout;
            updateLayout();
        };

        pc.onconnectionstatechange = function () {
            if (pc !== peer) {
                return;
            }
            const state = pc.connectionState;

            if (state === 'connected') {
                clearTimeout(lostTimer);
                callIsNowActive();
            } else if (state === 'disconnected') {
                // Often comes back by itself: wait a few seconds before giving up
                callStatus.textContent = 'Reconnecting…';
                clearTimeout(lostTimer);
                lostTimer = setTimeout(function () {
                    if (pc === peer && pc.connectionState !== 'connected') {
                        showToast('The call connection was lost.');
                        endCall(true);
                    }
                }, 8000);
            } else if (state === 'failed') {
                showToast('Could not connect the call. Try again.');
                endCall(true);
            }
        };
    }

    // Add hints that arrived before we were ready for them
    async function flushQueuedCandidates() {
        const waiting = queuedCandidates;
        queuedCandidates = [];
        for (const candidate of waiting) {
            try {
                await peer.addIceCandidate(candidate);
            } catch (err) {
                console.warn('Could not add connection hint', err);
            }
        }
    }


    // ---------- I start a call ----------
    async function startCall(media) {
        if (callState !== 'idle') {
            return;
        }
        if (!isSocketOpen()) {
            showToast('You are not connected yet.');
            return;
        }

        callState = 'calling';          // set first, so a double-click does nothing
        callMedia = media;

        try {
            localStream = await getLocalMedia(media);
        } catch (err) {
            showToast(friendlyError(err));
            resetCall();
            return;
        }
        if (callState !== 'calling') {  // cancelled while the permission box was open
            stopLocalMedia();
            return;
        }

        openCallScreen('Calling…');
        say('invite', { media: media });

        ringTimer = setTimeout(function () {
            if (callState === 'calling') {
                showToast('No answer.');
                endCall(true);
            }
        }, RING_TIME);
    }

    // The other person said yes: build the connection and send the offer
    async function onAccepted() {
        if (callState !== 'calling') {
            return;
        }
        clearTimeout(ringTimer);
        callState = 'connecting';
        callStatus.textContent = 'Connecting…';

        try {
            createPeer();
            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);
            say('offer', { sdp: { type: 'offer', sdp: peer.localDescription.sdp } });
        } catch (err) {
            console.error(err);
            showToast('Could not start the call.');
            endCall(true);
        }
    }


    // ---------- Someone calls me ----------
    function onInvite(data) {
        if (callState !== 'idle') {
            say('busy');
            return;
        }

        callState = 'ringing';
        callMedia = (data.media === 'video') ? 'video' : 'audio';

        copyPeerPicture(incomingAvatar);
        incomingTitle.textContent = (callMedia === 'video') ? 'Incoming video call' : 'Incoming voice call';
        incoming.hidden = false;

        ringTimer = setTimeout(function () {
            if (callState === 'ringing') {
                resetCall();
                showToast('Missed call.');
            }
        }, RING_TIME + 5000);
    }

    async function acceptCall() {
        if (callState !== 'ringing') {
            return;
        }
        clearTimeout(ringTimer);
        incoming.hidden = true;
        callState = 'connecting';

        try {
            localStream = await getLocalMedia(callMedia);
        } catch (err) {
            showToast(friendlyError(err));
            say('reject');
            resetCall();
            return;
        }
        if (callState !== 'connecting') {   // the caller hung up while the permission box was open
            stopLocalMedia();
            return;
        }

        openCallScreen('Connecting…');
        createPeer();
        say('accept');
    }

    function declineCall() {
        if (callState !== 'ringing') {
            return;
        }
        say('reject');
        resetCall();
    }

    // The caller's offer arrived: answer it
    async function onOffer(data) {
        if (!peer || callState !== 'connecting') {
            return;
        }
        try {
            await peer.setRemoteDescription({ type: 'offer', sdp: data.sdp.sdp });
            await flushQueuedCandidates();
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            say('answer', { sdp: { type: 'answer', sdp: peer.localDescription.sdp } });
        } catch (err) {
            console.error(err);
            showToast('Could not connect the call.');
            endCall(true);
        }
    }

    async function onAnswer(data) {
        if (!peer || callState !== 'connecting') {
            return;
        }
        try {
            await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp.sdp });
            await flushQueuedCandidates();
        } catch (err) {
            console.error(err);
            showToast('Could not connect the call.');
            endCall(true);
        }
    }

    async function onCandidate(data) {
        if (!peer) {
            return;
        }
        if (!peer.remoteDescription) {
            queuedCandidates.push(data.candidate);     // too early: keep it for later
            return;
        }
        try {
            await peer.addIceCandidate(data.candidate);
        } catch (err) {
            console.warn('Could not add connection hint', err);
        }
    }


    // ---------- Notes from the other person (called by chat.js) ----------
    window.handleCallSignal = function (data) {
        switch (data.action) {
            case 'invite':
                onInvite(data);
                break;
            case 'accept':
                onAccepted();
                break;
            case 'offer':
                onOffer(data);
                break;
            case 'answer':
                onAnswer(data);
                break;
            case 'candidate':
                onCandidate(data);
                break;
            case 'reject':
                if (callState === 'calling' || callState === 'connecting') {
                    showToast('Call declined.');
                    resetCall();
                }
                break;
            case 'busy':
                if (callState === 'calling') {
                    showToast('They are on another call. Try again in a moment.');
                    resetCall();
                }
                break;
            case 'end':
                if (callState === 'ringing') {
                    showToast('Missed call.');
                    resetCall();
                } else if (callState !== 'idle') {
                    showToast('Call ended.');
                    resetCall();
                }
                break;
        }
    };

    // Call buttons only work while the chat is connected
    window.onConnectionChange = function (state) {
        const ready = (state === 'connected');
        voiceBtn.disabled = !ready;
        videoBtn.disabled = !ready;
    };

    // If the chat connection drops, the call cannot continue
    window.onSocketClosed = function () {
        if (callState !== 'idle') {
            showToast('The call ended because the connection was lost.');
            resetCall();
        }
    };

    // Closing the page ends the call for the other person too
    window.addEventListener('beforeunload', function () {
        if (callState !== 'idle') {
            say('end');
        }
    });


    // ---------- Buttons ----------
    voiceBtn.addEventListener('click', function () {
        startCall('audio');
    });

    videoBtn.addEventListener('click', function () {
        startCall('video');
    });

    acceptBtn.addEventListener('click', acceptCall);
    declineBtn.addEventListener('click', declineCall);

    hangupBtn.addEventListener('click', function () {
        endCall(true);
    });

    muteBtn.addEventListener('click', function () {
        if (!localStream) {
            return;
        }
        const nowMuted = !muteBtn.classList.contains('off');
        localStream.getAudioTracks().forEach(function (track) {
            track.enabled = !nowMuted;
        });
        muteBtn.classList.toggle('off', nowMuted);
    });

    cameraBtn.addEventListener('click', function () {
        if (!localStream) {
            return;
        }
        const nowOff = !cameraBtn.classList.contains('off');
        localStream.getVideoTracks().forEach(function (track) {
            track.enabled = !nowOff;
        });
        cameraBtn.classList.toggle('off', nowOff);
    });

})();
