const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const path = require('path')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET','POST']
  },
  transports: ['websocket', 'polling']
})

app.use(express.static(path.join(__dirname, 'public')))
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const rooms = {}

const skins = [
  { id: 'skin1', file: 'IMG_3472.PNG', name: 'D Ohmie' },
  { id: 'skin2', file: 'IMG_7865.PNG', name: 'Freaky Indian' },
  { id: 'skin3', file: 'IMG_7866.PNG', name: 'Yam Guy' },
  { id: 'skin4', file: 'IMG_7868.PNG', name: 'Sleepy Ogre' },
  { id: 'skin5', file: 'IMG_7869.PNG', name: 'Sexy Ogre' },
  { id: 'skin6', file: 'IMG_7870.PNG', name: 'Yam ahh' },
  { id: 'skin7', file: 'IMG_7871.PNG', name: 'AD pizza man' },
  { id: 'skin8', file: 'IMG_7872.PNG', name: 'Afro Mf' },
  { id: 'skin9', file: 'IMG_7873.PNG', name: 'DubC' },
  { id: 'skin10', file: 'IMG_7874.PNG', name: 'Cool Matt' }
]

function generateCode() {
  return Math.random().toString(36).substring(2,6).toUpperCase()
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase()
}

function normalizeTeam(team) {
  return team === 'blue' ? 'blue' : 'red'
}

function normalizeMap(map) {
  return map === 'funland' || map === 'ghosttown' || map === 'rooftop' ? map : 'speedball'
}

function normalizeGameMode(gameMode) {
  return gameMode === '2v2' ? '2v2' : '1v1'
}

function normalizeFirstTo(firstTo) {
  return Number(firstTo) === 10 ? 10 : 5
}

function normalizeSkin({ skinId, skinFile, skinName } = {}) {
  const id = String(skinId || '').trim()
  const file = String(skinFile || '').trim()
  const name = String(skinName || '').trim().toLowerCase()
  const skin = skins.find(item => item.id === id)
    || skins.find(item => item.file === file)
    || skins.find(item => item.name.toLowerCase() === name)
    || skins[0]
  return { skinId: skin.id, skinFile: skin.file, skinName: skin.name }
}

function isValidMap(map) {
  return map === 'speedball' || map === 'funland' || map === 'ghosttown' || map === 'rooftop'
}

function isValidGameMode(gameMode) {
  return gameMode === '1v1' || gameMode === '2v2'
}

function isValidFirstTo(firstTo) {
  return Number(firstTo) === 5 || Number(firstTo) === 10
}

