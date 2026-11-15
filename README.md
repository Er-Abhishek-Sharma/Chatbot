<<<<<<< HEAD
# ChatRoom — One-to-One Real-Time Chat (WhatsApp-style)

A simple private chat website for exactly **two people**.

- No login, no sign-up
- Create a room, share the Room ID, the other person joins
- Messages appear instantly (WebSockets), with WhatsApp-style bubbles and timestamps
- **Profile pictures** — click your small picture to change it; the other person sees it live
- **Voice calls and video calls** — buttons in the header, with ringing, accept/decline, mute, camera on/off and a call timer
- Messages are saved in a SQLite database
- Works on desktop and mobile

**Tech used:** HTML, CSS, JavaScript · Python Django · Django Channels (WebSockets) · SQLite

---

## 1. Folder structure

```
chat_project/
├── manage.py                    Django's command tool
├── requirements.txt             List of packages to install
├── README.md                    This guide
├── db.sqlite3                   Database (created when you run "migrate")
├── config/                      Project settings
│   ├── settings.py              Main settings (Channels is configured here)
│   ├── urls.py                  Web addresses of the whole project
│   └── asgi.py                  Entry point: sends web pages and WebSockets to the right place
└── chat/                        The chat app
    ├── models.py                Database tables: Room, Message, Avatar
    ├── views.py                 Pages: home, create room, join room, chat room,
    │                            plus profile picture upload and download
    ├── urls.py                  Web addresses for the pages
    ├── consumers.py             WebSocket code: live messages, live picture updates,
    │                            and call "setup notes" passed between the two people
    ├── routing.py               WebSocket addresses
    ├── migrations/              Database setup instructions
    ├── templates/chat/
    │   ├── home.html            Homepage (Create Room / Join Room)
    │   ├── room.html            Chat screen, call screen, incoming call screen
    │   └── _person_icon.html    The grey "person" icon used when there is no picture
    └── static/chat/
        ├── css/style.css        All the styling
        └── js/
            ├── chat.js          WebSocket, bubbles, timestamps, reconnect, profile pictures
            └── call.js          Voice and video calls (WebRTC)
```

---

## 2. Setup guide (step by step)

You need: a computer with internet, and a terminal (Command Prompt / PowerShell on Windows, Terminal on Mac/Linux).

### Step 1 — Install Python

1. Download Python 3 from **https://www.python.org/downloads/** (3.10 or newer; 3.12+ is best).
2. **Windows:** in the installer, tick **"Add python.exe to PATH"** before clicking Install.
3. Check it worked. Open a terminal and run:

```bash
python --version
```

You should see something like `Python 3.12.x`.
(On Mac/Linux, if that fails, use `python3 --version`, and use `python3` instead of `python` in every command below.)

### Step 2 — Unzip the project and open a terminal inside it

1. Unzip `chat_project.zip`.
2. Open a terminal **inside the `chat_project` folder** (the folder that contains `manage.py`).
   - Windows: open the folder, click the address bar, type `cmd`, press Enter.
   - Or use `cd`:
     ```bash
     cd path/to/chat_project
     ```
   - In VS Code: *File → Open Folder*, then *Terminal → New Terminal*.

Check you are in the right place:

```bash
dir        (Windows)
ls         (Mac/Linux)
```

You must see `manage.py` in the list.

### Step 3 — Create a virtual environment

A virtual environment is a private box for this project's packages.

```bash
python -m venv venv
```

Now **activate** it:

| System | Command |
|---|---|
| Windows (Command Prompt) | `venv\Scripts\activate` |
| Windows (PowerShell) | `venv\Scripts\Activate.ps1` |
| Mac / Linux | `source venv/bin/activate` |

You should now see `(venv)` at the start of your terminal line.

> PowerShell says "running scripts is disabled"? Run this once, then try again:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**Every time you open a new terminal for this project, activate the virtual environment again.**

### Step 4 — Install the packages

```bash
pip install -r requirements.txt
```

This installs Django, Channels, and Daphne. Check:

```bash
python -m django --version
```

### Step 5 — Create the database

```bash
python manage.py migrate
```

You will see a list of lines ending in `OK`. This creates the file `db.sqlite3`.

### Step 6 — Start the server

```bash
python manage.py runserver
```

Look for this line in the output:

```
Starting ASGI/Daphne version ... development server at http://127.0.0.1:8000/
```

The words **ASGI/Daphne** confirm WebSockets are working.

### Step 7 — Open the website

Open your browser and go to: **http://127.0.0.1:8000/**

You should see the green ChatRoom homepage.

To stop the server, press `Ctrl + C` in the terminal.

---

## 3. How to use it

1. **Person A** opens the website and clicks **Create Room**.
2. A Room ID (like `K7M2P9QX`) is shown. Click **Copy ID** and send it to Person B.
3. **Person B** opens the website, types the Room ID in **Join a Room**, and clicks **Join Room**.
4. Both are now in the same chat. Type a message and press **Enter** or the green send button.

The badge at the top right shows **Connected** (green), **Connecting...** (amber), or **Disconnected** (red).

---

### Profile picture

