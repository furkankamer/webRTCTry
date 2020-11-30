import eventlet
eventlet.monkey_patch()
from flask import Flask,flash, request, jsonify, render_template,Response,redirect,send_from_directory, session
import os
import time
from datetime import datetime
from passlib.hash import pbkdf2_sha256
from flask_login import LoginManager, login_user, logout_user, login_required, current_user,UserMixin
from flask_cors import CORS, cross_origin
import psycopg2
import pytz
import random
from flask_socketio import SocketIO, emit, join_room, leave_room
from engineio.payload import Payload
import netifaces as ni

rooms = {}

app = Flask(__name__)
socketio = SocketIO(app)
app.secret_key = b'\xdd\xd6]j\xb0\xcc\xe3mNF{\x14\xaf\xa7\xb9\x18'

@app.route('/')
def index():
    ni.ifaddresses('eth0')
    ip = ni.ifaddresses('eth0')[ni.AF_INET][0]['addr']
    session["ip"] = ip   
    return render_template("index.html")

@socketio.on('message')
def messageTo(message):
    print(message)
    emit('message',message,room = session["room"],include_self = False)

@socketio.on('create or join')
def createOrJoin(room):
    session["id"] = request.sid
    if room not in rooms:
        session["room"] = room
        rooms[room] = 1
        join_room(room)
        emit('created',{"room" :room, "id": session["id"]})
    elif rooms[room] == 1:
        session["room"] = room
        join_room(room)
        emit('joined',{"room" :room, "id": session["id"]})
        emit('ready',room, room = room)
        emit('ready',room, broadcast = True,include_self = False)
        rooms[room] += 1
    else:
        emit('full',room)

@socketio.on('ipaddr')
def ipAddr():
    print(session['ip'])
    emit('ipaddr',session['ip'])


@socketio.on('bye')
def bye(room):
    print("bye to room")

if __name__ == "__main__":
    socketio.run(app)