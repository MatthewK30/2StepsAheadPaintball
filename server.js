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
  return map === 'funland' || map === 'ghosttown' || map === 'rooftop' || map === 'castle' || map === 'beachmansion' ? map : 'speedball'
}

function normalizeGameMode(gameMode) {
  return gameMode === '2v2' ? '2v2' : '1v1'
}

function normalizeFirstTo(firstTo) {
  return Number(firstTo) === 10 ? 10 : 5
}

function normalizeMatchType(matchType) {
  return matchType === 'search_destroy' ? 'search_destroy' : 'standard'
}

function normalizeAttackingTeam(team) {
  return team === 'blue' || team === 'random' ? team : 'red'
}

function normalizeBotDifficulty(difficulty) {
  return difficulty === 'basic' || difficulty === 'elite' ? difficulty : 'pro'
}

function maxPlayersForRoom(room) {
  return room?.gameMode === '2v2' ? 4 : 2
}

function maxPlayersPerTeam(room) {
  return room?.gameMode === '2v2' ? 2 : 1
}

function ensureRoomBots(room) {
  if (!room) return []
  if (room.gameMode !== '2v2') {
    room.bots = []
    return room.bots
  }
  if (!Array.isArray(room.bots)) room.bots = []
  return room.bots
}

function normalizeSlotIndex(slotIndex) {
  const value = Number(slotIndex)
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : -1
}

function slotTeam(slotIndex) {
  return slotIndex < 2 ? 'red' : 'blue'
}

function teamSlotIndex(slotIndex) {
  return slotIndex < 2 ? slotIndex : slotIndex - 2
}

function teamPlayerCount(room, team, ignorePlayerId) {
  return room.players.filter(p => p.team === team && p.id !== ignorePlayerId).length
}

function teamBotCount(room, team) {
  return ensureRoomBots(room).filter(bot => slotTeam(normalizeSlotIndex(bot.slotIndex)) === team).length
}

function teamOccupancy(room, team, ignorePlayerId) {
  return teamPlayerCount(room, team, ignorePlayerId) + teamBotCount(room, team)
}

function occupiedRoomSlots(room) {
  return room.players.length + ensureRoomBots(room).length
}

function chooseAvailableTeam(room, preferredTeam, ignorePlayerId) {
  const maxPerTeam = maxPlayersPerTeam(room)
  const preferred = normalizeTeam(preferredTeam)
  if (preferredTeam && teamOccupancy(room, preferred, ignorePlayerId) < maxPerTeam) return preferred
  const redCount = teamOccupancy(room, 'red', ignorePlayerId)
  const blueCount = teamOccupancy(room, 'blue', ignorePlayerId)
  if (redCount <= blueCount && redCount < maxPerTeam) return 'red'
  if (blueCount < maxPerTeam) return 'blue'
  if (redCount < maxPerTeam) return 'red'
  return ''
}

function pruneBotConflicts(room) {
  const bots = ensureRoomBots(room)
  if (room.gameMode !== '2v2') return
  const seen = new Set()
  room.bots = bots.filter(bot => {
    const slotIndex = normalizeSlotIndex(bot.slotIndex)
    if (slotIndex < 0 || seen.has(slotIndex)) return false
    const team = slotTeam(slotIndex)
    const playerCount = teamPlayerCount(room, team)
    if (teamSlotIndex(slotIndex) < playerCount) return false
    seen.add(slotIndex)
    bot.slotIndex = slotIndex
    bot.team = team
    bot.difficulty = normalizeBotDifficulty(bot.difficulty)
    return true
  })
}

function botSlotIsOpen(room, slotIndex) {
  if (room.gameMode !== '2v2') return false
  const team = slotTeam(slotIndex)
  return teamSlotIndex(slotIndex) >= teamPlayerCount(room, team)
    && !ensureRoomBots(room).some(bot => normalizeSlotIndex(bot.slotIndex) === slotIndex)
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
  return map === 'speedball' || map === 'funland' || map === 'ghosttown' || map === 'rooftop' || map === 'castle' || map === 'beachmansion'
}

function isValidGameMode(gameMode) {
  return gameMode === '1v1' || gameMode === '2v2'
}

function isValidFirstTo(firstTo) {
  return Number(firstTo) === 5 || Number(firstTo) === 10
}

function isValidMatchType(matchType) {
  return matchType === 'standard' || matchType === 'search_destroy'
}

