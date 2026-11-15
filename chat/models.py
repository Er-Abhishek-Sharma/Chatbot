import secrets
from django.db import models

# Letters and numbers only. We removed confusing ones: 0, O, 1, I
ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


def generate_room_id():
    while True:
        code = ''.join(secrets.choice(ROOM_ID_CHARS) for _ in range(8))
        if not Room.objects.filter(room_id=code).exists():
            return code


class Room(models.Model):
    room_id = models.CharField(max_length=8, unique=True, default=generate_room_id)
    creator_session = models.CharField(max_length=40)
    guest_session = models.CharField(max_length=40, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.room_id


class Message(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='messages')
    sender_role = models.CharField(max_length=10)  # 'creator' or 'guest'
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.sender_role}: {self.text[:30]}'


class Avatar(models.Model):
    """A profile picture for one person (creator or guest) in one room.

    The picture is a small JPEG stored right in SQLite. It lives in its own
    table so loading a Room never drags the image bytes along with it.
    """
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='avatars')
    role = models.CharField(max_length=10)       # 'creator' or 'guest'
    image = models.BinaryField()
    version = models.PositiveIntegerField(default=1)   # goes up on every change (refreshes browser cache)

    class Meta:
        unique_together = ('room', 'role')

    def __str__(self):
        return f'{self.room_id} {self.role} v{self.version}'
