import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import Room, Message

MAX_MESSAGE_LENGTH = 1000

# ----- Call signaling limits -----
# The call itself (audio/video) goes directly between the two browsers.
# Our server only passes small "setup" notes between them.
CALL_ACTIONS = {'invite', 'accept', 'reject', 'busy', 'end', 'offer', 'answer', 'candidate'}
CALL_MEDIA = {'audio', 'video'}
MAX_SDP_LENGTH = 20000
MAX_CANDIDATE_LENGTH = 2000


class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.group_name = f'chat_{self.room_id}'

        session_key = self.scope['session'].session_key

        # Work out who this person is: 'creator', 'guest', or None
        self.role = await self.get_role(self.room_id, session_key)
        if self.role is None:
            await self.close()
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        # group_name only exists if connect() got far enough to set it
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # ------------------------------------------------------------------
    # Browser -> server
    # ------------------------------------------------------------------
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        if not isinstance(data, dict):
            return

        kind = data.get('type', 'message')
        if kind == 'message':
            await self.handle_chat_message(data)
        elif kind == 'call':
            await self.handle_call_signal(data)

    async def handle_chat_message(self, data):
        text = str(data.get('message', '')).strip()

        # Ignore empty or too-long messages
        if not text or len(text) > MAX_MESSAGE_LENGTH:
            return

        # Save it, and get back the time it was saved
        sent_time = await self.save_message(self.room_id, self.role, text)

        # Send the message (with its time) to everyone in this room's group
        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'chat_message',
                'message': text,
                'sender': self.role,
                'time': sent_time,
            },
        )

    async def handle_call_signal(self, data):
        """Check a call note, rebuild it from safe parts, and pass it to the other person."""
        action = data.get('action')
        if action not in CALL_ACTIONS:
            return

        payload = {'action': action}

        if action == 'invite':
            if data.get('media') not in CALL_MEDIA:
                return
            payload['media'] = data['media']

        elif action in ('offer', 'answer'):
            description = data.get('sdp')
            if not isinstance(description, dict):
                return
            if description.get('type') != action:
                return
            sdp = description.get('sdp')
            if not isinstance(sdp, str) or not sdp or len(sdp) > MAX_SDP_LENGTH:
                return
            payload['sdp'] = {'type': action, 'sdp': sdp}

        elif action == 'candidate':
            candidate = data.get('candidate')
            if not isinstance(candidate, dict):
                return
            text = candidate.get('candidate')
            if not isinstance(text, str) or len(text) > MAX_CANDIDATE_LENGTH:
                return
            clean = {'candidate': text}
            if isinstance(candidate.get('sdpMid'), str):
                clean['sdpMid'] = candidate['sdpMid'][:50]
            if isinstance(candidate.get('sdpMLineIndex'), int):
                clean['sdpMLineIndex'] = candidate['sdpMLineIndex']
            payload['candidate'] = clean

        await self.channel_layer.group_send(
            self.group_name,
            {
                'type': 'call_signal',
                'sender': self.role,
                'payload': payload,
            },
        )

    # ------------------------------------------------------------------
    # Group -> this person's browser (Channels calls these by name)
    # ------------------------------------------------------------------
    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'message',
            'message': event['message'],
            'sender': event['sender'],
            'time': event['time'],
        }))

    async def call_signal(self, event):
        # A call note is only for the OTHER person, never back to the sender
        if event['sender'] == self.role:
            return
        await self.send(text_data=json.dumps({
            'type': 'call',
            **event['payload'],
        }))

    async def avatar_update(self, event):
        await self.send(text_data=json.dumps({
            'type': 'avatar',
            'role': event['role'],
            'version': event['version'],
        }))

    # ------------------------------------------------------------------
    # Database helpers
    # ------------------------------------------------------------------
    @database_sync_to_async
    def get_role(self, room_id, session_key):
        if not session_key:
            return None
        try:
            room = Room.objects.get(room_id=room_id)
        except Room.DoesNotExist:
            return None
        if session_key == room.creator_session:
            return 'creator'
        if session_key == room.guest_session:
            return 'guest'
        return None

    @database_sync_to_async
    def save_message(self, room_id, role, text):
        room = Room.objects.get(room_id=room_id)
        message = Message.objects.create(room=room, sender_role=role, text=text)
        return message.created_at.isoformat()
