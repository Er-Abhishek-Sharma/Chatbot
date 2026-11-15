// ---------- Copy Room ID button ----------
const copyBtn = document.getElementById('copy-btn');
const roomIdText = document.getElementById('room-id-text');

copyBtn.addEventListener('click', function () {
    const text = roomIdText.textContent.trim();

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(showCopied);
    } else {
        // Backup method for older browsers
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showCopied();
    }
});

function showCopied() {
    copyBtn.textContent = 'Copied!';
    setTimeout(function () {
        copyBtn.textContent = 'Copy ID';
    }, 2000);
}


// ---------- Page elements ----------
const roomId = document.body.dataset.roomId;
const myRole = document.body.dataset.role;
const peerRole = document.body.dataset.peerRole;
const avatarBase = document.body.dataset.avatarUrl;   // like /room/ABCD2345/avatar/

const statusEl = document.getElementById('status');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const toastEl = document.getElementById('toast');


// ---------- Small pop-up message ----------
let toastTimer = null;

function showToast(message, duration) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toastEl.hidden = true;
    }, duration || 4000);
}


// ---------- Time formatting ----------
// Turns '2026-11-12T17:15:00+00:00' into something like '10:45 PM'
// in the viewer's own timezone.
function formatTime(isoString) {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
        return '';
    }
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Fill in the times of the messages that were saved earlier
function showSavedTimes() {
    const timeEls = messagesEl.querySelectorAll('.time[data-time]');
    timeEls.forEach(function (el) {
        el.textContent = formatTime(el.dataset.time);
    });
}


// ---------- Show messages ----------
function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMessage(text, kind, isoTime) {
    // Remove the "no messages yet" notice when the first message arrives
    const notice = document.getElementById('empty-notice');
    if (notice) {
        notice.remove();
    }

    const row = document.createElement('div');
    row.className = 'message ' + kind + ' new';   // 'new' gives it a small pop-in animation

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const textEl = document.createElement('div');
    textEl.className = 'text';
    textEl.textContent = text;              // textContent keeps it safe

    const timeEl = document.createElement('div');
    timeEl.className = 'time';
    timeEl.textContent = formatTime(isoTime);

    bubble.appendChild(textEl);
    bubble.appendChild(timeEl);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
}

// When the page first loads
showSavedTimes();
scrollToBottom();


// ---------- Profile pictures ----------
const myAvatarEl = document.getElementById('my-avatar');
const peerAvatarEl = document.getElementById('peer-avatar');
const myAvatarBtn = document.getElementById('my-avatar-btn');
const avatarInput = document.getElementById('avatar-input');
const personIconTemplate = document.getElementById('person-icon-template');
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

const AVATAR_SIZE = 256;   // pictures are shrunk to 256 x 256 pixels before upload

// Put the default "person" icon into a picture holder
function showDefaultIcon(container) {
    container.replaceChildren(personIconTemplate.content.cloneNode(true));
}

// Show a saved picture (version number changes whenever the picture changes)
function setAvatar(container, role, version) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = avatarBase + role + '/?v=' + version;
    img.onerror = function () {
        showDefaultIcon(container);
    };
    container.replaceChildren(img);
}

// Cut the middle square out of the photo, shrink it, and turn it into a small JPEG
function photoToSquareJpeg(file, size) {
    return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = function () {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const sx = (img.naturalWidth - side) / 2;
            const sy = (img.naturalHeight - side) / 2;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';              // JPEG has no see-through parts
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

            URL.revokeObjectURL(url);
            canvas.toBlob(function (blob) {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Could not prepare the picture.'));
                }
            }, 'image/jpeg', 0.85);
        };

        img.onerror = function () {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read that picture.'));
        };

        img.src = url;
    });
}

myAvatarBtn.addEventListener('click', function () {
    avatarInput.click();
});

