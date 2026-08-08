const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'Googlemeet_secret_key_2026';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Google_comm';

let isMongoConnected = false;

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

mongoose.connect(MONGO_URI)
    .then(() => {
        isMongoConnected = true;
        console.log('✅ Connected to MongoDB Database: Google_comm');
    })
    .catch((err) => {
        isMongoConnected = false;
        console.log('⚠️ MongoDB Connection Failed. Using In-Memory Fallback.');
    });

const inMemoryUsers = [];
const activeUserSessions = new Map(); // Track active userId -> socketId

// REGISTER API
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });

        const normalizedEmail = email.toLowerCase().trim();

        if (isMongoConnected) {
            const existingUser = await User.findOne({ email: normalizedEmail });
            if (existingUser) return res.status(400).json({ message: 'User already exists' });

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await User.create({ name, email: normalizedEmail, password: hashedPassword });
            const token = jwt.sign({ id: user._id.toString(), email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

            return res.status(201).json({ status: 'ok', token, user: { id: user._id.toString(), name: user.name, email: user.email } });
        } else {
            if (inMemoryUsers.find(u => u.email === normalizedEmail)) return res.status(400).json({ message: 'User already exists' });

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = { id: Date.now().toString(), name, email: normalizedEmail, password: hashedPassword };
            inMemoryUsers.push(user);
            const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

            return res.status(201).json({ status: 'ok', token, user: { id: user.id, name: user.name, email: user.email } });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// LOGIN API
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

        const normalizedEmail = email.toLowerCase().trim();
        let user = isMongoConnected ? await User.findOne({ email: normalizedEmail }) : inMemoryUsers.find(u => u.email === normalizedEmail);

        if (!user) return res.status(401).json({ message: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const userId = user._id ? user._id.toString() : user.id;
        const token = jwt.sign({ id: userId, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

        return res.json({ status: 'ok', token, user: { id: userId, name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// HTTP & SOCKET SERVER
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.use((socket, next) => {
    const token = socket.handshake.auth ? socket.handshake.auth.token : null;
    if (!token) return next();
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Auth error'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    // Single Account Login Control
    if (socket.user && socket.user.id) {
        const userId = socket.user.id;
        if (activeUserSessions.has(userId)) {
            const previousSocketId = activeUserSessions.get(userId);
            io.to(previousSocketId).emit('force-logout', {
                message: 'Your account was logged in from another browser/location.'
            });
        }
        activeUserSessions.set(userId, socket.id);
    }

    // Room tracking array to preserve rooms before disconnection cleanup
    const currentRooms = new Set();

    socket.on('join-room', ({ room, socketId, userName }) => {
        socket.join(room);
        currentRooms.add(room);
        socket.to(room).emit('user-connected', { socketId, userName });
    });

    socket.on('signal', (data) => {
        io.to(data.target).emit('signal', { 
            sender: socket.id, 
            signal: data.signal,
            room: data.room 
        });
    });

    socket.on('draw-whiteboard', (data) => socket.to(data.room).emit('draw-whiteboard', data));
    socket.on('clear-whiteboard', (room) => socket.to(room).emit('clear-whiteboard'));

    socket.on('send-chat', (data) => socket.to(data.room).emit('receive-chat', data));
    socket.on('send-file', (data) => socket.to(data.room).emit('receive-file', data.fileData));

    socket.on('leave-room', ({ room }) => {
        socket.leave(room);
        currentRooms.delete(room);
        socket.to(room).emit('user-disconnected', socket.id);
    });

    socket.on('disconnect', () => {
        if (socket.user && activeUserSessions.get(socket.user.id) === socket.id) {
            activeUserSessions.delete(socket.user.id);
        }
        
        // Notify members in rooms user belonged to
        currentRooms.forEach(room => {
            socket.to(room).emit('user-disconnected', socket.id);
        });
        currentRooms.clear();
    });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});