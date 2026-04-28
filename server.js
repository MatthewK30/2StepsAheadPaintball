const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const path = require('path')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET','POST'] }
})

app.use(express.static(path.join(__dirname, 'public')))
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const rooms = {}

function generateCode() {
  return Math.random().toString(36).substring(2,6).toUpperCase()
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id)

  socket.on('create_room', ({ username, gameMode, map, bestOf }) => {
    const code = generateCode()
    rooms[code] = {
      code, host: socket.id,
      gameMode, map, bestOf,
      players: [{
        id: socket.id, username,
        team: 'red', ready: false
      }],
      state: 'lobby'
    }
    socket.join(code)
    socket.emit('room_created', { code, room: rooms[code] })
    console.log('Room created:', code)
  })

  socket.on('join_room', ({ code, username }) => {
    const room = rooms[code]
    if (!room) { socket.emit('join_error', 'Room not found'); return }
    if (room.players.length >= (room.gameMode === '2v2' ? 4 : 2)) {
      socket.emit('join_error', 'Room is full'); return
    }
    const team = room.players.filter(p=>p.team==='red').length <=
                 room.players.filter(p=>p.team==='blue').length ? 'red' : 'blue'
    room.players.push({ id: socket.id, username, team, ready: false })
    socket.join(code)
    socket.emit('room_joined', { code, room })
    io.to(code).emit('lobby_update', room)
  })

  socket.on('switch_team', ({ code }) => {
    const room = rooms[code]
    if (!room) return
    const player = room.players.find(p => p.id === socket.id)
    if (!player) return
    const newTeam = player.team === 'red' ? 'blue' : 'red'
    const teamCount = room.players.filter(p=>p.team===newTeam).length
    const maxPerTeam = room.gameMode === '2v2' ? 2 : 1
    if (teamCount >= maxPerTeam) {
      socket.emit('switch_error', 'Team is full'); return
    }
    player.team = newTeam
    io.to(code).emit('lobby_update', room)
  })

  socket.on('set_ready', ({ code, ready }) => {
    const room = rooms[code]
    if (!room) return
    const player = room.players.find(p => p.id === socket.id)
    if (player) player.ready = ready
    io.to(code).emit('lobby_update', room)
  })

  socket.on('start_game', ({ code }) => {
    const room = rooms[code]
    if (!room || room.host !== socket.id) return
    const allReady = room.players.every(p => p.ready)
    if (!allReady) { socket.emit('start_error', 'Not all players ready'); return }
    room.state = 'playing'
    io.to(code).emit('game_start', room)
  })

  socket.on('player_update', ({ code, position, rotation, state }) => {
    socket.to(code).emit('opponent_update', {
      id: socket.id, position, rotation, state
    })
  })

  socket.on('player_shoot', ({ code, origin, direction, team }) => {
    socket.to(code).emit('opponent_shoot', {
      id: socket.id, origin, direction, team
    })
  })

  socket.on('player_hit', ({ code, victimId }) => {
    io.to(code).emit('hit_confirmed', {
      shooterId: socket.id, victimId
    })
  })

  socket.on('round_end', ({ code, winner }) => {
    io.to(code).emit('round_ended', { winner })
  })

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code]
      room.players = room.players.filter(p => p.id !== socket.id)
      if (room.players.length === 0) {
        delete rooms[code]
      } else {
        if (room.host === socket.id) room.host = room.players[0].id
        io.to(code).emit('lobby_update', room)
        io.to(code).emit('player_disconnected', { id: socket.id })
      }
    })
  })
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
