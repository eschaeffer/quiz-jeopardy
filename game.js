const JeopardyGame = (() => {
    const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
    let mqttClient = null;
    let sessionId = null;
    let buzzTopic = null;
    let joinTopic = null;
    let commandTopic = null;
    let connectedPlayers = {};
    let buzzLocked = false;
    let buzzLockedPlayer = null;
    let statusTopic = null;
    let controlCommandTopic = null;
    let stateTopic = null;

    let gameState = {
        teams: [],
        currentRound: null,
        rounds: [],
        finalJeopardy: null,
        currentQuestion: null,
        timerEnabled: true,
        timerDuration: 30,
        timerInterval: null,
        timeRemaining: 0,
        usedTiles: new Set(),
        roundIndex: 0,
        finalWagers: {},
        buzzerEnabled: false,
        isDailyDouble: false,
        dailyDoubleTeamIndex: null,
        dailyDoubleWager: 0
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function init() {
        setupEventListeners();
    }

    function setupEventListeners() {
        $('#data-file').addEventListener('change', handleFileUpload);
        $('#load-sample-btn').addEventListener('click', loadSampleData);
        $('#add-team-btn').addEventListener('click', addTeam);
        $('#start-btn').addEventListener('click', startGame);
        $('#reveal-answer-btn').addEventListener('click', revealAnswer);
        $('#continue-btn').addEventListener('click', continueGame);
        $('#reveal-final-btn').addEventListener('click', revealFinalClue);
        $('#reveal-final-answer-btn').addEventListener('click', revealFinalAnswer);
        $('#final-continue-btn').addEventListener('click', showResults);
        $('#play-again-btn').addEventListener('click', resetGame);
        $('#timer-enabled').addEventListener('change', toggleTimerSetting);
        $('#buzzer-enabled').addEventListener('change', toggleBuzzerSetting);
        $('#copy-session-btn').addEventListener('click', copySessionLink);

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && $('#question-screen').classList.contains('active')) {
                e.preventDefault();
                if (gameState.timerInterval) {
                    stopTimer();
                    showScoringControls();
                }
            }
            if (e.code === 'Space' && $('#final-screen').classList.contains('active') && $('#final-clue-section').classList.contains('active') && !$('#final-scoring-section').classList.contains('active')) {
                e.preventDefault();
                if (gameState.timerInterval) {
                    stopFinalTimer();
                    showFinalScoringControls();
                }
            }
            if (e.code === 'Space' && $('#daily-double-screen').classList.contains('active') && $('#dd-question-section').classList.contains('active') && !$('#dd-scoring-section').classList.contains('active')) {
                e.preventDefault();
                if (gameState.timerInterval) {
                    stopTimer();
                    showDailyDoubleScoringControls();
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-team')) {
                removeTeam(e.target.closest('.team-input'));
            }
            if (e.target.classList.contains('remove-player')) {
                removePlayer(e.target.dataset.playerId);
            }
        });
    }

    function toggleTimerSetting(e) {
        $('.timer-setting').style.display = e.target.checked ? 'flex' : 'none';
    }

    function toggleBuzzerSetting(e) {
        const buzzerSetup = $('#buzzer-setup');
        if (e.target.checked) {
            buzzerSetup.classList.remove('hidden');
            initMQTT();
        } else {
            buzzerSetup.classList.add('hidden');
            gameState.buzzerEnabled = false;
            if (mqttClient) {
                mqttClient.end();
                mqttClient = null;
            }
        }
    }

    function generateSessionId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function initMQTT() {
        sessionId = generateSessionId();
        buzzTopic = `jeopardy/buzz/${sessionId}`;
        joinTopic = `jeopardy/join/${sessionId}`;
        commandTopic = `jeopardy/command/${sessionId}`;
        statusTopic = `jeopardy/status/${sessionId}/#`;
        stateTopic = `jeopardy/state/${sessionId}`;
        controlCommandTopic = `jeopardy/control-cmd/${sessionId}`;
        connectedPlayers = {};
        buzzLocked = false;
        buzzLockedPlayer = null;
        gameState.buzzerEnabled = true;

        $('#session-code').textContent = sessionId;
        updatePlayersList();
        generateQRCode();

        mqttClient = mqtt.connect(MQTT_BROKER, {
            clientId: `jeopardy-teacher-${Date.now()}`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 2000
        });

        mqttClient.on('connect', () => {
            mqttClient.subscribe(buzzTopic, { qos: 1 });
            mqttClient.subscribe(joinTopic, { qos: 1 });
            mqttClient.subscribe(statusTopic, { qos: 1 });
            mqttClient.subscribe(controlCommandTopic, { qos: 1 });
        });

        mqttClient.on('message', (topic, message) => {
            const data = JSON.parse(message.toString());
            if (topic === joinTopic) {
                connectedPlayers[data.playerId] = {
                    playerName: data.playerName,
                    playerId: data.playerId,
                    joinedAt: data.timestamp,
                    status: 'connected'
                };
                updatePlayersList();
            } else if (topic === buzzTopic) {
                handleBuzz(data);
            } else if (topic.startsWith(`jeopardy/status/${sessionId}/`)) {
                handlePlayerStatus(data);
            } else if (topic === controlCommandTopic) {
                handleControlCommand(data);
            }
        });
    }

    function handlePlayerStatus(data) {
        if (!connectedPlayers[data.playerId]) return;
        connectedPlayers[data.playerId].status = data.status;
        updatePlayersList();
    }

    function broadcastState() {
        if (!mqttClient || !mqttClient.connected || !stateTopic) return;
        const usedTilesArray = Array.from(gameState.usedTiles);
        mqttClient.publish(stateTopic, JSON.stringify({
            type: 'STATE_UPDATE',
            state: {
                phase: getGamePhase(),
                teams: gameState.teams.map(t => ({ name: t.name, score: t.score })),
                currentRound: gameState.currentRound ? { name: gameState.currentRound.name } : null,
                roundIndex: gameState.roundIndex,
                rounds: gameState.rounds,
                currentQuestion: gameState.currentQuestion,
                usedTiles: usedTilesArray,
                timerRemaining: gameState.timeRemaining,
                timerDuration: gameState.timerDuration,
                timerRunning: !!gameState.timerInterval,
                answerRevealed: !$('#answer-container').classList.contains('hidden'),
                scoringVisible: !$('#scoring-section').classList.contains('hidden'),
                buzzLocked: buzzLocked,
                buzzLockedPlayer: buzzLockedPlayer,
                finalWagers: gameState.finalWagers,
                finalWagerPhase: !$('#final-wager-section').classList.contains('hidden') && $('#final-wager-section').style.display !== 'none',
                finalClueRevealed: !$('#final-clue-section').classList.contains('hidden'),
                finalAnswerRevealed: !$('#final-answer-container').classList.contains('hidden'),
                finalScoringVisible: !$('#final-scoring-section').classList.contains('hidden'),
                isDailyDouble: gameState.isDailyDouble,
                ddTeamSelection: !$('#dd-team-selection').classList.contains('hidden'),
                ddWagerPhase: !$('#dd-wager-section').classList.contains('hidden'),
                ddQuestionSection: !$('#dd-question-section').classList.contains('hidden'),
                ddScoringVisible: !$('#dd-scoring-section').classList.contains('hidden'),
                ddAnswerRevealed: !$('#dd-answer-container').classList.contains('hidden'),
                ddTeamIndex: gameState.dailyDoubleTeamIndex,
                ddWager: gameState.dailyDoubleWager,
                winner: $('#winner-announcement')?.textContent || '',
                finalScores: gameState.teams.map((t, i, arr) => {
                    const maxScore = Math.max(...arr.map(x => x.score));
                    return { name: t.name, score: t.score, isWinner: t.score === maxScore && maxScore > 0 };
                })
            }
        }), { qos: 1, retain: true });
    }

    function getGamePhase() {
        if ($('#setup-screen').classList.contains('active')) return 'setup';
        if ($('#board-screen').classList.contains('active')) return 'board';
        if ($('#question-screen').classList.contains('active')) return 'question';
        if ($('#daily-double-screen').classList.contains('active')) return 'question';
        if ($('#final-screen').classList.contains('active')) return 'final';
        if ($('#results-screen').classList.contains('active')) return 'results';
        return 'setup';
    }

    function handleControlCommand(data) {
        switch (data.type) {
            case 'CONTROL_CONNECT':
                broadcastState();
                break;
            case 'SELECT_QUESTION':
                if (gameState.currentRound && $('#board-screen').classList.contains('active')) {
                    const tile = $(`.tile[data-id="${data.tileId}"]`);
                    if (tile && !tile.classList.contains('used')) {
                        SoundEffects.tileSelection();
                        selectQuestion(data.catIndex, data.qIndex, data.tileId);
                    }
                }
                break;
            case 'REVEAL_ANSWER':
                if ($('#question-screen').classList.contains('active')) {
                    revealAnswer();
                } else if ($('#final-screen').classList.contains('active')) {
                    revealFinalAnswer();
                }
                break;
            case 'PAUSE_TIMER':
                if ($('#question-screen').classList.contains('active') && gameState.timerInterval) {
                    stopTimer();
                    showScoringControls();
                } else if ($('#final-screen').classList.contains('active') && gameState.timerInterval) {
                    stopFinalTimer();
                    showFinalScoringControls();
                }
                break;
            case 'CONTINUE':
                if ($('#question-screen').classList.contains('active')) {
                    continueGame();
                } else if ($('#final-screen').classList.contains('active')) {
                    showResults();
                }
                break;
            case 'SCORE_TEAM':
                if (data.isFinal) {
                    scoreFinalTeam(data.teamIndex, data.isCorrect);
                } else if (gameState.isDailyDouble) {
                    scoreDailyDouble(data.isCorrect);
                } else {
                    scoreTeam(data.teamIndex, data.isCorrect);
                }
                break;
            case 'DD_SELECT_TEAM':
                if (gameState.isDailyDouble) {
                    selectDailyDoubleTeam(data.teamIndex);
                }
                break;
            case 'DD_CONFIRM_WAGER':
                if (gameState.isDailyDouble) {
                    confirmDailyDoubleWager();
                }
                break;
            case 'DD_REVEAL_ANSWER':
                if (gameState.isDailyDouble) {
                    revealDailyDoubleAnswer();
                }
                break;
            case 'DD_CONTINUE':
                if (gameState.isDailyDouble) {
                    continueFromDailyDouble();
                }
                break;
            case 'PLAY_AGAIN':
                resetGame();
                break;
        }
    }

    function updatePlayersList() {
        const list = $('#players-list');
        const players = Object.values(connectedPlayers);
        if (players.length === 0) {
            list.innerHTML = '<li class="no-players">No players connected yet</li>';
        } else {
            list.innerHTML = players.map(p => {
                const statusClass = p.status === 'connected' ? 'player-online' : 'player-offline';
                const statusLabel = p.status === 'connected' ? '' : ' (disconnected)';
                return `<li class="${statusClass}"><span class="player-status-dot"></span><span class="player-name-text">${p.playerName}${statusLabel}</span><button class="remove-player" data-player-id="${p.playerId}" title="Remove player">&times;</button></li>`;
            }).join('');
        }
    }

    function removePlayer(playerId) {
        if (!connectedPlayers[playerId]) return;
        const player = connectedPlayers[playerId];
        if (mqttClient && mqttClient.connected) {
            mqttClient.publish(commandTopic, JSON.stringify({
                type: 'KICKED',
                playerId,
                playerName: player.playerName,
                timestamp: Date.now()
            }), { qos: 1 });
            mqttClient.publish(`jeopardy/status/${sessionId}/${playerId}`, JSON.stringify({
                playerId,
                playerName: player.playerName,
                status: 'disconnected',
                timestamp: Date.now()
            }), { qos: 1, retain: true });
        }
        delete connectedPlayers[playerId];
        updatePlayersList();
    }

    function copySessionLink() {
        const url = `${window.location.origin}${window.location.pathname.replace('index.html', '')}buzzer.html?session=${sessionId}`;
        navigator.clipboard.writeText(url).then(() => {
            const btn = $('#copy-session-btn');
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
        });
    }

    function generateQRCode() {
        const container = $('#qr-container');
        container.innerHTML = '';
        const url = `${window.location.origin}${window.location.pathname.replace('index.html', '')}buzzer.html?session=${sessionId}`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(container, {
                text: url,
                width: 180,
                height: 180,
                colorDark: '#000555',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
            $('#qr-section').classList.remove('hidden');
            $('#buzzer-qr-link').href = url;
        }

        const controlContainer = $('#control-qr-container');
        controlContainer.innerHTML = '';
        const controlUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}control.html?session=${sessionId}`;
        if (typeof QRCode !== 'undefined') {
            new QRCode(controlContainer, {
                text: controlUrl,
                width: 180,
                height: 180,
                colorDark: '#000555',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
            $('#control-qr-section').classList.remove('hidden');
            $('#control-qr-link').href = controlUrl;
        }
    }

    function openQuestionForBuzzers() {
        if (!gameState.buzzerEnabled || !mqttClient || !mqttClient.connected) return;
        buzzLocked = false;
        buzzLockedPlayer = null;
        $('#buzz-indicator').classList.add('hidden');
        mqttClient.publish(commandTopic, JSON.stringify({
            type: 'QUESTION_OPEN',
            timestamp: Date.now()
        }), { qos: 1 });

        const halfTime = Math.ceil(gameState.timerDuration / 2) * 1000;
        setTimeout(() => {
            if (gameState.buzzerEnabled && mqttClient && mqttClient.connected) {
                mqttClient.publish(commandTopic, JSON.stringify({
                    type: 'BUZZERS_ENABLE',
                    timestamp: Date.now()
                }), { qos: 1 });
            }
        }, halfTime);
    }

    function closeQuestionForBuzzers() {
        if (!gameState.buzzerEnabled || !mqttClient || !mqttClient.connected) return;
        mqttClient.publish(commandTopic, JSON.stringify({
            type: 'QUESTION_CLOSE',
            timestamp: Date.now()
        }), { qos: 1 });
    }

    function handleBuzz(data) {
        if (buzzLocked || !gameState.currentQuestion) return;

        buzzLocked = true;
        buzzLockedPlayer = data;
        stopTimer();
        SoundEffects.buzzInConfirmation();

        mqttClient.publish(commandTopic, JSON.stringify({
            type: 'BUZZ_LOCKED',
            playerId: data.playerId,
            playerName: data.playerName,
            timestamp: Date.now()
        }), { qos: 1 });

        if ($('#question-screen').classList.contains('active')) {
            $('#buzz-indicator').classList.remove('hidden');
            $('#buzz-text').textContent = `${data.playerName} buzzed in!`;
        }
    }

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        $('#file-name').textContent = file.name;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                validateAndStoreData(data);
            } catch (err) {
                alert('Invalid JSON file. Please check the format.');
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    function validateAndStoreData(data) {
        if (!data.rounds || !Array.isArray(data.rounds)) {
            alert('Invalid data: missing "rounds" array');
            return;
        }

        for (const round of data.rounds) {
            if (!round.name || !round.categories || !Array.isArray(round.categories)) {
                alert('Invalid round data: each round needs "name" and "categories"');
                return;
            }
            for (const cat of round.categories) {
                if (!cat.name || !cat.questions || !Array.isArray(cat.questions)) {
                    alert('Invalid category: needs "name" and "questions"');
                    return;
                }
                for (const q of cat.questions) {
                    if (!q.value || !q.question || !q.answer) {
                        alert('Invalid question: needs "value", "question", and "answer"');
                        return;
                    }
                }
            }
        }

        gameState.rounds = data.rounds;
        gameState.finalJeopardy = data.finalJeopardy || null;
        checkReadyToStart();
    }

    function loadSampleData() {
        const sampleData = {
            rounds: [
                {
                    name: "JEOPARDY!",
                    categories: [
                        {
                            name: "Math",
                            questions: [
                                { value: 200, question: "What is 15% of 200?", answer: "30" },
                                { value: 400, question: "What is the square root of 144?", answer: "12" },
                                { value: 600, question: "What is the area of a circle with radius 5? (use pi)", answer: "25pi or 78.54", isDailyDouble: true },
                                { value: 800, question: "What is the sum of interior angles in a hexagon?", answer: "720 degrees" },
                                { value: 1000, question: "What is the derivative of x cubed plus 2x?", answer: "3x squared plus 2" }
                            ]
                        },
                        {
                            name: "Science",
                            questions: [
                                { value: 200, question: "What planet is known as the Red Planet?", answer: "Mars" },
                                { value: 400, question: "What is the chemical symbol for gold?", answer: "Au" },
                                { value: 600, question: "What gas do plants absorb from the atmosphere?", answer: "Carbon dioxide (CO2)" },
                                { value: 800, question: "What is the powerhouse of the cell?", answer: "Mitochondria" },
                                { value: 1000, question: "What is the speed of light in a vacuum (approximate)?", answer: "300,000 km/s or 3x10^8 m/s" }
                            ]
                        },
                        {
                            name: "History",
                            questions: [
                                { value: 200, question: "In what year did World War II end?", answer: "1945" },
                                { value: 400, question: "Who was the first President of the United States?", answer: "George Washington" },
                                { value: 600, question: "What ancient civilization built Machu Picchu?", answer: "The Inca" },
                                { value: 800, question: "What year did the Berlin Wall fall?", answer: "1989" },
                                { value: 1000, question: "Who delivered the 'I Have a Dream' speech?", answer: "Martin Luther King Jr." }
                            ]
                        },
                        {
                            name: "Geography",
                            questions: [
                                { value: 200, question: "What is the largest continent by area?", answer: "Asia" },
                                { value: 400, question: "What is the capital of Australia?", answer: "Canberra" },
                                { value: 600, question: "What river flows through Egypt?", answer: "The Nile" },
                                { value: 800, question: "What is the smallest country in the world?", answer: "Vatican City" },
                                { value: 1000, question: "What mountain range separates Europe from Asia?", answer: "The Ural Mountains" }
                            ]
                        },
                        {
                            name: "Literature",
                            questions: [
                                { value: 200, question: "Who wrote 'Romeo and Juliet'?", answer: "William Shakespeare" },
                                { value: 400, question: "What novel begins with 'Call me Ishmael'?", answer: "Moby-Dick" },
                                { value: 600, question: "Who wrote '1984'?", answer: "George Orwell" },
                                { value: 800, question: "What is the first book in the Harry Potter series?", answer: "Harry Potter and the Sorcerer's Stone" },
                                { value: 1000, question: "Who wrote 'Pride and Prejudice'?", answer: "Jane Austen" }
                            ]
                        }
                    ]
                },
                {
                    name: "DOUBLE JEOPARDY!",
                    categories: [
                        {
                            name: "Advanced Math",
                            questions: [
                                { value: 400, question: "What is the integral of 2x?", answer: "x squared plus C" },
                                { value: 800, question: "What is the value of log base 10 of 1000?", answer: "3" },
                                { value: 1200, question: "What is 6 factorial?", answer: "720", isDailyDouble: true },
                                { value: 1600, question: "What is the Pythagorean theorem?", answer: "a squared plus b squared equals c squared" },
                                { value: 2000, question: "What is the limit of sin(x)/x as x approaches 0?", answer: "1" }
                            ]
                        },
                        {
                            name: "World Capitals",
                            questions: [
                                { value: 400, question: "What is the capital of Brazil?", answer: "Brasilia" },
                                { value: 800, question: "What is the capital of Japan?", answer: "Tokyo" },
                                { value: 1200, question: "What is the administrative capital of South Africa?", answer: "Pretoria" },
                                { value: 1600, question: "What is the capital of New Zealand?", answer: "Wellington" },
                                { value: 2000, question: "What is the capital of Myanmar?", answer: "Naypyidaw" }
                            ]
                        },
                        {
                            name: "Famous Scientists",
                            questions: [
                                { value: 400, question: "Who developed the theory of relativity?", answer: "Albert Einstein" },
                                { value: 800, question: "Who discovered penicillin?", answer: "Alexander Fleming" },
                                { value: 1200, question: "Who is known as the father of classical physics?", answer: "Isaac Newton" },
                                { value: 1600, question: "Who won two Nobel Prizes for work on radioactivity?", answer: "Marie Curie", isDailyDouble: true },
                                { value: 2000, question: "Who proposed the heliocentric model of the solar system?", answer: "Nicolaus Copernicus" }
                            ]
                        },
                        {
                            name: "Inventions",
                            questions: [
                                { value: 400, question: "Who is credited with inventing the telephone?", answer: "Alexander Graham Bell" },
                                { value: 800, question: "Who invented the practical light bulb?", answer: "Thomas Edison" },
                                { value: 1200, question: "Who invented the World Wide Web?", answer: "Tim Berners-Lee" },
                                { value: 1600, question: "Who invented the printing press in Europe?", answer: "Johannes Gutenberg" },
                                { value: 2000, question: "Who built the first successful powered airplane?", answer: "The Wright Brothers" }
                            ]
                        },
                        {
                            name: "Mixed Bag",
                            questions: [
                                { value: 400, question: "What is the hardest natural substance on Earth?", answer: "Diamond" },
                                { value: 800, question: "How many bones are in the adult human body?", answer: "206" },
                                { value: 1200, question: "What language has the most native speakers?", answer: "Mandarin Chinese" },
                                { value: 1600, question: "What element has the atomic number 1?", answer: "Hydrogen" },
                                { value: 2000, question: "What year was the first iPhone released?", answer: "2007" }
                            ]
                        }
                    ]
                }
            ],
            finalJeopardy: {
                category: "Famous Equations",
                clue: "This famous equation, E=mc squared, was introduced in a 1905 paper by this physicist.",
                answer: "Albert Einstein (Theory of Special Relativity)"
            }
        };

        validateAndStoreData(sampleData);
        $('#file-name').textContent = 'Sample Data Loaded';
    }

    function addTeam() {
        const container = $('#teams-container');
        const teamNum = container.children.length + 1;
        const div = document.createElement('div');
        div.className = 'team-input';
        div.innerHTML = `
            <input type="text" class="team-name" value="Team ${teamNum}" placeholder="Team name">
            <button class="remove-team">&times;</button>
        `;
        container.appendChild(div);
        updateRemoveButtons();
        checkReadyToStart();
    }

    function removeTeam(element) {
        element.remove();
        updateRemoveButtons();
        checkReadyToStart();
    }

    function updateRemoveButtons() {
        const teams = $$('.team-input');
        teams.forEach((team) => {
            team.querySelector('.remove-team').disabled = teams.length <= 2;
        });
    }

    function checkReadyToStart() {
        const hasData = gameState.rounds.length > 0;
        const hasTeams = $$('.team-name').length >= 2;
        $('#start-btn').disabled = !(hasData && hasTeams);
    }

    function startGame() {
        const teamInputs = $$('.team-name');
        gameState.teams = Array.from(teamInputs).map(input => ({
            name: input.value || 'Unnamed Team',
            score: 0
        }));

        gameState.timerEnabled = $('#timer-enabled').checked;
        gameState.timerDuration = parseInt($('#timer-duration').value) || 30;
        gameState.roundIndex = 0;
        gameState.usedTiles = new Set();
        gameState.finalWagers = {};

        showScreen('board-screen');
        loadRound();
        broadcastState();
    }

    function loadRound() {
        if (gameState.roundIndex >= gameState.rounds.length) {
            if (gameState.finalJeopardy) {
                startFinalJeopardy();
            } else {
                showResults();
            }
            return;
        }

        gameState.currentRound = gameState.rounds[gameState.roundIndex];
        $('#round-title').textContent = gameState.currentRound.name;
        renderScores();
        renderBoard();
        showScreen('board-screen');
        broadcastState();
    }

    function renderScores() {
        const bar = $('#scores-bar');
        bar.innerHTML = gameState.teams.map((team) => `
            <div class="score-display">
                <div class="team-name">${team.name}</div>
                <div class="score-value">$${team.score.toLocaleString()}</div>
            </div>
        `).join('');
    }

    function renderBoard() {
        const board = $('#game-board');
        const round = gameState.currentRound;
        const numCategories = round.categories.length;
        const numQuestions = Math.max(...round.categories.map(c => c.questions.length));

        board.style.gridTemplateColumns = `repeat(${numCategories}, 1fr)`;

        let html = '';

        for (const cat of round.categories) {
            html += `<div class="category-header">${cat.name}</div>`;
        }

        for (let q = 0; q < numQuestions; q++) {
            for (let c = 0; c < numCategories; c++) {
                const cat = round.categories[c];
                if (q < cat.questions.length) {
                    const tileId = `${gameState.roundIndex}-${c}-${q}`;
                    const isUsed = gameState.usedTiles.has(tileId);
                    const question = cat.questions[q];
                    html += `<div class="tile ${isUsed ? 'used' : ''}" data-id="${tileId}" data-cat="${c}" data-q="${q}">${isUsed ? '' : `$${question.value}`}</div>`;
                } else {
                    html += `<div class="tile used"></div>`;
                }
            }
        }

        board.innerHTML = html;

        board.addEventListener('click', (e) => {
            const tile = e.target.closest('.tile');
            if (!tile || tile.classList.contains('used')) return;

            const catIndex = parseInt(tile.dataset.cat);
            const qIndex = parseInt(tile.dataset.q);
            SoundEffects.tileSelection();
            selectQuestion(catIndex, qIndex, tile.dataset.id);
        });
    }

    function selectQuestion(catIndex, qIndex, tileId) {
        const round = gameState.currentRound;
        const category = round.categories[catIndex];
        const question = category.questions[qIndex];

        gameState.currentQuestion = {
            category: category.name,
            value: question.value,
            question: question.question,
            answer: question.answer,
            tileId: tileId,
            isDailyDouble: question.isDailyDouble || false
        };

        if (question.isDailyDouble) {
            showDailyDoubleScreen();
        } else {
            showQuestionScreen();
        }
    }

    function getDailyDoubleMinWager() {
        return gameState.roundIndex === 0 ? 5 : 100;
    }

    function getDailyDoubleMaxWager(teamIndex) {
        const team = gameState.teams[teamIndex];
        const minWager = getDailyDoubleMinWager();
        if (team.score < minWager) {
            return Math.max(...gameState.currentRound.categories.flatMap(c => c.questions.map(q => q.value)));
        }
        return team.score;
    }

    function showDailyDoubleScreen() {
        gameState.isDailyDouble = true;
        gameState.dailyDoubleTeamIndex = null;
        gameState.dailyDoubleWager = 0;

        closeQuestionForBuzzers();

        const teamButtonsContainer = $('#dd-team-buttons');
        teamButtonsContainer.innerHTML = gameState.teams.map((team, i) => `
            <button class="dd-team-select-btn" onclick="JeopardyGame.selectDailyDoubleTeam(${i})">${team.name} ($${team.score.toLocaleString()})</button>
        `).join('');

        $('#dd-team-name').textContent = '';
        $('#dd-team-score').textContent = '';
        $('#dd-wager-section').classList.add('hidden');
        $('#dd-question-section').classList.add('hidden');
        $('#dd-team-selection').classList.remove('hidden');

        showScreen('daily-double-screen');
        SoundEffects.dailyDouble();
        broadcastState();
    }

    function selectDailyDoubleTeam(teamIndex) {
        gameState.dailyDoubleTeamIndex = teamIndex;
        const team = gameState.teams[teamIndex];
        const minWager = getDailyDoubleMinWager();
        const maxWager = getDailyDoubleMaxWager(teamIndex);

        $('#dd-team-selection').classList.add('hidden');
        $('#dd-team-name').textContent = team.name;
        $('#dd-team-score').textContent = `$${team.score.toLocaleString()}`;

        const wagerSlider = $('#dd-wager-slider');
        const wagerDisplay = $('#dd-wager-display');
        wagerSlider.min = minWager;
        wagerSlider.max = maxWager;
        wagerSlider.step = minWager;
        wagerSlider.value = Math.min(team.score, maxWager);
        wagerDisplay.textContent = `$${parseInt(wagerSlider.value).toLocaleString()}`;

        wagerSlider.removeEventListener('input', updateDailyDoubleWager);
        wagerSlider.addEventListener('input', updateDailyDoubleWager);

        $('#dd-wager-section').classList.remove('hidden');
        $('#dd-question-section').classList.add('hidden');
        broadcastState();
    }

    function updateDailyDoubleWager() {
        const wager = parseInt($('#dd-wager-slider').value);
        $('#dd-wager-display').textContent = `$${wager.toLocaleString()}`;
    }

    function confirmDailyDoubleWager() {
        gameState.dailyDoubleWager = parseInt($('#dd-wager-slider').value);
        $('#dd-wager-section').classList.add('hidden');
        $('#dd-question-section').classList.remove('hidden');

        const team = gameState.teams[gameState.dailyDoubleTeamIndex];
        $('#dd-wagering-team').textContent = `${team.name} is wagering $${gameState.dailyDoubleWager.toLocaleString()}`;

        showDailyDoubleQuestion();
        broadcastState();
    }

    function showDailyDoubleQuestion() {
        const q = gameState.currentQuestion;
        $('#dd-question-category').textContent = q.category;
        $('#dd-question-value').textContent = `$${q.value}`;
        $('#dd-question-text').textContent = q.question;
        $('#dd-answer-text').textContent = `Answer: ${q.answer}`;
        $('#dd-answer-container').classList.add('hidden');
        $('#dd-scoring-section').classList.add('hidden');
        $('#dd-reveal-answer-btn').classList.remove('hidden');
        $('#dd-continue-btn').classList.add('hidden');

        if (gameState.timerEnabled) {
            $('#dd-timer-display').classList.remove('hidden');
            startTimer();
        } else {
            $('#dd-timer-display').classList.add('hidden');
        }
    }

    function showDailyDoubleScoringControls() {
        stopTimer();
        SoundEffects.timerExpiry();
        $('#dd-scoring-section').classList.remove('hidden');
        $('#dd-answer-container').classList.add('hidden');
        $('#dd-reveal-answer-btn').classList.remove('hidden');
        $('#dd-continue-btn').classList.remove('hidden');

        const team = gameState.teams[gameState.dailyDoubleTeamIndex];
        const container = $('#dd-team-scoring');
        container.innerHTML = `
            <div class="team-score-btn">
                <div class="name">${team.name}</div>
                <div>Wagered: $${gameState.dailyDoubleWager.toLocaleString()}</div>
                <div class="buttons">
                    <button class="score-correct" onclick="JeopardyGame.scoreDailyDouble(true)">Correct</button>
                    <button class="score-wrong" onclick="JeopardyGame.scoreDailyDouble(false)">Wrong</button>
                </div>
            </div>
        `;
    }

    function revealDailyDoubleAnswer() {
        stopTimer();
        closeQuestionForBuzzers();
        $('#dd-scoring-section').classList.remove('hidden');
        $('#dd-answer-container').classList.remove('hidden');
        $('#dd-reveal-answer-btn').classList.add('hidden');
        $('#dd-continue-btn').classList.remove('hidden');

        const team = gameState.teams[gameState.dailyDoubleTeamIndex];
        const container = $('#dd-team-scoring');
        container.innerHTML = `
            <div class="team-score-btn">
                <div class="name">${team.name}</div>
                <div>Wagered: $${gameState.dailyDoubleWager.toLocaleString()}</div>
                <div class="buttons">
                    <button class="score-correct" onclick="JeopardyGame.scoreDailyDouble(true)">Correct</button>
                    <button class="score-wrong" onclick="JeopardyGame.scoreDailyDouble(false)">Wrong</button>
                </div>
            </div>
        `;
        broadcastState();
    }

    function scoreDailyDouble(isCorrect) {
        const team = gameState.teams[gameState.dailyDoubleTeamIndex];
        const wager = gameState.dailyDoubleWager;

        if (isCorrect) {
            team.score += wager;
            SoundEffects.correctAnswer();
        } else {
            team.score -= wager;
            SoundEffects.incorrectAnswer();
        }

        renderScores();

        const btnContainer = $('#dd-team-scoring .team-score-btn');
        const correctBtn = btnContainer.querySelector('.score-correct');
        const wrongBtn = btnContainer.querySelector('.score-wrong');

        correctBtn.classList.toggle('selected', isCorrect);
        wrongBtn.classList.toggle('selected', !isCorrect);
    }

    function continueFromDailyDouble() {
        stopTimer();
        closeQuestionForBuzzers();
        gameState.usedTiles.add(gameState.currentQuestion.tileId);
        gameState.isDailyDouble = false;
        gameState.dailyDoubleTeamIndex = null;
        gameState.dailyDoubleWager = 0;
        renderBoard();
        showScreen('board-screen');
        broadcastState();

        const allUsed = gameState.currentRound.categories.every((cat, c) =>
            cat.questions.every((_, q) => gameState.usedTiles.has(`${gameState.roundIndex}-${c}-${q}`))
        );

        if (allUsed) {
            gameState.roundIndex++;
            SoundEffects.roundTransition();
            setTimeout(() => loadRound(), 500);
        }
    }

    function showQuestionScreen() {
        const q = gameState.currentQuestion;
        $('#question-category').textContent = q.category;
        $('#question-value').textContent = `$${q.value}`;
        $('#question-text').textContent = q.question;
        $('#answer-text').textContent = `Answer: ${q.answer}`;
        $('#answer-container').classList.add('hidden');
        $('#scoring-section').classList.add('hidden');
        $('#reveal-answer-btn').classList.remove('hidden');
        $('#continue-btn').classList.add('hidden');
        $('#buzz-indicator').classList.add('hidden');

        renderTeamScoring();

        if (gameState.timerEnabled) {
            $('#timer-display').classList.remove('hidden');
            startTimer();
        } else {
            $('#timer-display').classList.add('hidden');
        }

        openQuestionForBuzzers();

        showScreen('question-screen');
        broadcastState();
    }

    function renderTeamScoring() {
        const container = $('#team-scoring');
        container.innerHTML = gameState.teams.map((team, i) => `
            <div class="team-score-btn" data-team="${i}">
                <div class="name">${team.name}</div>
                <div class="buttons">
                    <button class="score-correct" onclick="JeopardyGame.scoreTeam(${i}, true)">Correct</button>
                    <button class="score-wrong" onclick="JeopardyGame.scoreTeam(${i}, false)">Wrong</button>
                </div>
            </div>
        `).join('');
    }

    function showScoringControls() {
        stopTimer();
        closeQuestionForBuzzers();
        $('#scoring-section').classList.remove('hidden');
        $('#answer-container').classList.add('hidden');
        $('#reveal-answer-btn').classList.remove('hidden');
        $('#continue-btn').classList.add('hidden');
        broadcastState();
    }

    function revealAnswer() {
        stopTimer();
        closeQuestionForBuzzers();
        $('#scoring-section').classList.remove('hidden');
        $('#answer-container').classList.remove('hidden');
        $('#reveal-answer-btn').classList.add('hidden');
        $('#continue-btn').classList.remove('hidden');
        broadcastState();
    }

    function scoreTeam(teamIndex, isCorrect) {
        const team = gameState.teams[teamIndex];
        const value = gameState.currentQuestion.value;

        if (isCorrect) {
            team.score += value;
            SoundEffects.correctAnswer();
        } else {
            team.score -= value;
            SoundEffects.incorrectAnswer();
        }

        renderScores();

        const btnContainer = $(`.team-score-btn[data-team="${teamIndex}"]`);
        const correctBtn = btnContainer.querySelector('.score-correct');
        const wrongBtn = btnContainer.querySelector('.score-wrong');

        correctBtn.classList.toggle('selected', isCorrect);
        wrongBtn.classList.toggle('selected', !isCorrect);
        broadcastState();
    }

    function continueGame() {
        stopTimer();
        closeQuestionForBuzzers();
        gameState.usedTiles.add(gameState.currentQuestion.tileId);
        renderBoard();
        showScreen('board-screen');
        broadcastState();

        const allUsed = gameState.currentRound.categories.every((cat, c) =>
            cat.questions.every((_, q) => gameState.usedTiles.has(`${gameState.roundIndex}-${c}-${q}`))
        );

        if (allUsed) {
            gameState.roundIndex++;
            SoundEffects.roundTransition();
            setTimeout(() => loadRound(), 500);
        }
    }

    function startFinalJeopardy() {
        if (!gameState.finalJeopardy) {
            showResults();
            return;
        }

        $('#final-category').textContent = gameState.finalJeopardy.category;
        $('#final-clue').textContent = gameState.finalJeopardy.clue;
        $('#final-answer').textContent = `Answer: ${gameState.finalJeopardy.answer}`;

        const wagersContainer = $('#final-wagers');
        wagersContainer.innerHTML = gameState.teams.map((team, i) => `
            <div class="wager-input">
                <label>${team.name} ($${team.score.toLocaleString()})</label>
                <input type="number" id="wager-${i}" min="0" max="${team.score}" value="0">
            </div>
        `).join('');

        $('#final-wager-section').classList.remove('hidden');
        $('#final-clue-section').classList.add('hidden');
        $('#final-scoring-section').classList.add('hidden');
        $('#final-answer-container').classList.add('hidden');
        $('#reveal-final-btn').classList.remove('hidden');
        $('#reveal-final-answer-btn').classList.add('hidden');
        $('#final-continue-btn').classList.add('hidden');

        if (gameState.timerEnabled) {
            $('#final-timer-display').classList.remove('hidden');
        } else {
            $('#final-timer-display').classList.add('hidden');
        }

        showScreen('final-screen');
    }

    function revealFinalClue() {
        gameState.teams.forEach((team, i) => {
            const wagerInput = $(`#wager-${i}`);
            let wager = parseInt(wagerInput.value) || 0;
            wager = Math.max(0, Math.min(wager, team.score));
            gameState.finalWagers[i] = wager;
        });

        $('#final-wager-section').classList.add('hidden');
        $('#final-clue-section').classList.remove('hidden');
        $('#final-scoring-section').classList.add('hidden');
        $('#final-answer-container').classList.add('hidden');
        $('#reveal-final-answer-btn').classList.add('hidden');
        $('#final-continue-btn').classList.add('hidden');

        if (gameState.timerEnabled) {
            startFinalTimer();
        }
    }

    function showFinalScoringControls() {
        stopFinalTimer();
        $('#final-scoring-section').classList.remove('hidden');
        $('#final-answer-container').classList.add('hidden');
        $('#reveal-final-answer-btn').classList.remove('hidden');
        $('#final-continue-btn').classList.add('hidden');

        const container = $('#final-team-scoring');
        container.innerHTML = gameState.teams.map((team, i) => `
            <div class="team-score-btn" data-team="${i}">
                <div class="name">${team.name}</div>
                <div>Wagered: $${(gameState.finalWagers[i] || 0).toLocaleString()}</div>
                <div class="buttons">
                    <button class="score-correct" onclick="JeopardyGame.scoreFinalTeam(${i}, true)">Correct</button>
                    <button class="score-wrong" onclick="JeopardyGame.scoreFinalTeam(${i}, false)">Wrong</button>
                </div>
            </div>
        `).join('');
    }

    function revealFinalAnswer() {
        stopFinalTimer();
        $('#final-scoring-section').classList.remove('hidden');
        $('#final-answer-container').classList.remove('hidden');
        $('#reveal-final-answer-btn').classList.add('hidden');
        $('#final-continue-btn').classList.remove('hidden');

        const container = $('#final-team-scoring');
        container.innerHTML = gameState.teams.map((team, i) => `
            <div class="team-score-btn" data-team="${i}">
                <div class="name">${team.name}</div>
                <div>Wagered: $${(gameState.finalWagers[i] || 0).toLocaleString()}</div>
                <div class="buttons">
                    <button class="score-correct" onclick="JeopardyGame.scoreFinalTeam(${i}, true)">Correct</button>
                    <button class="score-wrong" onclick="JeopardyGame.scoreFinalTeam(${i}, false)">Wrong</button>
                </div>
            </div>
        `).join('');
    }

    function scoreFinalTeam(teamIndex, isCorrect) {
        const team = gameState.teams[teamIndex];
        const wager = gameState.finalWagers[teamIndex] || 0;

        if (isCorrect) {
            team.score += wager;
            SoundEffects.correctAnswer();
        } else {
            team.score -= wager;
            SoundEffects.incorrectAnswer();
        }

        renderScores();

        const btnContainer = $(`.team-score-btn[data-team="${teamIndex}"]`);
        const correctBtn = btnContainer.querySelector('.score-correct');
        const wrongBtn = btnContainer.querySelector('.score-wrong');

        correctBtn.classList.toggle('selected', isCorrect);
        wrongBtn.classList.toggle('selected', !isCorrect);
    }

    function showResults() {
        const sorted = [...gameState.teams].sort((a, b) => b.score - a.score);
        const maxScore = sorted[0]?.score || 0;

        $('#final-scores').innerHTML = gameState.teams.map(team => `
            <div class="final-score-card ${team.score === maxScore && maxScore > 0 ? 'winner' : ''}">
                <div class="name">${team.name}</div>
                <div class="score">$${team.score.toLocaleString()}</div>
            </div>
        `).join('');

        if (sorted.length > 0 && maxScore > 0) {
            const winners = sorted.filter(t => t.score === maxScore);
            if (winners.length === 1) {
                $('#winner-announcement').textContent = `${winners[0].name} Wins!`;
            } else {
                $('#winner-announcement').textContent = "It's a Tie!";
            }
        } else {
            $('#winner-announcement').textContent = "Game Over!";
        }

        showScreen('results-screen');
        broadcastState();
    }

    function resetGame() {
        gameState.teams = [];
        gameState.currentRound = null;
        gameState.currentQuestion = null;
        gameState.usedTiles = new Set();
        gameState.roundIndex = 0;
        gameState.finalWagers = {};

        stopTimer();
        stopFinalTimer();
        closeQuestionForBuzzers();

        if (mqttClient && mqttClient.connected) {
            mqttClient.publish(commandTopic, JSON.stringify({
                type: 'RESET',
                timestamp: Date.now()
            }), { qos: 1 });
        }

        showScreen('setup-screen');
        $('#start-btn').disabled = true;
        $('#file-name').textContent = 'No file selected';
        $('#data-file').value = '';
    }

    function startTimer() {
        stopTimer();
        gameState.timeRemaining = gameState.timerDuration;
        if (gameState.isDailyDouble) {
            updateDailyDoubleTimerDisplay();
        } else {
            updateTimerDisplay();
        }

        gameState.timerInterval = setInterval(() => {
            gameState.timeRemaining--;
            if (gameState.timeRemaining < 0) gameState.timeRemaining = 0;
            if (gameState.isDailyDouble) {
                updateDailyDoubleTimerDisplay();
            } else {
                updateTimerDisplay();
            }

            if (gameState.timeRemaining > 0 && gameState.timeRemaining <= 5) {
                SoundEffects.timerWarning();
            }

            if (gameState.timeRemaining <= 0) {
                stopTimer();
                SoundEffects.timerExpiry();
                if (gameState.isDailyDouble) {
                    showDailyDoubleScoringControls();
                } else {
                    showScoringControls();
                }
            }
        }, 1000);
    }

    function stopTimer() {
        if (gameState.timerInterval) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
        }
    }

    function updateTimerDisplay() {
        const pct = (gameState.timeRemaining / gameState.timerDuration) * 100;
        $('#timer-bar').style.width = `${pct}%`;
        $('#timer-text').textContent = gameState.timeRemaining;

        if (pct < 30) {
            $('#timer-bar').classList.add('warning');
        } else {
            $('#timer-bar').classList.remove('warning');
        }
    }

    function startFinalTimer() {
        stopFinalTimer();
        gameState.timeRemaining = gameState.timerDuration;
        updateFinalTimerDisplay();

        gameState.timerInterval = setInterval(() => {
            gameState.timeRemaining--;
            if (gameState.timeRemaining < 0) gameState.timeRemaining = 0;
            updateFinalTimerDisplay();

            if (gameState.timeRemaining > 0 && gameState.timeRemaining <= 5) {
                SoundEffects.timerWarning();
            }

            if (gameState.timeRemaining <= 0) {
                stopFinalTimer();
                SoundEffects.timerExpiry();
                showFinalScoringControls();
            }
        }, 1000);
    }

    function stopFinalTimer() {
        if (gameState.timerInterval) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
        }
    }

    function updateFinalTimerDisplay() {
        const pct = (gameState.timeRemaining / gameState.timerDuration) * 100;
        $('#final-timer-bar').style.width = `${pct}%`;
        $('#final-timer-text').textContent = gameState.timeRemaining;

        if (pct < 30) {
            $('#final-timer-bar').classList.add('warning');
        } else {
            $('#final-timer-bar').classList.remove('warning');
        }
    }

    function updateDailyDoubleTimerDisplay() {
        const pct = (gameState.timeRemaining / gameState.timerDuration) * 100;
        $('#dd-timer-bar').style.width = `${pct}%`;
        $('#dd-timer-text').textContent = gameState.timeRemaining;

        if (pct < 30) {
            $('#dd-timer-bar').classList.add('warning');
        } else {
            $('#dd-timer-bar').classList.remove('warning');
        }
    }

    function showScreen(screenId) {
        $$('.screen').forEach(s => s.classList.remove('active'));
        $(`#${screenId}`).classList.add('active');
    }

    return {
        init,
        scoreTeam,
        scoreFinalTeam,
        scoreDailyDouble,
        selectDailyDoubleTeam,
        updateDailyDoubleWager,
        confirmDailyDoubleWager,
        showDailyDoubleScoringControls,
        revealDailyDoubleAnswer,
        continueFromDailyDouble
    };
})();

document.addEventListener('DOMContentLoaded', JeopardyGame.init);