function isValidAttackingTeam(team) {
  return team === 'red' || team === 'blue' || team === 'random'
}

function searchDestroyParticipants(room, team) {
  const players = room.players
    .filter(player => player.team === team)
    .map(player => ({ id: player.id, name: player.skinName || player.username || 'Player', type: 'player' }))
  const bots = ensureRoomBots(room)
    .filter(bot => bot.team === team)
    .map(bot => ({ id: 'bot-' + normalizeSlotIndex(bot.slotIndex), name: bot.skinName || 'Bot', type: 'bot' }))
  return players.concat(bots)
}

function createSearchDestroyState(room) {
  const attackingTeam = room.attackingTeam === 'random'
    ? (Math.random() < 0.5 ? 'red' : 'blue')
    : normalizeTeam(room.attackingTeam)
  const carrierStarts = { red: '', blue: '' }
  ;['red', 'blue'].forEach(team => {
    const participants = searchDestroyParticipants(room, team)
    if (participants.length > 0) carrierStarts[team] = participants[Math.floor(Math.random() * participants.length)].id
  })
  const carrierId = carrierStarts[attackingTeam] || ''
  return {
    bombState: carrierId ? 'carried' : 'dropped',
    bombCarrierId: carrierId,
    bombPosition: null,
    plantedSiteId: null,
    plantProgress: 0,
    defuseProgress: 0,
    detonationTimer: 15,
    attackingTeam,
    defendingTeam: attackingTeam === 'red' ? 'blue' : 'red',
    round: 1,
    carrierStarts
  }
}

