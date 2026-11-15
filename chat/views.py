from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST

from .models import Room, Avatar

MAX_AVATAR_BYTES = 300 * 1024          # the browser sends ~30 KB; 300 KB is a generous limit
JPEG_START = b'\xff\xd8\xff'           # every JPEG file begins with these 3 bytes


def get_session_key(request):
    """Return this visitor's session key, creating a session if needed."""
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def role_in_room(room, session_key):
    """Return 'creator', 'guest', or None if this visitor is not in the room."""
    if session_key == room.creator_session:
        return 'creator'
    if session_key == room.guest_session:
        return 'guest'
    return None


def home(request):
    return render(request, 'chat/home.html')


def create_room(request):
    # Only allow the Create Room button (POST), not typing the address
    if request.method != 'POST':
        return redirect('home')

    session_key = get_session_key(request)
    room = Room.objects.create(creator_session=session_key)
    return redirect('room', room_id=room.room_id)


def join_room(request):
    # Only allow the Join Room form (POST)
    if request.method != 'POST':
        return redirect('home')

    # Clean up what the user typed: remove spaces, make UPPERCASE
    room_id = request.POST.get('room_id', '').strip().upper()
    session_key = get_session_key(request)

    # Check 1: does the room exist?
    try:
        room = Room.objects.get(room_id=room_id)
    except Room.DoesNotExist:
        return render(request, 'chat/home.html', {
            'error': 'Room not found. Please check the Room ID and try again.'
        })

    # Check 2: is this person already in the room?
    if session_key == room.creator_session or session_key == room.guest_session:
        return redirect('room', room_id=room.room_id)

    # Check 3: try to take the empty guest seat.
    # This only updates the row if guest_session is still empty,
    # so if two people click at the same moment, only one wins.
    seat_taken = Room.objects.filter(pk=room.pk, guest_session='').update(
        guest_session=session_key
    )

    if seat_taken:
        return redirect('room', room_id=room.room_id)

    # Check 4: the seat was already filled, so the room is full
    return render(request, 'chat/home.html', {
        'error': 'This room is already full. Only two people can chat in a room.'
    })


def room(request, room_id):
    room = get_object_or_404(Room, room_id=room_id)
    session_key = get_session_key(request)

    role = role_in_room(room, session_key)
    if role is None:
        # Not a member of this room: send them back to the homepage
        return redirect('home')

    peer_role = 'guest' if role == 'creator' else 'creator'

    # Which avatar versions exist? (defer('image') = don't load the picture bytes)
    versions = {a.role: a.version for a in room.avatars.defer('image')}

    return render(request, 'chat/room.html', {
        'room': room,
        'role': role,
        'peer_role': peer_role,
        'my_avatar_version': versions.get(role, 0),
        'peer_avatar_version': versions.get(peer_role, 0),
        'chat_messages': room.messages.all(),
    })


@require_POST
def upload_avatar(request, room_id):
    """Save the profile picture of the person making this request."""
    room = get_object_or_404(Room, room_id=room_id)
    role = role_in_room(room, get_session_key(request))
    if role is None:
        return JsonResponse({'error': 'You are not in this room.'}, status=403)

    upload = request.FILES.get('avatar')
    if upload is None:
        return JsonResponse({'error': 'No picture was sent.'}, status=400)
    if upload.size > MAX_AVATAR_BYTES:
        return JsonResponse({'error': 'That picture is too large.'}, status=400)

    data = upload.read()
    if not data.startswith(JPEG_START):
        return JsonResponse({'error': 'Please choose a normal photo (JPEG).'}, status=400)

    avatar, created = Avatar.objects.get_or_create(
        room=room, role=role, defaults={'image': data}
    )
    if not created:
        avatar.image = data
        avatar.version += 1
        avatar.save()

    # Tell everyone connected to this room (live) that this picture changed
    async_to_sync(get_channel_layer().group_send)(
        f'chat_{room.room_id}',
        {'type': 'avatar_update', 'role': role, 'version': avatar.version},
    )

    return JsonResponse({'version': avatar.version})


def avatar_image(request, room_id, role):
    """Send a profile picture, but only to the two people in the room."""
    room = get_object_or_404(Room, room_id=room_id)
    if role_in_room(room, get_session_key(request)) is None:
        return HttpResponse(status=403)

    avatar = Avatar.objects.filter(room=room, role=role).first()
    if avatar is None:
        return HttpResponse(status=404)

    response = HttpResponse(bytes(avatar.image), content_type='image/jpeg')
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cache-Control'] = 'private, max-age=86400'   # the ?v= number in the address refreshes it
    return response
