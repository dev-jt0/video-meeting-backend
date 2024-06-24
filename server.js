const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const express = require('express');
require('dotenv').config();

const app = express();
const server = require('http').Server(app);

process.on("uncaughtException", (err) => console.log('exception', err));
process.on("unhandledRejection", (err) => console.log('rejection', err));

const port = process.env.PORT || 3001;
const io = require('socket.io')(server, {
	cors: {
		origin: "*"
	},
	maxHttpBufferSize: 1e8
});

app.use(express.json({
	limit: '100mb',
}));

app.use(cors({
	origin: '*'
}));

let rooms = {};

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'upload/')
	},
	filename: (req, file, cb) => {
		if (!fs.existsSync('./upload')) fs.mkdirSync('./upload');
		cb(null, req.body.name);
	},
})

const upload = multer({ storage: storage });

io.of('/stream').on('connection', socket => {
	console.log("new connection", socket.id);

	socket.on('subscribe', data => {
		try {
			if (data.room) {
				socket.join(data.room);
				socket.join(data.socketId);
				socket.roomId = data.room;

				if (rooms[data.room] === undefined) {
					rooms[data.room] = {}
				}

				rooms[data.room][socket.id] = {
					...data.userData,
					clientId: data.socketId
				};

				if (socket.adapter.rooms[data.room].length > 1) {
					socket.to(data.room).emit('room', {
						user: rooms[data.room][socket.id],
						socketId: data.socketId
					})
				};
			}
			else {
				console.log("subscribe - invalid params");
			}
		} catch (error) {
			console.error(error);
		}
	});

	socket.on('newUserStart', data => {
		socket.to(data.to).emit('newUserStart', {
			sender: data.sender,
			user: data.user
		});
	});

	socket.on('sendChat', data => {
		socket.to(data.to).emit('receiveChat', {
			data: data.content
		})
	})

	socket.on('screenShareStart', data => {
		socket.to(data.room).emit('screenShareStart', {
			sender: data.sender
		})
	});

	socket.on('screenShareReady', data => {
		socket.to(data.to).emit('screenShareReady', {
			sender: data.sender
		})
	});

	socket.on('screenShareStop', data => {
		socket.to(data.room).emit('screenShareStop', {
			sender: data.sender
		});
	})

	socket.on('sdp', data => {
		socket.to(data.to).emit('sdp', {
			description: data.description,
			sender: data.sender,
			isScreen: data.isScreen,
		});
	});

	socket.on('ice candidates', data => {
		socket.to(data.to).emit('ice candidates', {
			candidate: data.candidate,
			sender: data.sender,
			isScreen: data.isScreen,
		});
	});

	socket.on('disconnect', async () => {
		try {
			console.log('Got disconnect!', socket.id);
			console.log('room = ', rooms);

			if (rooms[socket.roomId] && rooms[socket.roomId][socket.id]) {
				const clientId = rooms[socket.roomId][socket.id].clientId;
				delete rooms[socket.roomId][socket.id];

				if (Object.keys(rooms[socket.roomId]).length === 0) {
					delete rooms[socket.roomId];
				} else {
					socket.to(socket.roomId).emit('disconnect room', {
						room: Object.values(rooms[socket.roomId]),
						clientId: clientId
					});
				}
			}
		} catch (err) {
			console.error('disconnect error = ', err);
		}
	});
});

app.use(express.static(__dirname + "/build"));

app.post('/upload', upload.single('file'), async (req, res) => {
	if (req.file)
		res.send({ state: true });
	else
		res.send({ state: false });
})

app.get('/download', (req, res) => {
	const filePath = `${__dirname}/upload/${req.query.uploaded}`;

	res.download(filePath, req.query.name);
});

app.get('/*', function (req, res) {
	res.sendFile(__dirname + '/build/index.html', function (err) {
		if (err) {
			res.status(500).send(err)
		}
	})
})

server.listen(port, () => { console.log("Server is listenning to port 3001") });