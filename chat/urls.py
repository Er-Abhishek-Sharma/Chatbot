from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('create/', views.create_room, name='create_room'),
    path('join/', views.join_room, name='join_room'),
    path('room/<str:room_id>/', views.room, name='room'),
    path('room/<str:room_id>/avatar/', views.upload_avatar, name='avatar_upload'),
    path('room/<str:room_id>/avatar/<str:role>/', views.avatar_image, name='avatar_image'),
]
