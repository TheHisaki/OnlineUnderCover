const socket = io(); // Rétablissement de la connexion automatique par défaut (autorise Polling)

// --- ELEMENTS DU DOM ---
const loadingScreen = document.getElementById('loading-screen');
const pauseScreen = document.getElementById('pause-screen');
const pauseText = document.getElementById('pause-text');
const btnLeavePause = document.getElementById('btn-leave-pause');
const pauseKickContainer = document.getElementById('pause-kick-container');

const btnAdminGame = document.getElementById('btn-admin-game');
const btnLeaveGame = document.getElementById('btn-leave-game');
const adminModal = document.getElementById('admin-modal');
const btnCloseAdmin = document.getElementById('btn-close-admin');
const adminPlayersList = document.getElementById('admin-players-list');

const screens = {
    home: document.getElementById('home-screen'),
    lobby: document.getElementById('lobby-screen'),
    word: document.getElementById('word-screen'),
    discussion: document.getElementById('discussion-screen'),
    voting: document.getElementById('voting-screen'),
    results: document.getElementById('results-screen'),
};

// Inputs et boutons Accueil
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('join-room-code');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const homeError = document.getElementById('home-error');

// Elements Lobby
const currentRoomCode = document.getElementById('current-room-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnInvite = document.getElementById('btn-invite');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const playersList = document.getElementById('players-list');
const creatorSettings = document.getElementById('creator-settings');
const btnReady = document.getElementById('btn-ready');
const btnStartGame = document.getElementById('btn-start-game');
const settingImposterCount = document.getElementById('setting-imposter-count');
const settingImposterMode = document.getElementById('setting-imposter-mode');
const settingTheme = document.getElementById('setting-theme');

// Elements Mot
const wordRevealCard = document.getElementById('word-reveal-card');
const frontCard = wordRevealCard.querySelector('.front-card');
const backCard = wordRevealCard.querySelector('.back-card');
const displayTheme = document.getElementById('display-theme');
const yourWordText = document.getElementById('your-word-text');
const btnSeenWord = document.getElementById('btn-seen-word');
const waitingOthersWord = document.getElementById('waiting-others-word');

// Elements Discussion
const btnStartVoting = document.getElementById('btn-start-voting');

// Elements Vote
const votePlayersList = document.getElementById('vote-players-list');
const votingWaitText = document.getElementById('voting-wait-text');

// Elements Resultats
const winnerText = document.getElementById('winner-text');
const eliminatedText = document.getElementById('eliminated-text');
const impostersReveal = document.getElementById('imposters-reveal');
const btnPlayAgain = document.getElementById('btn-play-again');

// --- VARIABLES GLOBALES ---
let myId = null;
let isMyCreator = false;
let currentRoom = null;
let selectedPlayerIdToVote = null;
let currentPausedPlayerId = null;

let sessionId = localStorage.getItem('undercover_session_id');
if (!sessionId) {
    sessionId = Math.random().toString(36).substring(2, 18);
    localStorage.setItem('undercover_session_id', sessionId);
}

let savedPlayerName = localStorage.getItem('undercover_player_name');
if (savedPlayerName) {
    playerNameInput.value = savedPlayerName;
}

// Supprimé (redondant)

// --- FONCTIONS UTILITAIRES ---
function getPlayedWords() {
    try {
        const stored = localStorage.getItem('undercover_played_words');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addPlayedWord(word) {
    const w = getPlayedWords();
    if (!w.includes(word)) w.push(word);
    localStorage.setItem('undercover_played_words', JSON.stringify(w));
}

function resetPlayedWords() {
    localStorage.setItem('undercover_played_words', '[]');
}

function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');

    // N'afficher le bouton Quitter Global que DANS une partie (pas à l'accueil ni au lobby)
    if (screenName !== 'home' && screenName !== 'lobby') {
        btnLeaveGame.classList.remove('hidden');
    } else {
        btnLeaveGame.classList.add('hidden');
    }
}

function getPlayerName() {
    const name = playerNameInput.value.trim();
    if (!name) {
        homeError.textContent = "Veuillez entrer un pseudo.";
        return null;
    }
    homeError.textContent = "";
    localStorage.setItem('undercover_player_name', name);
    return name;
}

// --- EVENEMENTS UI ---

// Initialisation avec URL
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('room')) {
    roomCodeInput.value = urlParams.get('room').toUpperCase();
}

btnCreateRoom.addEventListener('click', () => {
    const playerName = getPlayerName();
    if (playerName) {
        const codeAdmin = prompt("Code secret pour créer un salon :");
        if (codeAdmin !== "180908") {
            alert("Code invalide. Seul l'administrateur peut créer des salles pour l'instant.");
            return;
        }

        socket.emit('create_room', { playerName, sessionId }, (res) => {
            if (res.success) {
                window.history.replaceState(null, '', '/?room=' + res.roomCode);
                showScreen('lobby');
            }
        });
    }
});

btnJoinRoom.addEventListener('click', () => {
    const playerName = getPlayerName();
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    
    if (!roomCode) {
        homeError.textContent = "Veuillez entrer un code de salon.";
        return;
    }

    if (playerName) {
        socket.emit('join_room', { playerName, roomCode, sessionId }, (res) => {
            if (res.success) {
                window.history.replaceState(null, '', '/?room=' + roomCode);
                showScreen('lobby');
            } else {
                homeError.textContent = res.message;
            }
        });
    }
});

btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomCode.textContent).then(() => {
        const originalText = btnCopyCode.textContent;
        btnCopyCode.textContent = "Copié !";
        setTimeout(() => btnCopyCode.textContent = originalText, 2000);
    });
});