function updateSearchDestroyState(room, eventName, payload, socketId) {
  if (!room || room.matchType !== 'search_destroy') return null
  if (!room.sd) room.sd = createSearchDestroyState(room)
  const sd = room.sd
  if (payload && Number.isFinite(Number(payload.round))) sd.round = Number(payload.round)
  if (payload && (payload.attackingTeam === 'red' || payload.attackingTeam === 'blue')) {
    sd.attackingTeam = payload.attackingTeam
    sd.defendingTeam = payload.attackingTeam === 'red' ? 'blue' : 'red'
  }
  if (payload && payload.bombPosition) sd.bombPosition = payload.bombPosition
  if (payload && payload.plantedSiteId) sd.plantedSiteId = payload.plantedSiteId
  if (payload && Number.isFinite(Number(payload.plantProgress))) sd.plantProgress = Number(payload.plantProgress)
  if (payload && Number.isFinite(Number(payload.defuseProgress))) sd.defuseProgress = Number(payload.defuseProgress)
  if (payload && Number.isFinite(Number(payload.detonationTimer))) sd.detonationTimer = Number(payload.detonationTimer)
  if (eventName === 'bomb_carrier_assigned' || eventName === 'bomb_picked_up') {
    sd.bombState = 'carried'
    sd.bombCarrierId = String(payload?.bombCarrierId || payload?.carrierId || socketId || '')
    sd.bombPosition = null
    sd.plantedSiteId = null
    sd.plantProgress = 0
    sd.defuseProgress = 0
  } else if (eventName === 'bomb_dropped') {
    sd.bombState = 'dropped'
    sd.bombCarrierId = ''
    sd.plantedSiteId = null
    sd.plantProgress = 0
    sd.defuseProgress = 0
  } else if (eventName === 'bomb_plant_start') {
    sd.plantProgress = Number(payload?.plantProgress) || 0
  } else if (eventName === 'bomb_plant_cancel') {
    sd.plantProgress = 0
  } else if (eventName === 'bomb_planted') {
    sd.bombState = 'planted'
    sd.bombCarrierId = ''
    sd.plantProgress = 1
    sd.defuseProgress = 0
    sd.detonationTimer = 15
  } else if (eventName === 'bomb_defuse_start') {
    sd.defuseProgress = Number(payload?.defuseProgress) || 0
  } else if (eventName === 'bomb_defuse_cancel') {
    sd.defuseProgress = 0
  } else if (eventName === 'bomb_defused') {
    sd.bombState = 'defused'
    sd.defuseProgress = 1
    sd.detonationTimer = 0
  } else if (eventName === 'bomb_exploded') {
    sd.bombState = 'exploded'
    sd.detonationTimer = 0
  } else if (eventName === 'side_switch') {
    sd.bombState = 'carried'
    sd.bombCarrierId = String(payload?.bombCarrierId || '')
    sd.bombPosition = null
    sd.plantedSiteId = null
    sd.plantProgress = 0
    sd.defuseProgress = 0
    sd.detonationTimer = 15
  }
  return { ...payload, playerId: socketId, bombState: sd.bombState, bombCarrierId: sd.bombCarrierId, bombPosition: sd.bombPosition, plantedSiteId: sd.plantedSiteId, plantProgress: sd.plantProgress, defuseProgress: sd.defuseProgress, detonationTimer: sd.detonationTimer, attackingTeam: sd.attackingTeam, defendingTeam: sd.defendingTeam, round: sd.round }
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

  socket.on('create_room', ({ username, gameMode, map, firstTo, matchType, attackingTeam, skinId, skinFile, skinName } = {}) => {
    const code = generateCode()
    const skin = normalizeSkin({ skinId, skinFile, skinName })
    const nextMatchType = normalizeMatchType(matchType)
    rooms[code] = {
      code, host: socket.id,
      gameMode: normalizeGameMode(gameMode), map: normalizeMap(map), firstTo: nextMatchType === 'search_destroy' ? 5 : normalizeFirstTo(firstTo),
      matchType: nextMatchType, attackingTeam: normalizeAttackingTeam(attackingTeam), sd: null,
      players: [{
        id: socket.id, username: String(username || 'Player').slice(0, 16),
        team: 'red', ready: false, connected: true, returningToLobby: false, ...skin
      }],
      bots: [],
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
    pruneBotConflicts(room)
    if (occupiedRoomSlots(room) >= maxPlayersForRoom(room)) {
      socket.emit('join_error', 'Room is full'); return
    }
    const team = chooseAvailableTeam(room)
    if (!team) { socket.emit('join_error', 'Room is full'); return }
    const skin = normalizeSkin({ skinId, skinFile, skinName })
    room.players.push({ id: socket.id, username: String(username || 'Player').slice(0, 16), team, ready: false, connected: true, returningToLobby: false, ...skin })
    pruneBotConflicts(room)
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
      team = chooseAvailableTeam(room, team, player.id) || player.team
      player.id = socket.id
      player.team = team
      player.connected = true
      player.returningToLobby = false
      Object.assign(player, skin)
    } else {
      if (occupiedRoomSlots(room) >= maxPlayersForRoom(room)) { socket.emit('join_error', 'Room is full'); return }
      team = chooseAvailableTeam(room, team)
      if (!team) { socket.emit('join_error', 'Room is full'); return }
      player = { id: socket.id, username, team, ready: false, connected: true, returningToLobby: false, ...skin }
      room.players.push(player)
    }
    pruneBotConflicts(room)
    socket.emit('room_joined', { code, room })
    io.to(code).emit('lobby_update', room)
  })

  socket.on('switch_team', ({ code }) => {
    const room = rooms[code]
    if (!room) return
    const player = room.players.find(p => p.id === socket.id)
    if (!player) return
    const newTeam = player.team === 'red' ? 'blue' : 'red'
    if (teamOccupancy(room, newTeam, player.id) >= maxPlayersPerTeam(room)) {
      socket.emit('switch_error', 'Team is full'); return
    }
    player.team = newTeam
    pruneBotConflicts(room)
    io.to(code).emit('lobby_update', room)
  })

  socket.on('update_room_settings', ({ code, gameMode, map, firstTo, matchType, attackingTeam } = {}) => {
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
    if (matchType !== undefined) {
      matchType = String(matchType)
      if (!isValidMatchType(matchType)) { socket.emit('settings_error', 'Invalid match type'); return }
      updates.matchType = matchType
      if (matchType === 'search_destroy') updates.firstTo = 5
    }
    if (attackingTeam !== undefined) {
      attackingTeam = String(attackingTeam)
      if (!isValidAttackingTeam(attackingTeam)) { socket.emit('settings_error', 'Invalid attacking team'); return }
      updates.attackingTeam = attackingTeam
    }

    const changed = Object.keys(updates).some(key => room[key] !== updates[key])
    if (!changed) return
    Object.assign(room, updates)
    if (room.gameMode !== '2v2') room.bots = []
    else pruneBotConflicts(room)
    if (room.gameMode === '1v1' && room.players.length === 2) {
      room.players[0].team = 'red'
      room.players[1].team = 'blue'
    }
    if (room.matchType === 'search_destroy') room.firstTo = 5
    room.sd = null
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

  socket.on('toggle_bot_slot', ({ code, slotIndex, difficulty, action } = {}) => {
    code = normalizeCode(code)
    const room = rooms[code]
    if (!room || room.state !== 'lobby' || room.gameMode !== '2v2') return
    // Resilient host check: accept by socket.id OR by matching username of the stored host
    const hostPlayer = room.players.find(p => p.id === room.host)
    const me = room.players.find(p => p.id === socket.id)
    const isHost = socket.id === room.host || (me && hostPlayer && me.username === hostPlayer.username)
    if (!isHost) { socket.emit('bot_slot_error', 'Only the host can add or remove bots'); return }
    // Keep room.host in sync in case socket reconnected
    if (socket.id !== room.host && me) room.host = socket.id
    slotIndex = normalizeSlotIndex(slotIndex)
    if (slotIndex < 0) return
    pruneBotConflicts(room)
    const existingBot = room.bots.find(bot => normalizeSlotIndex(bot.slotIndex) === slotIndex)
    if (existingBot) {
      if (action === 'difficulty' && difficulty) {
        existingBot.difficulty = normalizeBotDifficulty(difficulty)
      } else {
        room.bots = room.bots.filter(bot => normalizeSlotIndex(bot.slotIndex) !== slotIndex)
      }
    } else if (botSlotIsOpen(room, slotIndex)) {
      const idx = Math.floor(Math.random() * skins.length)
      room.bots.push({
        slotIndex,
        team: slotTeam(slotIndex),
        difficulty: normalizeBotDifficulty(difficulty),
        skinId: skins[idx].id,
        skinFile: skins[idx].file,
        skinName: skins[idx].name
      })
    }
    io.to(code).emit('lobby_update', room)
  })

  socket.on('start_game', ({ code }) => {
    const room = rooms[code]
    if (!room || room.host !== socket.id) return
    pruneBotConflicts(room)
    const allReady = room.players.length > 0 && room.players.every(p => p.ready)
    if (!allReady) { socket.emit('start_error', 'Not all players ready'); return }
    if (room.gameMode === '2v2') {
      const totalSlots = 4
      ensureRoomBots(room)
      const teamOccupants = { red: 0, blue: 0 }
      room.players.forEach(p => { if (p.team === 'red' || p.team === 'blue') teamOccupants[p.team]++ })
      const filled = new Set()
      ;['red', 'blue'].forEach(team => {
        for (let i = 0; i < teamOccupants[team]; i++) filled.add(team === 'red' ? i : i + 2)
      })
      room.bots.forEach(b => filled.add(normalizeSlotIndex(b.slotIndex)))
      for (let slot = 0; slot < totalSlots; slot++) {
        if (filled.has(slot)) continue
        const idx = Math.floor(Math.random() * skins.length)
        room.bots.push({
          slotIndex: slot,
          team: slotTeam(slot),
          difficulty: 'pro',
          skinId: skins[idx].id,
          skinFile: skins[idx].file,
          skinName: skins[idx].name
        })
      }
      io.to(code).emit('lobby_update', room)
    }
    room.state = 'playing'
    room.sd = room.matchType === 'search_destroy' ? createSearchDestroyState(room) : null
    io.to(code).emit('game_start', { room, bots: room.bots || [] })
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

  socket.on('player_update', ({ code, position, rotation, state, crouching, prone, team }) => {
    code = normalizeCode(code)
    if (!rooms[code]) return
    socket.to(code).emit('opponent_update', {
      id: socket.id, position, rotation, state, crouching, prone, team
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

  ;[
    'bomb_carrier_assigned',
    'bomb_dropped',
    'bomb_picked_up',
    'bomb_plant_start',
    'bomb_plant_cancel',
    'bomb_planted',
    'bomb_defuse_start',
    'bomb_defuse_cancel',
    'bomb_defused',
    'bomb_exploded',
    'side_switch'
  ].forEach(eventName => {
    socket.on(eventName, (payload = {}) => {
      const code = normalizeCode(payload.code)
      const room = rooms[code]
      if (!room || room.matchType !== 'search_destroy') return
      const eventPayload = updateSearchDestroyState(room, eventName, payload, socket.id)
      io.to(code).emit(eventName, eventPayload)
    })
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

  socket.on('ping_check', (_, cb) => { if (typeof cb === 'function') cb(); })

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
