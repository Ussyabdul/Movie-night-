// Movie Night — backend server (v2)
// Adds: real sign up / login (hashed passwords + sessions), a YouTube search proxy
// (so your API key never reaches the browser), and watch history — on top of the
// existing real-time sync (Socket.io) and room database (SQLite) from before.

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'movie-night-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 } // 30 days
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Database (plain JSON file — no native compiling needed) ----------
const DB_FILE = path.join(__dirname, 'movienight.json');
function loadDB(){
  if(fs.existsSync(DB_FILE)){
    try{ return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }catch(e){ /* fall through to fresh db */ }
  }
  return { users: [], watchHistory: [], rooms: [], nextUserId: 1 };
}
function saveDB(){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
const db = loadDB();


// ---------- Auth routes ----------
function requireAuth(req, res, next){
  if(!req.session.userId) return res.status(401).json({ error: 'Not signed in' });
  next();
}

app.post('/api/signup', async (req, res) => {
  const { email, password, username } = req.body || {};
  if(!email || !password || !username) return res.status(400).json({ error: 'Fill in all fields.' });
  if(password.length < 6) return res.status(400).json({ error: 'Password needs to be at least 6 characters.' });
  const emailLower = email.toLowerCase();
  const existing = db.users.find(u => u.email === emailLower);
  if(existing) return res.status(400).json({ error: 'That email already has an account — try signing in.' });

  const hash = await bcrypt.hash(password, 10);
  const user = { id: db.nextUserId++, email: emailLower, username, passwordHash: hash, createdAt: Date.now() };
  db.users.push(user);
  saveDB();
  req.session.userId = user.id;
  req.session.username = username;
  res.json({ id: user.id, email: emailLower, username });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email === (email||'').toLowerCase());
  if(!user) return res.status(400).json({ error: 'No account with that email.' });
  const ok = await bcrypt.compare(password || '', user.passwordHash);
  if(!ok) return res.status(400).json({ error: 'Wrong password.' });
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ id: user.id, email: user.email, username: user.username });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  if(!req.session.userId) return res.status(401).json({ error: 'Not signed in' });
  res.json({ id: req.session.userId, username: req.session.username });
});

// ---------- YouTube search proxy (keeps your API key private) ----------
app.get('/api/youtube-search', requireAuth, async (req, res) => {
  const q = req.query.q;
  if(!q) return res.status(400).json({ error: 'Missing search term' });
  const key = process.env.YOUTUBE_API_KEY;
  if(!key) return res.status(500).json({ error: 'Server is missing a YouTube API key. Add YOUTUBE_API_KEY in your hosting settings.' });
  try{
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(q)}&key=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    if(data.error) return res.status(500).json({ error: data.error.message });
    const results = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
    }));
    res.json({ results });
  }catch(e){
    res.status(500).json({ error: 'Search failed. Try again.' });
  }
});

// ---------- Watch history ----------
app.get('/api/history', requireAuth, (req, res) => {
  const rows = db.watchHistory
    .filter(h => h.userId === req.session.userId)
    .sort((a,b) => b.watchedAt - a.watchedAt)
    .slice(0, 20)
    .map(h => ({ title: h.title, video_id: h.videoId, thumbnail: h.thumbnail, watched_at: h.watchedAt }));
  res.json({ history: rows });
});
app.post('/api/history', requireAuth, (req, res) => {
  const { title, videoId, thumbnail } = req.body || {};
  if(!title || !videoId) return res.status(400).json({ error: 'Missing title or videoId' });
  db.watchHistory.push({ userId: req.session.userId, title, videoId, thumbnail: thumbnail || null, watchedAt: Date.now() });
  saveDB();
  res.json({ ok: true });
});

// ---------- Live room state (in memory) + Socket.io real-time sync ----------
const rooms = {};
function publicRoomState(room) {
  return { title: room.title, videoId: room.videoId, solo: room.solo, started: room.started, members: room.members, ready: room.ready, playback: room.playback };
}
function broadcastRoom(code) { if (rooms[code]) io.to(code).emit('room-update', publicRoomState(rooms[code])); }

io.on('connection', (socket) => {
  let currentRoom = null, currentUid = null, currentName = null;

  socket.on('create-room', ({ roomCode, title, videoId, solo, uid, name }) => {
    rooms[roomCode] = {
      title, videoId, solo: !!solo, started: !!solo,
      members: { [uid]: { name, lastSeen: Date.now() } },
      ready: solo ? { [uid]: true } : {},
      playback: { isPlaying: false, time: 0, lockedBy: null, lockedByName: null, updatedAt: Date.now() },
    };
    db.rooms = db.rooms.filter(r => r.code !== roomCode);
    db.rooms.push({ code: roomCode, title, videoId, solo: !!solo, createdAt: Date.now() });
    saveDB();
    currentRoom = roomCode; currentUid = uid; currentName = name;
    socket.join(roomCode);
    broadcastRoom(roomCode);
  });

  socket.on('join-room', ({ roomCode, uid, name }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('join-error', "That room doesn't exist — check the code."); return; }
    room.members[uid] = { name, lastSeen: Date.now() };
    currentRoom = roomCode; currentUid = uid; currentName = name;
    socket.join(roomCode);
    broadcastRoom(roomCode);
  });

  socket.on('set-ready', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    room.ready[currentUid] = true;
    const ids = Object.keys(room.members);
    if (ids.length > 0 && ids.every((id) => room.ready[id])) room.started = true;
    broadcastRoom(currentRoom);
  });

  socket.on('playback', (partial) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    room.playback = Object.assign({}, room.playback, partial, { updatedAt: Date.now() });
    broadcastRoom(currentRoom);
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].members[currentUid];
      broadcastRoom(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Movie Night server running on port ' + PORT));