1. In the white bar under the header, click your small round picture (it has a little camera badge).
2. Choose any photo. The browser cuts out the middle square, shrinks it to 256 x 256 pixels, and uploads it.
3. The other person sees it appear in the chat header straight away, with no refresh.

Only the two people in the room can see the pictures, and each person can only change their own.

### Voice and video calls

1. Click the **phone** icon (voice call) or the **camera** icon (video call) in the header. The buttons turn on once the badge says **Connected**.
2. Your browser asks for permission to use the **microphone** (and **camera**). Click **Allow**.
3. The other person's screen shows **Incoming call** with green (accept) and red (decline) buttons.
4. After they accept, you are connected. During a call you can **mute**, **turn the camera off**, or **hang up**. A timer shows how long you have talked.
5. If the other person has no camera, a video call continues as a voice call.

> **Important:** browsers only allow the camera and microphone on a **secure page**. That means
> `http://127.0.0.1:8000` and `http://localhost:8000` work, but `http://192.168.x.x:8000` (your phone on Wi-Fi)
> will **not** allow calls. See Section 5 for how to test calls on a phone.

---

## 4. Test it with two browser windows

Two people must have **different sessions**. Tabs in the same browser share one session, so use:

- a normal window + an **incognito/private window**, or
- two different browsers (e.g. Chrome and Firefox/Edge).

Checklist:

| # | What to do | Expected result |
|---|---|---|
| 1 | Window A: click Create Room | Room page with an 8-character Room ID and a green "Connected" badge |
| 2 | Click Copy ID | Button says "Copied!" for 2 seconds |
| 3 | Window B: join with a wrong ID like `WRONG123` | Red error: "Room not found" |
| 4 | Window B: join with the real ID | B enters the room ("You are the guest") |
| 5 | A sends a message | Green bubble on the right for A, white bubble on the left for B, instantly |
| 6 | B replies | It appears on both screens, with a time in each bubble |
| 7 | Refresh a window | Old messages are still there |
| 8 | Third browser: join with the same ID | Red error: "This room is already full" |
| 9 | Third browser: open the room address directly | Sent back to the homepage |
| 10 | Stop the server with Ctrl + C, wait a few seconds, then start it again | Badge goes amber "Connecting...", then the page reloads itself and shows "Connected" |
| 11 | Window A: click your small picture and choose a photo | Your picture updates, and Window B shows it in the header instantly |
| 12 | Window A: click the phone icon | Window B shows "Incoming voice call". Allow the microphone in both windows |
| 13 | Window B: click the green button | Both show "Voice call" with a running timer |
| 14 | Click the mute button | The icon changes to a crossed-out microphone |
| 15 | Click the red button | The call ends on both sides |
| 16 | Window B: click the camera icon, and A accepts | You see each other's video, with a small preview of yourself |
| 17 | Window A: call, and B clicks red (decline) | A sees "Call declined." |

**Testing calls on one computer:** both windows will try to use the same microphone and camera. Most computers allow this. If the browser says the camera is "being used by another app", test a voice call instead, or use a second device.

---

## 5. Test on your phone (same Wi-Fi)

1. Connect your phone and computer to the **same Wi-Fi**.
2. Find your computer's IP address:
   - Windows: run `ipconfig` and look for **IPv4 Address** (e.g. `192.168.1.5`)
   - Mac: run `ipconfig getifaddr en0`
   - Linux: run `hostname -I`
3. Open `config/settings.py` and add that IP to `ALLOWED_HOSTS`:

```python
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "192.168.1.5"]
```

4. Start the server so it accepts connections from other devices:

```bash
python manage.py runserver 0.0.0.0:8000
```

5. On your phone's browser, open `http://192.168.1.5:8000/` (use your own IP).
6. If it does not load, allow Python through your computer's firewall when asked.

> Note: the **Copy ID** button needs a secure page (https) on phones, so it may not copy there. The backup copy method works in many browsers, otherwise just type the ID.

### Calls on a phone need a secure address

Chat, pictures and messages work over `http://192.168.x.x:8000`, but **calls will show "Calls need a secure page"**, because browsers block the microphone and camera on plain `http` addresses (except `localhost`). Two ways around that:

**Option A — Chrome on Android (quickest for testing):**
1. On the phone, open `chrome://flags` and search for **"Insecure origins treated as secure"**.
2. Enable it and type your address, e.g. `http://192.168.1.5:8000`.
3. Tap **Relaunch**. Calls now work on that address.

**Option B — an https tunnel** (works on any phone, and lets friends outside your Wi-Fi join), using a free tool such as ngrok or Cloudflare Tunnel. You get an address like `https://abc123.ngrok-free.app`. Add it to `config/settings.py`:

```python
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "abc123.ngrok-free.app"]
CSRF_TRUSTED_ORIGINS = ["https://abc123.ngrok-free.app"]
```

(Option B is a suggestion; I could not test tunnels in my environment.)

### Calls across different networks (internet)

Calls connect the two browsers **directly**. On the same Wi-Fi this always works. Across the internet, the project uses a free Google STUN server, which works for most home networks. Some strict networks (company or school Wi-Fi, some mobile data) block direct connections. Those need a **TURN relay server**, which is not included. If calls say "Could not connect the call" only on certain networks, that is the reason.