btnInvite.addEventListener('click', async () => {
    const inviteUrl = window.location.origin + window.location.pathname + '?room=' + currentRoom.id;
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Partie Undercover',
                text: 'Rejoins ma partie Undercover avec le code : ' + currentRoom.id,
                url: inviteUrl
            });
        } catch (e) {
            console.log("Partage annulé");
        }
    } else {
        alert("Le partage n'est pas supporté. Copie plutôt le code !");
    }
});

btnLeaveRoom.addEventListener('click', () => {
    socket.emit('leave_room', (res) => {
        if(res.success) {
            window.history.replaceState(null, '', '/');
            showScreen('home');
            currentRoom = null;
            isMyCreator = false;
        }
    });
});

btnLeaveGame.addEventListener('click', () => {
    if (confirm("Voulez-vous vraiment quitter la partie en cours ?")) {
        socket.emit('abandon_game', sessionId);
        window.history.replaceState(null, '', '/');
        btnLeaveGame.classList.add('hidden');
        btnAdminGame.classList.add('hidden');
        showScreen('home');
    }
});

btnLeavePause.addEventListener('click', () => {
    socket.emit('abandon_game', sessionId);
    window.history.replaceState(null, '', '/');
    pauseScreen.classList.remove('active');
    showScreen('home');
    currentRoom = null;
    isMyCreator = false;
});

btnAdminGame.addEventListener('click', () => {
    adminModal.classList.add('active');
});

btnCloseAdmin.addEventListener('click', () => {
    adminModal.classList.remove('active');
});

settingImposterCount.addEventListener('change', () => updateSettings());
settingImposterMode.addEventListener('change', () => updateSettings());
settingTheme.addEventListener('change', () => updateSettings());

function updateSettings() {
    if (isMyCreator) {
        socket.emit('update_settings', {
            imposterCount: parseInt(settingImposterCount.value),
            imposterMode: settingImposterMode.value,
            theme: settingTheme.value
        });
    }
}

btnReady.addEventListener('click', () => {
    socket.emit('toggle_ready');
});

btnStartGame.addEventListener('click', () => {
    socket.emit('start_game', { playedWords: getPlayedWords() });
});

// Logique pour révéler le mot au maintenir cliqué
let isRevealingWord = false;

function revealWord() {
    if (isRevealingWord) return;
    isRevealingWord = true;
    frontCard.classList.add('hidden');
    backCard.classList.remove('hidden');
}