function removePlayerFromRoom(socket, code) {
  const room = rooms[code]
  if (!room) return
  const existing = room.players.find(p => p.id === socket.id)
  if (!existing) return
  room.players = room.players.filter(p => p.id !== socket.id)
  socket.leave(code)
  if (room.players.length === 0) {
    delete rooms[code]
    return
  }
  if (room.host === socket.id) room.host = room.players[0].id
  io.to(code).emit('lobby_update', room)
  io.to(code).emit('player_disconnected', { id: socket.id })
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id)

  socket.on('create_room', ({ username, gameMode, map, firstTo, skinId, skinFile, skinName } = {}) => {
    const code = generateCode()
    const skin = normalizeSkin({ skinId, skinFile, skinName })
    rooms[code] = {
      code, host: socket.id,
      gameMode: normalizeGameMode(gameMode), map: normalizeMap(map), firstTo: normalizeFirstTo(firstTo),
      players: [{
        id: socket.id, username: String(username || 'Player').slice(0, 16),
        team: 'red', ready: false, connected: true, returningToLobby: false, ...skin
      }],
      state: 'lobby'
    }
    socket.join(code)
    socket.emit('room_created', { code, room: rooms[code] })
    console.log('Room created:', code)
  })

  socket.on('join_room', ({ code, username, skinId, skinFile, skinName }) => {
    code = normalizeCode(code)
    const room = rooms[code]
    if (!room) { socket.emit('join_error', 'Room not found'); return }
    if (room.players.length >= (room.gameMode === '2v2' ? 4 : 2)) {
      socket.emit('join_error', 'Room is full'); return
    }
    const team = room.players.filter(p=>p.team==='red').length <=
                 room.players.filter(p=>p.team==='blue').length ? 'red' : 'blue'
    const skin = normalizeSkin({ skinId, skinFile, skinName })
    room.players.push({ id: socket.id, username: String(username || 'Player').slice(0, 16), team, ready: false, connected: true, returningToLobby: false, ...skin })
    socket.join(code)
    socket.emit('room_joined', { code, room })
    io.to(code).emit('lobby_update', room)
  })

  socket.on('rejoin_lobby', ({ code, username, team, skinId, skinFile, skinName }) => {
    code = normalizeCode(code)
    team = normalizeTeam(team)
    username = String(username || 'Player').slice(0, 16)
    const skin = normalizeSkin({ skinId, skinFile, skinName })
    const room = rooms[code]
    if (!room) { socket.emit('join_error', 'Room not found'); return }
    room.state = 'lobby'
    socket.join(code)
    let player = room.players.find(p => p.username === username) || room.players.find(p => p.id === socket.id)
    if (player) {
      if (room.host === player.id) room.host = socket.id
      player.id = socket.id
      player.team = team
      player.connected = true
      player.returningToLobby = false
      Object.assign(player, skin)
    } else {
      const maxPlayers = room.gameMode === '2v2' ? 4 : 2
      if (room.players.length >= maxPlayers) { socket.emit('join_error', 'Room is full'); return }
      player = { id: socket.id, username, team, ready: false, connected: true, returningToLobby: false, ...skin }
      room.players.push(player)
    }
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

  socket.on('update_room_settings', ({ code, gameMode, map, firstTo } = {}) => {
    code = normalizeCode(code)
    const room = rooms[code]
    if (!room) return
    if (room.host !== socket.id) {
      socket.emit('settings_error', 'Only host can change settings')
      return
    }
    if (room.state !== 'lobby') {
      socket.emit('settings_error', 'Settings can only change in lobby')
      return
    }

    const updates = {}
    if (map !== undefined) {
      map = String(map)
      if (!isValidMap(map)) { socket.emit('settings_error', 'Invalid map'); return }
      updates.map = map
    }
    if (gameMode !== undefined) {
      gameMode = String(gameMode)
      if (!isValidGameMode(gameMode)) { socket.emit('settings_error', 'Invalid squad size'); return }
      if (gameMode === '1v1' && room.players.length > 2) {
        socket.emit('settings_error', 'Too many players for 1v1')
        return
      }
      updates.gameMode = gameMode
    }
    if (firstTo !== undefined) {
      if (!isValidFirstTo(firstTo)) { socket.emit('settings_error', 'Invalid win condition'); return }
      updates.firstTo = Number(firstTo)
    }

    const changed = Object.keys(updates).some(key => room[key] !== updates[key])
    if (!changed) return
    Object.assign(room, updates)
    if (room.gameMode === '1v1' && room.players.length === 2) {
      room.players[0].team = 'red'
      room.players[1].team = 'blue'
    }
    room.players.forEach(player => { player.ready = false })
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

  socket.on('rejoin_room', ({ code, username, team, skinId, skinFile, skinName }) => {
    code = normalizeCode(code)
    team = normalizeTeam(team)
    username = String(username || 'Player').slice(0, 16)
    const skin = normalizeSkin({ skinId, skinFile, skinName })
    const room = rooms[code]
    if (!room) {
      socket.emit('rejoin_error', 'Room not found')
      return
    }
    socket.join(code)
    let player = room.players.find(p => p.username === username) || room.players.find(p => p.id === socket.id)
    if (player) {
      if (room.host === player.id) room.host = socket.id
      player.id = socket.id
      player.team = team
      player.ready = true
      player.connected = true
      player.returningToLobby = false
      Object.assign(player, skin)
    } else {
      player = { id: socket.id, username, team, ready: true, connected: true, returningToLobby: false, ...skin }
      room.players.push(player)
    }
    socket.emit('game_ready', { room, myTeam: team })
    io.to(code).emit('player_in_game', { id: socket.id, username, team, ...skin })
  })

  socket.on('player_update', ({ code, position, rotation, state, crouching, prone }) => {
    code = normalizeCode(code)
    if (!rooms[code]) return
    socket.to(code).emit('opponent_update', {
      id: socket.id, position, rotation, state, crouching, prone
    })
  })

  socket.on('player_shoot', ({ code, origin, direction, team, shot }) => {
    code = normalizeCode(code)
    if (!rooms[code]) return
    socket.to(code).emit('opponent_shoot', {
      id: socket.id, origin, direction, team, shot
    })
  })

  socket.on('player_hit', ({ code, victimId, shot }) => {
    code = normalizeCode(code)
    if (!rooms[code]) return
    io.to(code).emit('hit_confirmed', {
      shooterId: socket.id, victimId, shot
    })
  })

  socket.on('round_end', ({ code, winner }) => {
    code = normalizeCode(code)
    if (!rooms[code]) return
    io.to(code).emit('round_ended', { winner })
  })

  socket.on('return_to_lobby', ({ code }, ack) => {
    code = normalizeCode(code)
    const room = rooms[code]
    if (room) {
      room.state = 'lobby'
      const player = room.players.find(p => p.id === socket.id)
      if (player) {
        player.connected = false
        player.returningToLobby = true
      }
      io.to(code).emit('lobby_update', room)
    }
    if (typeof ack === 'function') ack()
  })

  socket.on('leave_room', ({ code }, ack) => {
    code = normalizeCode(code)
    removePlayerFromRoom(socket, code)
    if (typeof ack === 'function') ack()
  })

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code]
      const player = room.players.find(p => p.id === socket.id)
      if (room.state === 'playing' || player?.returningToLobby) {
        if (player) {
          player.connected = false
          io.to(code).emit('player_disconnected', { id: socket.id })
        }
        return
      }
      removePlayerFromRoom(socket, code)
    })
  })
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