---

## 6. How it works (short version)

- **Room ID:** 8 random characters made with Python's `secrets` module (about 1.1 trillion possibilities), so it cannot be guessed. Confusing characters (0, O, 1, I) are left out.
- **No login, but still private:** each browser gets a random **session cookie**. The room stores the creator's cookie and the guest's cookie.
- **Only two people:** when someone joins, the server fills the empty guest seat with a single database update that can only succeed once. After that, the room is full, and nobody else can match the creator or guest cookie.
- **Checked twice:** the room page checks your cookie, and the WebSocket connection checks it again. A person who only knows the Room ID but is not a member is disconnected.
- **Real time:** the browser opens a WebSocket. A message goes to the server, is saved, and is sent to a **group** containing both people.
- **Safe display:** message text is always shown as plain text (never as HTML), so nobody can inject code into the other person's page.
- **Server-side checks:** empty messages, invalid data, and messages over 1000 characters are ignored.
- **Cross-site protection:** WebSocket connections from other websites are refused.
- **Profile pictures:** the browser shrinks the photo to a 256 x 256 JPEG (about 20–40 KB) before uploading. The server accepts only real JPEG data under 300 KB, stores it in SQLite, and serves it only to the two people in that room. A person can only change their own picture. When it changes, a live event tells the other person's page to refresh it.
- **Calls (WebRTC):** the audio and video go **directly between the two browsers**, not through the server, and are encrypted by the browser. The server only passes small "setup notes" (invite, accept, offer, answer, connection hints) over the same WebSocket. Each note is checked and rebuilt on the server, size-limited, and delivered **only to the other person in the room**.
- **Microphone and camera are only used during a call**, and are released the moment the call ends.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `python` is not recognized | Reinstall Python and tick "Add to PATH", or try `py` or `python3` |
| `No module named django` | The virtual environment is not active. Run the activate command again (Step 3) |
| `(venv)` missing after opening a new terminal | Activate again; it is needed every time |
| `no such table: chat_room` | Run `python manage.py migrate` |
| Terminal says `Starting development server` without "ASGI/Daphne" | `'daphne'` must be the first item in `INSTALLED_APPS` in `config/settings.py` |
| Badge stays red "Disconnected" | Use the same address throughout (`127.0.0.1` and `localhost` use different cookies). Make sure you created or joined the room in that same browser |
| Joining from a second tab does not work as a second person | Tabs share a session. Use an incognito window or another browser |
| Page has no styling | Hard refresh with `Ctrl + Shift + R` |
| "DisallowedHost" error or phone cannot connect | Add your computer's IP to `ALLOWED_HOSTS` (Section 5) |
| Port 8000 already in use | Run on another port: `python manage.py runserver 8001` |
| Want to start fresh | Stop the server, delete `db.sqlite3`, then run `python manage.py migrate` again |
| `no such table: chat_avatar` | You updated the code but not the database. Run `python manage.py migrate` |
| Call buttons are grey | The badge must say **Connected** first |
| "Calls need a secure page" | Open the site as `http://127.0.0.1:8000` or `http://localhost:8000`, or see the phone section above |
| "Permission denied" when calling | Click the lock/camera icon in the address bar, set Microphone (and Camera) to **Allow**, then call again |
| "Camera or microphone is being used by another app" | Close Zoom, Teams or other apps using it. With two windows on one computer, try a voice call |
| Call rings but stays on "Connecting…" or says "Could not connect the call" | A strict network is blocking direct connections (see "Calls across different networks") |
| Other person hears nothing | They may have muted themselves, or the browser blocked autoplay: ask them to click once on the page |
| Profile picture will not change | Choose a normal photo (JPG, PNG, WebP). Very unusual formats may not open in your browser |

---

## 8. Good to know (limitations)

- This is a **learning / local project**. The setting `InMemoryChannelLayer` keeps live messages in the computer's memory, so it works with **one server process**. For a real deployment you would switch to Redis (`channels_redis`), use a proper web server, set `DEBUG = False`, set a secret `SECRET_KEY`, and use HTTPS.
- Your session cookie is your "identity". If you clear cookies or switch browsers, you lose access to that room (this is by design, since there are no accounts).
- Rooms, messages and pictures are never deleted automatically.
- Calls are **one-to-one only**, with no call history, and a call ends if either person closes the page or loses the chat connection.
- Each person's picture belongs to that room only (there are no accounts to carry a picture between rooms).

---

## 9. Quick command cheat sheet

```bash
# one-time setup
python -m venv venv
venv\Scripts\activate            # Windows (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python manage.py migrate

# every time you want to run it
venv\Scripts\activate            # Windows (Mac/Linux: source venv/bin/activate)
python manage.py runserver

# open in browser
http://127.0.0.1:8000/
```

If you change `chat/models.py` later, also run:

```bash
python manage.py makemigrations chat
python manage.py migrate
```
=======
# Chatbot
>>>>>>> 2114e155df795118f59fb821a2406ba4346d4379