function hideWord() {
    if (!isRevealingWord) return;
    isRevealingWord = false;
    frontCard.classList.remove('hidden');
    backCard.classList.add('hidden');
}

wordRevealCard.addEventListener('mousedown', revealWord);
wordRevealCard.addEventListener('touchstart', revealWord, {passive: true});
wordRevealCard.addEventListener('mouseup', hideWord);
wordRevealCard.addEventListener('mouseleave', hideWord);
wordRevealCard.addEventListener('touchend', hideWord);

btnSeenWord.addEventListener('click', () => {
    btnSeenWord.classList.add('hidden');
    waitingOthersWord.classList.remove('hidden');
    socket.emit('seen_word');
});

btnStartVoting.addEventListener('click', () => {
    socket.emit('start_voting');
});

btnPlayAgain.addEventListener('click', () => {
    socket.emit('play_again');
});

// --- FONCTIONS CLIQUE POUR HTML ---
window.confirmKick = function(playerId, playerName) {
    if (confirm(`Exclure ${playerName} ?`)) {
        socket.emit('kick_player', playerId);
    }
};

// --- EVENEMENTS SOCKET ---

socket.on('connect', () => {
    myId = socket.id;
    // Vérifier s'il y avait une partie
    socket.emit('check_reconnect', sessionId, (res) => {
        if (res.canReconnect) {
            // Auto Rejoin silencieux (ne retourne jamais à l'accueil)
            socket.emit('rejoin_game', sessionId, (rejoinRes) => {
                if (rejoinRes.success) {
                    window.history.replaceState(null, '', '/?room=' + rejoinRes.roomCode);
                } else {
                    window.history.replaceState(null, '', '/');
                    socket.emit('abandon_game', sessionId);
                }
                setTimeout(() => {
                    loadingScreen.classList.remove('active');
                    setTimeout(() => { loadingScreen.style.display = 'none'; }, 500);
                }, 500);
            });
        } else {
            setTimeout(() => {
                loadingScreen.classList.remove('active');
                setTimeout(() => { loadingScreen.style.display = 'none'; }, 500);
            }, 500);
        }
    });
});

socket.on('error_message', (msg) => {
    alert(msg);
});

socket.on('notification', (msg) => {
    const container = document.getElementById('notifications-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        if (container.contains(toast)) toast.remove();
    }, 4000);
});

socket.on('out_of_words', (theme) => {
    if (confirm(`Plus aucun mot disponible pour le thème ${theme} (ou tous les mots du jeu) !\nVoulez-vous réinitialiser l'historique des mots joués ?\n(Sinon annulez et changez de thème)`)) {
        resetPlayedWords();
        alert("Les mots ont été réinitialisés. Vous pouvez relancer !");
    }
});

socket.on('save_played_word', (word) => {
    addPlayedWord(word);
});

