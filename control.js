const TeacherControl = (() => {
    const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
    let client = null;
    let sessionId = null;
    let stateTopic = null;
    let commandTopic = null;
    let localState = {
        phase: 'setup',
        teams: [],
        currentRound: null,
        roundIndex: 0,
        rounds: [],
        currentQuestion: null,
        usedTiles: new Set(),
        scores: [],
        timerRemaining: 0,
        timerDuration: 0,
        timerRunning: false,
        answerRevealed: false,
        scoringVisible: false,
        buzzLocked: false,
        buzzLockedPlayer: null,
        finalWagers: {},
        finalWagerPhase: false,
        finalClueRevealed: false,
        finalAnswerRevealed: false,
        finalScoringVisible: false,
        winner: '',
        finalScores: []
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function init() {
        const params = new URLSearchParams(window.location.search);
        const sessionParam = params.get('session');
        if (sessionParam) {
            $('#session-input').value = sessionParam;
        }

        $('#connect-btn').addEventListener('click', connect);
        $('#session-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') connect();
        });
    }

    function connect() {
        sessionId = $('#session-input').value.trim().toUpperCase();
        if (!sessionId) return;

        stateTopic = `jeopardy/state/${sessionId}`;
        commandTopic = `jeopardy/control-cmd/${sessionId}`;

        client = mqtt.connect(MQTT_BROKER, {
            clientId: `jeopardy-control-${Date.now()}`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 2000
        });

        client.on('connect', () => {
            client.subscribe(stateTopic, { qos: 1 });
            client.publish(commandTopic, JSON.stringify({
                type: 'CONTROL_CONNECT',
                timestamp: Date.now()
            }), { qos: 1 });
        });

        client.on('message', (topic, message) => {
            const data = JSON.parse(message.toString());
            handleStateUpdate(data);
        });
    }

    function handleStateUpdate(data) {
        if (data.type === 'STATE_UPDATE') {
            Object.assign(localState, data.state);
            renderControl();
        }
    }

    function sendCommand(type, payload = {}) {
        if (!client || !client.connected) return;
        client.publish(commandTopic, JSON.stringify({
            type,
            ...payload,
            timestamp: Date.now()
        }), { qos: 1 });
    }

    function renderControl() {
        const s = localState;

        switch (s.phase) {
            case 'setup':
                showScreen('connect-screen');
                break;
            case 'board':
                showScreen('control-screen');
                renderBoardControl();
                break;
            case 'question':
                showScreen('control-screen');
                renderQuestionControl();
                break;
            case 'final':
                showScreen('control-screen');
                renderFinalControl();
                break;
            case 'results':
                showScreen('control-screen');
                renderResultsControl();
                break;
        }
    }

    function renderBoardControl() {
        const s = localState;
        $('#control-title').textContent = s.currentRound?.name || 'JEOPARDY!';
        renderControlScores();

        $('#board-control').classList.remove('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.add('hidden');

        if (!s.rounds || s.rounds.length === 0) return;
        const round = s.rounds[s.roundIndex];
        if (!round) return;

        const board = $('#control-board');
        const numCategories = round.categories.length;
        const numQuestions = Math.max(...round.categories.map(c => c.questions.length));

        board.style.gridTemplateColumns = `repeat(${numCategories}, 1fr)`;

        let html = '';
        for (const cat of round.categories) {
            html += `<div class="ctrl-category-header">${cat.name}</div>`;
        }

        for (let q = 0; q < numQuestions; q++) {
            for (let c = 0; c < numCategories; c++) {
                const cat = round.categories[c];
                if (q < cat.questions.length) {
                    const tileId = `${s.roundIndex}-${c}-${q}`;
                    const isUsed = s.usedTiles.has(tileId) || s.usedTiles.has(`${s.roundIndex}-${c}-${q}`);
                    const question = cat.questions[q];
                    html += `<div class="ctrl-tile ${isUsed ? 'used' : ''}" data-id="${tileId}" data-cat="${c}" data-q="${q}">${isUsed ? '' : `$${question.value}`}</div>`;
                } else {
                    html += `<div class="ctrl-tile used"></div>`;
                }
            }
        }

        board.innerHTML = html;

        board.querySelectorAll('.ctrl-tile:not(.used)').forEach(tile => {
            tile.addEventListener('click', () => {
                sendCommand('SELECT_QUESTION', {
                    catIndex: parseInt(tile.dataset.cat),
                    qIndex: parseInt(tile.dataset.q),
                    tileId: tile.dataset.id
                });
            });
        });
    }

    function renderControlScores() {
        const bar = $('#control-scores');
        if (!localState.teams || localState.teams.length === 0) {
            bar.innerHTML = '';
            return;
        }
        bar.innerHTML = localState.teams.map(team => `
            <div class="ctrl-score-item">
                <div class="team-name">${team.name}</div>
                <div class="score-value">$${team.score.toLocaleString()}</div>
            </div>
        `).join('');
    }

    function renderQuestionControl() {
        const s = localState;
        const q = s.currentQuestion;
        if (!q) return;

        renderControlScores();

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.remove('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.add('hidden');

        $('#control-question-category').textContent = q.category;
        $('#control-question-value').textContent = `$${q.value}`;
        $('#control-question-text').textContent = q.question;
        $('#control-answer-text').textContent = `Answer: ${q.answer}`;

        if (s.buzzLocked && s.buzzLockedPlayer) {
            $('#control-buzz-indicator').classList.remove('hidden');
            $('#control-buzz-text').textContent = `${s.buzzLockedPlayer.playerName} buzzed in!`;
        } else {
            $('#control-buzz-indicator').classList.add('hidden');
        }

        if (s.timerRunning || s.timerRemaining > 0) {
            $('#control-timer-display').classList.remove('hidden');
            const pct = (s.timerRemaining / s.timerDuration) * 100;
            $('#control-timer-bar').style.width = `${pct}%`;
            $('#control-timer-text').textContent = s.timerRemaining;
            $('#control-timer-bar').classList.toggle('warning', pct < 30);
        } else {
            $('#control-timer-display').classList.add('hidden');
        }

        if (s.scoringVisible) {
            $('#control-scoring').classList.remove('hidden');
            renderControlTeamScoring(false);
        } else {
            $('#control-scoring').classList.add('hidden');
        }

        if (s.answerRevealed) {
            $('#control-answer').classList.remove('hidden');
            $('#ctrl-reveal-btn').classList.add('hidden');
            $('#ctrl-continue-btn').classList.remove('hidden');
        } else {
            $('#control-answer').classList.add('hidden');
            $('#ctrl-reveal-btn').classList.remove('hidden');
            $('#ctrl-continue-btn').classList.add('hidden');
        }

        $('#ctrl-pause-btn').textContent = s.timerRunning ? 'Pause Timer' : 'Timer Stopped';
        $('#ctrl-pause-btn').disabled = !s.timerRunning;
    }

    function renderControlTeamScoring(isFinal) {
        const container = isFinal ? $('#control-final-team-scoring') : $('#control-team-scoring');
        const teams = localState.teams;
        container.innerHTML = teams.map((team, i) => {
            const wager = isFinal ? (localState.finalWagers[i] || 0) : localState.currentQuestion?.value || 0;
            return `
                <div class="ctrl-team-score">
                    <div class="name">${team.name}</div>
                    ${isFinal ? `<div>Wagered: $${wager.toLocaleString()}</div>` : ''}
                    <div class="buttons">
                        <button class="ctrl-score-btn correct" onclick="TeacherControl.scoreTeam(${i}, true, ${isFinal})">Correct</button>
                        <button class="ctrl-score-btn wrong" onclick="TeacherControl.scoreTeam(${i}, false, ${isFinal})">Wrong</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderFinalControl() {
        const s = localState;
        renderControlScores();

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.remove('hidden');
        $('#results-control').classList.add('hidden');

        $('#control-final-category').textContent = s.currentRound?.name === 'FINAL JEOPARDY!' ? '' : '';
        if (s.rounds && s.rounds.length > 0) {
            const round = s.rounds[s.roundIndex];
            if (round) {
                const cat = round.categories?.[0];
                if (cat) {
                    $('#control-final-category').textContent = cat.name || '';
                }
            }
        }

        if (s.finalWagerPhase) {
            $('#control-final-clue').textContent = 'Teams are placing wagers...';
            $('#control-final-timer-display').classList.add('hidden');
            $('#control-final-scoring').classList.add('hidden');
            $('#control-final-answer').classList.add('hidden');
            $('.control-actions').querySelectorAll('.ctrl-btn').forEach(b => b.classList.add('hidden'));
        } else {
            $('#control-final-clue').textContent = s.currentQuestion?.question || '';
            $('#control-answer-text').textContent = `Answer: ${s.currentQuestion?.answer || ''}`;

            if (s.timerRunning || s.timerRemaining > 0) {
                $('#control-final-timer-display').classList.remove('hidden');
                const pct = (s.timerRemaining / s.timerDuration) * 100;
                $('#control-final-timer-bar').style.width = `${pct}%`;
                $('#control-final-timer-text').textContent = s.timerRemaining;
                $('#control-final-timer-bar').classList.toggle('warning', pct < 30);
            } else {
                $('#control-final-timer-display').classList.add('hidden');
            }

            if (s.finalScoringVisible) {
                $('#control-final-scoring').classList.remove('hidden');
                renderControlTeamScoring(true);
            } else {
                $('#control-final-scoring').classList.add('hidden');
            }

            if (s.finalAnswerRevealed) {
                $('#control-final-answer').classList.remove('hidden');
                $('#ctrl-final-reveal-btn').classList.add('hidden');
                $('#ctrl-final-continue-btn').classList.remove('hidden');
            } else {
                $('#control-final-answer').classList.add('hidden');
                $('#ctrl-final-reveal-btn').classList.remove('hidden');
                $('#ctrl-final-continue-btn').classList.add('hidden');
            }

            $('#ctrl-final-pause-btn').textContent = s.timerRunning ? 'Pause Timer' : 'Timer Stopped';
            $('#ctrl-final-pause-btn').disabled = !s.timerRunning;
        }
    }

    function renderResultsControl() {
        const s = localState;
        renderControlScores();

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.remove('hidden');

        $('#control-winner').textContent = s.winner || 'Game Over!';
        $('#control-final-scores').innerHTML = (s.finalScores || []).map(team => `
            <div class="ctrl-final-card ${team.isWinner ? 'winner' : ''}">
                <div class="name">${team.name}</div>
                <div class="score">$${team.score.toLocaleString()}</div>
            </div>
        `).join('');
    }

    function showScreen(screenId) {
        $$('.screen').forEach(s => s.classList.remove('active'));
        $(`#${screenId}`)?.classList.add('active');
    }

    return {
        init,
        scoreTeam(teamIndex, isCorrect, isFinal) {
            sendCommand('SCORE_TEAM', { teamIndex, isCorrect, isFinal });
        },
        revealAnswer(isFinal) {
            sendCommand('REVEAL_ANSWER', { isFinal });
        },
        pauseTimer(isFinal) {
            sendCommand('PAUSE_TIMER', { isFinal });
        },
        continue(isFinal) {
            sendCommand('CONTINUE', { isFinal });
        },
        playAgain() {
            sendCommand('PLAY_AGAIN');
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    TeacherControl.init();

    document.getElementById('ctrl-reveal-btn').addEventListener('click', () => {
        TeacherControl.revealAnswer(false);
    });

    document.getElementById('ctrl-pause-btn').addEventListener('click', () => {
        TeacherControl.pauseTimer(false);
    });

    document.getElementById('ctrl-continue-btn').addEventListener('click', () => {
        TeacherControl.continue(false);
    });

    document.getElementById('ctrl-final-reveal-btn').addEventListener('click', () => {
        TeacherControl.revealAnswer(true);
    });

    document.getElementById('ctrl-final-pause-btn').addEventListener('click', () => {
        TeacherControl.pauseTimer(true);
    });

    document.getElementById('ctrl-final-continue-btn').addEventListener('click', () => {
        TeacherControl.continue(true);
    });

    document.getElementById('ctrl-play-again-btn').addEventListener('click', () => {
        TeacherControl.playAgain();
    });
});
