const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const User = require("./models/User");
const Message = require("./models/message");

const app = express();
const server = http.createServer(app);

// ================= SOCKET.IO CONFIG =================
const io = new Server(server, {
    cors: { origin: "*" }
});

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Serving the uploads folder so images are reachable by URL
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ================= MULTER (MEDIA STORAGE) =================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './public/uploads/'); 
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ================= DATABASE CONNECTION =================
mongoose.connect("mongodb://127.0.0.1:27017/chatApp")
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// ================= HTML ROUTES =================
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/chat", (req, res) => {
    const { username, room } = req.query;
    if (!username || !room) return res.redirect("/dashboard");
    res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// ================= REST API ROUTES =================

// 1. Media Upload API
app.post('/upload', upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ filePath: `/uploads/${req.file.filename}` });
});

// 2. Get Users API (for Sidebar)
app.get("/api/users", async (req, res) => {
    try {
        const users = await User.find({}, "username");
        res.json(users);
    } catch (err) { res.status(500).json({ error: "Failed to fetch users" }); }
});

// ================= AUTHENTICATION =================
app.post("/signup", async (req, res) => {
    try {
        const { fullname, username, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.send("User already exists");
        const newUser = new User({ fullname, username, email, password });
        await newUser.save();
        res.redirect(`/dashboard?username=${username}`);
    } catch (err) { res.status(500).send("Error creating account"); }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || user.password !== password) return res.redirect("/login.html?error=1");
        res.redirect(`/dashboard?username=${user.username}`);
    } catch (err) { res.redirect("/login.html?error=1"); }
});

// ================= SOCKET.IO LOGIC =================
io.on("connection", (socket) => {
    console.log("📡 Connected:", socket.id);

    // 1. Join Room & Load History
    socket.on("join room", async (data) => {
        const roomID = typeof data === 'string' ? data : [data.senderId, data.receiverId].sort().join("_");
        socket.join(roomID);
        console.log(`👤 User joined: ${roomID}`);

        try {
            const messages = await Message.find({ room: roomID }).sort({ time: 1 });
            socket.emit("load messages", messages);
        } catch (err) { console.error("❌ History Error:", err); }
    });

    // 2. Real-time Chat Messages (Text & Media)
    socket.on("chat message", async (data) => {
        const newMsg = new Message({
            username: data.username,
            room: data.room,
            message: data.message || "",
            fileUrl: data.fileUrl || null,
            messageType: data.messageType || 'text',
            time: new Date()
        });

        try {
            await newMsg.save();
            io.to(data.room).emit("chat message", newMsg);
        } catch (err) { console.error("❌ Message Save Error:", err); }
    });

    // 3. Typing Indicators
    socket.on("typing", (data) => {
        socket.to(data.room).emit("typing", { username: data.username });
    });

    socket.on("stop typing", (room) => {
        socket.to(room).emit("stop typing");
    });

    // 4. Disconnect
    socket.on("disconnect", () => console.log("🔌 Disconnected:", socket.id));
});

// ================= START SERVER =================
server.listen(8000, () => {
    console.log("🚀 Server running at http://localhost:8000");
});
