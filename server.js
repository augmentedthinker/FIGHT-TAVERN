const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: "*", // Allows your GitHub Pages domain to connect
        methods: ["GET", "POST"]
    }
});

let activeUsers = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register_user', (data) => {
        activeUsers[socket.id] = { id: data.id, color: data.color };
        io.emit('update_users', activeUsers);
    });

    socket.on('place_circle', (data) => {
        // Broadcast to everyone else
        socket.broadcast.emit('draw_circle', data);
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        io.emit('update_users', activeUsers);
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});