avatarInput.addEventListener('change', async function () {
    const file = avatarInput.files[0];
    avatarInput.value = '';          // so choosing the same file again still works
    if (!file) {
        return;
    }

    try {
        const blob = await photoToSquareJpeg(file, AVATAR_SIZE);

        const form = new FormData();
        form.append('avatar', blob, 'avatar.jpg');

        const response = await fetch(avatarBase, {
            method: 'POST',
            body: form,
            headers: { 'X-CSRFToken': csrfToken },
            credentials: 'same-origin',
        });
        const result = await response.json();

        if (!response.ok) {
            showToast(result.error || 'Could not save your picture.');
            return;
        }
        setAvatar(myAvatarEl, myRole, result.version);
        showToast('Profile picture updated.', 2500);
    } catch (err) {
        showToast(err.message || 'Could not save your picture.');
    }
});

// The server tells us when someone's picture changed
function handleAvatarEvent(data) {
    if (data.role === myRole) {
        setAvatar(myAvatarEl, myRole, data.version);
    } else if (data.role === peerRole) {
        setAvatar(peerAvatarEl, peerRole, data.version);
    }
}


// ---------- Connection status ----------
function setStatus(state) {
    // state is 'connected', 'connecting' or 'disconnected'
    if (state === 'connected') {
        statusEl.textContent = 'Connected';
        statusEl.className = 'status connected';
        statusEl.title = '';
    } else if (state === 'connecting') {
        statusEl.textContent = 'Connecting...';
        statusEl.className = 'status connecting';
        statusEl.title = '';
    } else {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status disconnected';
        statusEl.title = 'Click to reconnect';
    }

    // You can only type and send while connected
    const isConnected = (state === 'connected');
    messageInput.disabled = !isConnected;
    sendBtn.disabled = !isConnected;

    // Let the call code know (it is loaded after this file)
    if (window.onConnectionChange) {
        window.onConnectionChange(state);
    }
}

// Clicking the red "Disconnected" badge reloads the page to try again
statusEl.addEventListener('click', function () {
    if (statusEl.classList.contains('disconnected')) {
        window.location.reload();
    }
});


// ---------- WebSocket connection (with automatic reconnect) ----------
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const socketUrl = protocol + '://' + window.location.host + '/ws/chat/' + roomId + '/';

let chatSocket = null;
let retryCount = 0;
let wasConnectedBefore = false;
const MAX_RETRIES = 6;

function isSocketOpen() {
    return chatSocket !== null && chatSocket.readyState === WebSocket.OPEN;
}

// Send any object to the server as JSON. Returns true if it was sent.
function sendSignal(data) {
    if (!isSocketOpen()) {
        return false;
    }
    chatSocket.send(JSON.stringify(data));
    return true;
}

function connect() {
    setStatus('connecting');
    chatSocket = new WebSocket(socketUrl);

    chatSocket.onopen = function () {
        if (wasConnectedBefore) {
            // We were cut off earlier and may have missed messages.
            // Reloading the page loads the complete saved history again.
            window.location.reload();
            return;
        }
        wasConnectedBefore = true;
        retryCount = 0;
        setStatus('connected');
        messageInput.focus();
    };

    chatSocket.onclose = function () {
        // A call cannot continue without the chat connection
        if (window.onSocketClosed) {
            window.onSocketClosed();
        }

        if (retryCount >= MAX_RETRIES) {
            setStatus('disconnected');
            return;
        }
        retryCount = retryCount + 1;
        setStatus('connecting');
        const waitTime = Math.min(1000 * retryCount, 5000);   // 1s, 2s, 3s, 4s, 5s, 5s
        setTimeout(connect, waitTime);
    };

    // Something arrived from the server
    chatSocket.onmessage = function (event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (err) {
            return;
        }

        if (data.type === 'message') {
            const kind = (data.sender === myRole) ? 'sent' : 'received';
            addMessage(data.message, kind, data.time);
        } else if (data.type === 'avatar') {
            handleAvatarEvent(data);
        } else if (data.type === 'call') {
            if (window.handleCallSignal) {
                window.handleCallSignal(data);
            }
        }
    };
}

connect();


// ---------- Send a message ----------
messageForm.addEventListener('submit', function (event) {
    event.preventDefault();                 // stop the page from reloading

    const text = messageInput.value.trim();
    if (text === '') {
        return;
    }

    if (sendSignal({ type: 'message', message: text })) {
        messageInput.value = '';
        messageInput.focus();
    }
});