socket.on('update_room', (room) => {
    currentRoom = room;
    const me = room.players.find(p => p.socketId === myId);
    if (!me) return;
    
    isMyCreator = me.isCreator;

    // Mise à jour de l'écran Lobby
    if (room.state === 'lobby') {
        showScreen('lobby');
        currentRoomCode.textContent = room.id;
        btnAdminGame.classList.add('hidden');
        
        // Liste des joueurs
        playersList.innerHTML = '';
        let allReady = true;

        room.players.forEach(p => {
            const li = document.createElement('li');
            let badges = '';
            
            if (p.isCreator) badges += '<span class="badge creator">Créateur</span> ';
            if (!p.isCreator && p.isReady) badges += '<span class="badge ready">Prêt</span>';
            if (!p.isCreator && !p.isReady) badges += '<span class="badge waiting">Attente</span>';
            
            if (!p.isCreator && !p.isReady) allReady = false;

            let kickBtn = '';
            if (isMyCreator && !p.isCreator) {
                kickBtn = `<button class="btn-kick" onclick="confirmKick('${p.id}', '${p.name.replace(/'/g, "\\'")}')">&times;</button>`;
            }

            let nameStr = p.name;
            if (!p.isConnected) nameStr += " (Déconnecté)";

            li.innerHTML = `<span>${nameStr} ${p.socketId === myId ? '(Toi)' : ''}</span> <div>${badges} ${kickBtn}</div>`;
            playersList.appendChild(li);
        });

        // Paramètres
        if (isMyCreator) {
            creatorSettings.classList.remove('hidden');
            settingImposterCount.value = room.settings.imposterCount;
            settingImposterMode.value = room.settings.imposterMode;
            settingTheme.value = room.settings.theme;
            
            btnReady.classList.add('hidden');
            btnStartGame.classList.remove('hidden');
            
            if (allReady && room.players.length >= 3) {
                btnStartGame.classList.remove('secondary');
                btnStartGame.classList.add('btn-danger');
                btnStartGame.disabled = false;
            } else {
                btnStartGame.classList.add('secondary');
                btnStartGame.classList.remove('btn-danger');
                // Optionnel: griser le bouton
            }
        } else {
            creatorSettings.classList.add('hidden');
            btnReady.classList.remove('hidden');
            btnStartGame.classList.add('hidden');
            
            if (me.isReady) {
                btnReady.textContent = "Pas prêt";
                btnReady.classList.replace('primary', 'secondary');
            } else {
                btnReady.textContent = "Prêt";
                btnReady.classList.replace('secondary', 'primary');
            }
        }
    } else if (room.state === 'voting') {
        // Mise à jour écran de vote
        votePlayersList.innerHTML = '';
        room.players.forEach(p => {
            if (p.socketId === myId) return; // Ne pas se voter soi-même
            
            const li = document.createElement('li');
            let status = p.hasVoted ? '<span class="badge voted">A voté</span>' : '';
            li.innerHTML = `<span>${p.name}</span> <div>${status}</div>`;
            
            if (!me.hasVoted) {
                li.addEventListener('click', () => {
                    document.querySelectorAll('.players-vote-list li').forEach(el => el.classList.remove('selected'));
                    li.classList.add('selected');
                    
                    if(confirm(`Voter pour ${p.name} ?`)) {
                        socket.emit('vote', p.id);
                        votingWaitText.classList.remove('hidden');
                    }
                });
            }
            
            votePlayersList.appendChild(li);
        });

        if (me.hasVoted) {
            votingWaitText.classList.remove('hidden');
        } else {
            votingWaitText.classList.add('hidden');
        }
    } else if (room.state === 'results') {
        // Remplir écran résultats
        if (room.winner === 'aborted') {
            winnerText.textContent = "Partie Annulée 🛑";
            winnerText.style.color = "gray";
            eliminatedText.textContent = "Trop peu de joueurs pour continuer.";
        } else if (room.winner === 'civilians') {
            winnerText.textContent = "Victoire des Civils ! 🎉";
            winnerText.style.color = "var(--success)";
            if (room.eliminatedPlayer && room.eliminatedPlayer !== "equality") {
                const roleName = room.eliminatedPlayer.role === 'imposter' ? 'Imposteur' : 'Civil';
                eliminatedText.innerHTML = `<strong>${room.eliminatedPlayer.name}</strong> a été éliminé. Il était <strong>${roleName}</strong>.`;
            }
        } else if (room.winner === 'imposters') {
            winnerText.textContent = "Victoire des Imposteurs ! 😈";
            winnerText.style.color = "var(--danger)";
            if (room.eliminatedPlayer && room.eliminatedPlayer !== "equality") {
                const roleName = room.eliminatedPlayer.role === 'imposter' ? 'Imposteur' : 'Civil';
                eliminatedText.innerHTML = `<strong>${room.eliminatedPlayer.name}</strong> a été éliminé. Il était <strong>${roleName}</strong>.`;
            }
        } else {
            winnerText.textContent = "Égalité / Partie en cours";
            winnerText.style.color = "white";
        }

        if (room.winner !== 'aborted' && room.eliminatedPlayer === "equality") {
            eliminatedText.textContent = "Personne n'a été éliminé (Égalité des votes).";
        }

        impostersReveal.innerHTML = '<h4>Les imposteurs étaient:</h4>';
        room.players.forEach(p => {
            if (p.role === 'imposter') {
                impostersReveal.innerHTML += `<p>${p.name}</p>`;
            }
        });

        if (isMyCreator) {
            btnPlayAgain.classList.remove('hidden');
        } else {
            btnPlayAgain.classList.add('hidden');
        }
    }

    // Modal Admin Gérés partout si dans la game
    if (room.state !== 'lobby' && isMyCreator) {
        btnAdminGame.classList.remove('hidden');
        adminPlayersList.innerHTML = '';
        room.players.forEach(p => {
            const li = document.createElement('li');
            
            let nameStr = p.name;
            if (!p.isConnected) nameStr += " (Déconnecté)";

            let kickBtn = '';
            if (!p.isCreator) {
                kickBtn = `<button class="btn-kick" onclick="confirmKick('${p.id}', '${p.name.replace(/'/g, "\\'")}')">&times;</button>`;
            }

            li.innerHTML = `<span>${nameStr} ${p.socketId === myId ? '(Toi)' : ''}</span> <div>${kickBtn}</div>`;
            adminPlayersList.appendChild(li);
        });
    } else {
        btnAdminGame.classList.add('hidden');
    }
});

