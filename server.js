const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getRandomWordPair } = require('./utils/words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware pour servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Stockage en mémoire
const rooms = {};

// Fonctions utilitaires
const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

io.on('connection', (socket) => {
    // --- CREER UN SALON ---
    socket.on('create_room', (data, callback) => {
        const { playerName, sessionId } = data;
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) {
            roomCode = generateRoomCode();
        }

        const newPlayer = {
            id: sessionId,
            socketId: socket.id,
            name: playerName,
            isCreator: true,
            isReady: false,
            role: null,
            word: null,
            hint: null,
            hasSeenWord: false,
            hasVoted: false,
            voteFor: null,
            isConnected: true
        };

        rooms[roomCode] = {
            id: roomCode,
            players: [newPlayer],
            settings: {
                imposterCount: 1,
                imposterMode: 'different_word',
                theme: 'random' // Nouveau paramètre
            },
            state: 'lobby', // lobby, word_distribution, discussion, voting, results, paused
            previousState: null,
            currentTheme: null,
            votes: {},
            eliminatedPlayer: null,
            winner: null
        };

        socket.join(roomCode);
        socket.roomId = roomCode; // Mémoriser le salon du socket

        callback({ success: true, roomCode });
        io.to(roomCode).emit('update_room', rooms[roomCode]);
    });

    // --- REJOINDRE UN SALON ---
    socket.on('join_room', (data, callback) => {
        const { roomCode, playerName, sessionId } = data;
        const code = roomCode.toUpperCase();
        const room = rooms[code];

        if (!room) {
            return callback({ success: false, message: "Salon introuvable." });
        }
        if (room.state !== 'lobby') {
            return callback({ success: false, message: "La partie a déjà commencé." });
        }
        if (room.players.find(p => p.name === playerName)) {
            return callback({ success: false, message: "Ce pseudo est déjà pris dans ce salon." });
        }

        const newPlayer = {
            id: sessionId,
            socketId: socket.id,
            name: playerName,
            isCreator: false,
            isReady: false,
            role: null,
            word: null,
            hint: null,
            hasSeenWord: false,
            hasVoted: false,
            voteFor: null,
            isConnected: true
        };

        room.players.push(newPlayer);
        socket.join(code);
        socket.roomId = code;

        callback({ success: true, roomCode: code });
        io.to(code).emit('update_room', room);
    });

    // --- PARAMETRES DU SALON ---
    socket.on('update_settings', (settings) => {
        const room = rooms[socket.roomId];
        if (room && room.state === 'lobby') {
            const player = room.players.find(p => p.id === socket.id);
            if (player && player.isCreator) {
                // S'assurer que les valeurs sont cohérentes
                room.settings = {
                    imposterCount: parseInt(settings.imposterCount) || 1,
                    imposterMode: settings.imposterMode || 'different_word',
                    theme: settings.theme || 'random'
                };
                io.to(room.id).emit('update_room', room);
            }
        }
    });

    // --- QUITTER LE SALON ---
    socket.on('leave_room', (callback) => {
        const roomCode = socket.roomId;
        if (roomCode && rooms[roomCode]) {
            handlePlayerLeave(socket, roomCode);
            socket.roomId = null;
            if (callback) callback({ success: true });
        }
    });

    // --- KICK UN JOUEUR ---
    socket.on('kick_player', (targetSessionId) => {
        const roomCode = socket.roomId;
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.socketId === socket.id);
            if (player && player.isCreator && player.id !== targetSessionId) {
                const targetPlayer = room.players.find(p => p.id === targetSessionId);
                if (targetPlayer && targetPlayer.socketId) {
                    const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
                    if (targetSocket) {
                        targetSocket.emit('kicked');
                        targetSocket.roomId = null;
                    }
                }
                handlePlayerLeave(roomCode, targetSessionId);
            }
        }
    });

    // --- TOGGLE READY ---
    socket.on('toggle_ready', () => {
        const room = rooms[socket.roomId];
        if (room && room.state === 'lobby') {
            const player = room.players.find(p => p.socketId === socket.id);
            if (player) {
                player.isReady = !player.isReady;
                io.to(room.id).emit('update_room', room);
            }
        }
    });

    // --- LANCER LA PARTIE ---
    socket.on('start_game', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.state !== 'lobby') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (!player || !player.isCreator) return;

        // Vérifier si tout le monde est prêt sauf lui potentiellement 
        // ou tout le monde y compris le créateur
        const allReady = room.players.every(p => p.isReady || p.isCreator);
        if (!allReady) return;

        if (room.players.length < 3) {
            socket.emit('error_message', 'Il faut au moins 3 joueurs pour lancer.');
            return;
        }

        const impostercount = parseInt(room.settings.imposterCount);
        if (impostercount >= room.players.length) {
            socket.emit('error_message', 'Trop d\'imposteurs pour ce nombre de joueurs.');
            return;
        }

        // --- Verifications et tirage des mots ---
        const playedWords = data && data.playedWords ? data.playedWords : [];
        const wordResult = getRandomWordPair(room.settings.theme, playedWords);
        
        if (wordResult.error) {
            socket.emit('out_of_words', wordResult.themeName);
            return;
        }

        const wordPair = wordResult.wordPair;
        room.currentTheme = wordResult.themeName;

        // Réinitialiser les états
        room.players.forEach(p => {
            p.role = 'civilian';
            p.hasSeenWord = false;
            p.hasVoted = false;
            p.voteFor = null;
        });
        room.votes = {};
        room.eliminatedPlayer = null;
        room.winner = null;

        // Distribuer les rôles
        let availableIndices = room.players.map((_, i) => i);
        for (let i = 0; i < impostercount; i++) {
            const rand = Math.floor(Math.random() * availableIndices.length);
            const playerIndex = availableIndices.splice(rand, 1)[0];
            room.players[playerIndex].role = 'imposter';
        }

        // Distribuer les mots
        room.players.forEach(p => {
            if (p.role === 'civilian') {
                p.word = wordPair.normal;
                p.hint = null;
            } else { // imposter
                if (room.settings.imposterMode === 'different_word') {
                    p.word = wordPair.imposter;
                    p.hint = null;
                } else {
                    p.word = "VOUS ÊTES L'IMPOSTEUR !";
                    p.hint = wordPair.hint;
                }
            }
        });

        room.state = 'word_distribution';
        io.to(room.id).emit('game_started');
        io.to(room.id).emit('update_room', room);
        
        // Envoyer à chaque joueur son propre rôle/mot pour info privée
        room.players.forEach(p => {
            if (p.socketId) {
                io.to(p.socketId).emit('your_role', { 
                    role: p.role, 
                    word: p.word,
                    hint: p.hint,
                    theme: wordResult.themeName,
                    imposterMode: room.settings.imposterMode
                });
            }
        });

        // Informer le créateur du mot pour qu'il le sauvegarde
        socket.emit('save_played_word', wordPair.normal);
    });

    // --- VU LE MOT ---
    socket.on('seen_word', () => {
        const room = rooms[socket.roomId];
        if (!room || room.state !== 'word_distribution') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.hasSeenWord = true;
            io.to(room.id).emit('update_room', room);

            // Vérifier si tous ont vu (seulement les connectés)
            const activePlayers = room.players.filter(p => p.isConnected);
            const allSeen = activePlayers.every(p => p.hasSeenWord);
            if (allSeen && activePlayers.length > 0) {
                room.state = 'discussion';
                io.to(room.id).emit('phase_changed', room.state);
                io.to(room.id).emit('update_room', room);
            }
        }
    });

    // --- LANCER LE VOTE ---
    socket.on('start_voting', () => {
        const room = rooms[socket.roomId];
        if (!room || room.state !== 'discussion') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player && player.isCreator) {
            room.state = 'voting';
            io.to(room.id).emit('phase_changed', room.state);
            io.to(room.id).emit('update_room', room);
        }
    });

    // --- VOTER ---
    socket.on('vote', (votedPlayerId) => {
        const room = rooms[socket.roomId];
        if (!room || room.state !== 'voting') return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player && !player.hasVoted) {
            player.hasVoted = true;
            player.voteFor = votedPlayerId;
            
            if(!room.votes[votedPlayerId]) {
                room.votes[votedPlayerId] = 0;
            }
            room.votes[votedPlayerId]++;

            io.to(room.id).emit('update_room', room); // Met à jour qui a voté

            const activePlayers = room.players.filter(p => p.isConnected);
            const allVoted = activePlayers.every(p => p.hasVoted);
            if (allVoted && activePlayers.length > 0) {
                // Calcul du résultat
                let maxVotes = -1;
                let eliminatedIds = [];
                for (const [id, count] of Object.entries(room.votes)) {
                    if (count > maxVotes) {
                        maxVotes = count;
                        eliminatedIds = [id];
                    } else if (count === maxVotes) {
                        eliminatedIds.push(id);
                    }
                }

                if (eliminatedIds.length > 1) {
                    // Egalité
                    room.eliminatedPlayer = "equality";
                    // Continuer sans éliminer ou refaire voter : pour faire simple, on va dire on n'élimine personne
                } else {
                    const elimPlay = room.players.find(p => p.id === eliminatedIds[0]);
                    room.eliminatedPlayer = elimPlay;

                    // Vérifier la victoire
                    if (elimPlay.role === 'imposter') {
                        // Vérifier s'il reste des imposteurs
                        const remainingImposters = room.players.filter(p => p.role === 'imposter' && p.id !== elimPlay.id).length;
                        if (remainingImposters === 0) {
                            room.winner = 'civilians';
                        }
                    } else {
                        // Les imposteurs gagnent si les civils sont de moins en moins, ici simplifié: s'ils éliminent un civil
                        // (On pourrait calculer finement en vrai jeu, ex: s'il ne reste que 1 civil et 1 imposteur)
                        room.winner = 'imposters'; 
                    }
                }
                
                room.state = 'results';
                io.to(room.id).emit('phase_changed', room.state);
                io.to(room.id).emit('update_room', room);
            }
        }
    });

    // --- REJOUER ---
    socket.on('play_again', () => {
        const room = rooms[socket.roomId];
        if (!room || room.state !== 'results') return;
        
        const player = room.players.find(p => p.socketId === socket.id);
        if (player && player.isCreator) {
            room.state = 'lobby';
            room.currentTheme = null;
            // Clean disconnected players before replaying
            room.players = room.players.filter(p => p.isConnected);
            
            room.players.forEach(p => {
                p.isReady = false;
                p.hasSeenWord = false;
                p.hasVoted = false;
                p.voteFor = null;
                p.role = null;
                p.word = null;
                p.hint = null;
            });
            room.votes = {};
            room.eliminatedPlayer = null;
            room.winner = null;
            
            // Assign true creator just in case
            if(room.players.length > 0) room.players[0].isCreator = true;

            io.to(room.id).emit('phase_changed', room.state);
            io.to(room.id).emit('update_room', room);
        }
    });

    // --- RECONNEXION ---
    socket.on('check_reconnect', (sessionId, callback) => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            const p = room.players.find(p => p.id === sessionId && !p.isConnected);
            if (p) {
                return callback({ canReconnect: true, roomCode });
            }
        }
        return callback({ canReconnect: false });
    });

    socket.on('rejoin_game', (sessionId, callback) => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            const p = room.players.find(p => p.id === sessionId && !p.isConnected);
            if (p) {
                p.socketId = socket.id;
                p.isConnected = true;
                socket.join(roomCode);
                socket.roomId = roomCode;
                
                io.to(roomCode).emit('notification', `${p.name} s'est reconnecté(e) !`);
                
                checkAndResumeGame(room);

                if(room.state !== 'lobby' && room.state !== 'paused') {
                    socket.emit('your_role', { 
                        role: p.role, word: p.word, hint: p.hint,
                        theme: room.currentTheme,
                        imposterMode: room.settings.imposterMode
                    });
                    socket.emit('phase_changed', room.state);
                }
                io.to(roomCode).emit('update_room', room);
                if (room.state === 'paused') {
                    const disconnectedPlayers = room.players.filter(x => !x.isConnected);
                    io.to(roomCode).emit('pause_game', disconnectedPlayers);
                }
                return callback({ success: true, roomCode });
            }
        }
        callback({ success: false });
    });

    socket.on('abandon_game', (sessionId) => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            const pIndex = room.players.findIndex(p => p.id === sessionId && !p.isConnected);
            if (pIndex !== -1) {
                handlePlayerLeaveIndex(roomCode, pIndex);
                break;
            }
        }
    });

    // --- DECONNEXION ---
    socket.on('disconnect', () => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            const pIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (pIndex !== -1) {
                room.players[pIndex].isConnected = false;
                
                if (room.state === 'lobby') {
                    io.to(roomCode).emit('notification', `${room.players[pIndex].name} a quitté le salon.`);
                    // Mettre à jour la liste pour afficher (Déconnecté)
                    io.to(roomCode).emit('update_room', room);
                } else {
                    io.to(roomCode).emit('notification', `${room.players[pIndex].name} s'est déconnecté(e).`);
                    if (room.state !== 'paused') {
                        room.previousState = room.state;
                        room.state = 'paused';
                    }
                    const disconnectedPlayers = room.players.filter(x => !x.isConnected);
                    io.to(roomCode).emit('pause_game', disconnectedPlayers);
                    io.to(roomCode).emit('update_room', room);
                }
                break;
            }
        }
    });

    function checkAndResumeGame(room) {
        if (room.state !== 'paused') return;
        
        const allConnected = room.players.every(x => x.isConnected);
        if (allConnected) {
            room.state = room.previousState;
            io.to(room.id).emit('resume_game');
            io.to(room.id).emit('phase_changed', room.state);
        } else {
            const discPlayer = room.players.find(x => !x.isConnected);
            io.to(room.id).emit('pause_game', discPlayer);
        }
    }

    function handlePlayerLeave(roomCode, sessionId) {
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            // Si on utilise handlePlayerLeave generique, on essaie de match exactement avec le socket si disponible
            // Sinon on match sur l'ID (utile en dev-multionglets)
            let playerIndex = room.players.findIndex(p => p.id === sessionId && p.socketId === socket.id);
            if (playerIndex === -1) {
                playerIndex = room.players.findIndex(p => p.id === sessionId);
            }
            if (playerIndex !== -1) {
                handlePlayerLeaveIndex(roomCode, playerIndex);
            }
        }
    }

    function handlePlayerLeaveIndex(roomCode, playerIndex) {
        if (roomCode && rooms[roomCode]) {
            const room = rooms[roomCode];
            const p = room.players[playerIndex];
            if (!p) return;

            const isCreator = p.isCreator;
            
            // If it was their socket, leave it just in case
            if (p.socketId) {
                const soc = io.sockets.sockets.get(p.socketId);
                if (soc) soc.leave(roomCode);
            }

            room.players.splice(playerIndex, 1);

            if (room.players.length === 0) {
                delete rooms[roomCode];
            } else {
                if (isCreator) {
                    room.players[0].isCreator = true;
                }
                
                // Si en cours de jeu
                if (room.state !== 'lobby') {
                    // Vérifier qui est parti en premier pour voir si on a un gagnant
                    if (p.role === 'imposter') {
                        io.to(roomCode).emit('notification', `L'imposteur ${p.name} a quitté le jeu ! Victoire des civils !`);
                        const remainingImposters = room.players.filter(x => x.role === 'imposter').length;
                        if (remainingImposters === 0) {
                            room.winner = 'civilians';
                            room.state = 'results';
                            room.eliminatedPlayer = p;
                            io.to(roomCode).emit('phase_changed', 'results');
                        }
                    } else {
                        io.to(roomCode).emit('notification', `${p.name} a quitté/a été exclu. Il était civil.`);
                        const remainingCivilians = room.players.filter(x => x.role === 'civilian').length;
                        if (remainingCivilians === 0) {
                            room.winner = 'imposters';
                            room.state = 'results';
                            room.eliminatedPlayer = p;
                            io.to(roomCode).emit('phase_changed', 'results');
                        }
                    }

                    // Check enough players s'il n'y a pas DEJA un gagnant
                    if (room.state !== 'results' && room.players.length < 3) {
                        room.state = 'results';
                        room.eliminatedPlayer = { name: "Personne", role: "inconnu" };
                        room.winner = "aborted";
                        io.to(roomCode).emit('phase_changed', 'results');
                        io.to(roomCode).emit('notification', `Partie annulée : trop peu de joueurs restants.`);
                    }
                    
                    checkAndResumeGame(room);
                }
                io.to(roomCode).emit('update_room', room);
                if (room.state === 'paused') {
                    const disconnectedPlayers = room.players.filter(x => !x.isConnected);
                    io.to(roomCode).emit('pause_game', disconnectedPlayers);
                }
            }
        }
    }
});

server.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT} (http://localhost:${PORT})`);
});