socket.on('pause_game', (disconnectedPlayers) => {
    const names = disconnectedPlayers.map(p => p.name).join(', ');
    pauseText.textContent = `En attente de la reconnexion de : ${names}...`;
    pauseScreen.classList.add('active');
    
    pauseKickContainer.innerHTML = '';
    
    if (isMyCreator) {
        disconnectedPlayers.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'btn secondary small';
            btn.textContent = `Exclure ${p.name}`;
            btn.onclick = () => {
                if (confirm(`Exclure définitivement ${p.name} ? (La partie continuera sans lui ou sera annulée)`)) {
                    socket.emit('kick_player', p.id);
                }
            };
            pauseKickContainer.appendChild(btn);
        });
    }
});

socket.on('resume_game', () => {
    pauseScreen.classList.remove('active');
    currentPausedPlayerId = null;
});

socket.on('kicked', () => {
    alert("Vous avez été exclu du salon.");
    window.history.replaceState(null, '', '/');
    adminModal.classList.remove('active');
    pauseScreen.classList.remove('active');
    showScreen('home');
    currentRoom = null;
    isMyCreator = false;
});

socket.on('your_role', (data) => {
    displayTheme.textContent = `Thème : ${data.theme}`;
    
    const yourRoleLabel = document.getElementById('your-role-label');
    const yourHintLabel = document.getElementById('your-hint-label');
    const yourHintText = document.getElementById('your-hint-text');

    if (data.imposterMode === 'no_word' && data.role === 'imposter') {
        yourRoleLabel.textContent = "Ton Rôle :";
        yourWordText.textContent = data.word; // "VOUS ÊTES L'IMPOSTEUR !"
        yourWordText.style.color = "var(--danger)";
        yourWordText.style.fontSize = "1.5rem"; // Plus petit pour tenir
        
        yourHintLabel.classList.remove('hidden');
        yourHintText.textContent = data.hint;
    } else {
        yourRoleLabel.textContent = "Ton Mot :";
        yourWordText.textContent = data.word;
        yourWordText.style.color = "white"; // Meme couleur pour cacher tout indice visuel
        yourWordText.style.fontSize = "2.2rem";
        
        if (yourHintLabel) yourHintLabel.classList.add('hidden');
    }
});

socket.on('game_started', () => {
    showScreen('word');
    btnSeenWord.classList.remove('hidden');
    waitingOthersWord.classList.add('hidden');
    wordRevealCard.classList.remove('hidden');
    // Réinitialiser la vue de la carte
    hideWord();
});

socket.on('phase_changed', (newPhase) => {
    showScreen(newPhase);

    if (newPhase === 'discussion') {
        if (isMyCreator) {
            btnStartVoting.classList.remove('hidden');
        } else {
            btnStartVoting.classList.add('hidden');
        }
    }
});
