const TeacherControl = (() => {
    const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
    const WAGER_SLIDER_STEP = 50;
    const MIN_WAGER = 50;
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
        hasMath: false,
        usedTiles: new Set(),
        scores: [],
        answerRevealed: false,
        scoringVisible: false,
        buzzLocked: false,
        buzzLockedPlayer: null,
        finalWagers: {},
        finalWagerPhase: false,
        finalClueRevealed: false,
        finalAnswerRevealed: false,
        finalScoringVisible: false,
        isDailyDouble: false,
        ddTeamSelection: false,
        ddWagerPhase: false,
        ddQuestionSection: false,
        ddScoringVisible: false,
        ddAnswerRevealed: false,
        ddTeamIndex: null,
        ddWager: 0,
        winner: '',
        finalScores: []
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function getSliderAlignedMinimum(minWager, maxWager) {
        const min = Number(minWager) || 0;
        const max = Number(maxWager) || 0;
        if (max <= 0) return 0;
        const steppedMin = min <= 0 ? 0 : Math.ceil(min / WAGER_SLIDER_STEP) * WAGER_SLIDER_STEP;
        return Math.min(steppedMin, max);
    }

    function normalizeWagerToSliderStep(wager, minWager, maxWager) {
        const min = Number(minWager) || 0;
        const max = Number(maxWager) || 0;
        if (max <= 0) return 0;

        const clamped = Math.max(min, Math.min(Number(wager) || min, max));
        const sliderMin = getSliderAlignedMinimum(min, max);
        if (max < sliderMin) return max;

        const normalized = Math.round(clamped / WAGER_SLIDER_STEP) * WAGER_SLIDER_STEP;
        return Math.max(sliderMin, Math.min(normalized, max));
    }

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
            const incoming = data.state;
            Object.assign(localState, incoming);
            if (incoming.usedTiles && Array.isArray(incoming.usedTiles)) {
                localState.usedTiles = new Set(incoming.usedTiles);
            }
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

    function typesetControl(targets) {
        if (window.MathJaxLoader) {
            window.MathJaxLoader.maybeTypeset(localState.hasMath, targets);
        }
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
                updateSkipButton();
                break;
            case 'question':
                showScreen('control-screen');
                if (s.isDailyDouble) {
                    renderDailyDoubleControl();
                } else {
                    renderQuestionControl();
                }
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

    function updateSkipButton() {
        const btn = $('#ctrl-skip-round-btn');
        if (!btn || !localState.rounds) return;
        if (localState.roundIndex < localState.rounds.length) {
            btn.classList.remove('hidden');
            const isLastRound = localState.roundIndex >= localState.rounds.length - 1;
            btn.textContent = isLastRound ? 'Skip to Final Showdown' : 'Skip to Next Round';
        } else {
            btn.classList.add('hidden');
        }
    }

    function renderBoardControl() {
        const s = localState;
        $('#control-title').textContent = s.currentRound?.name || 'ROUND 1';
        renderControlScores();
        $('#control-header').classList.remove('hidden');

        $('#board-control').classList.remove('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.add('hidden');
        $('#dd-control').classList.add('hidden');

        if (!s.rounds || s.rounds.length === 0) return;
        const round = s.rounds[s.roundIndex];
        if (!round) return;

        const board = $('#control-board');
        const numCategories = round.categories.length;
        const numQuestions = Math.max(...round.categories.map(c => c.questions.length));

        board.style.gridTemplateColumns = `repeat(${numCategories}, 1fr)`;

        let html = '';
        for (let c = 0; c < numCategories; c++) {
            const cat = round.categories[c];
            html += `<div class="ctrl-category-header cat-${c}">${cat.name}</div>`;
        }

        for (let q = 0; q < numQuestions; q++) {
            for (let c = 0; c < numCategories; c++) {
                const cat = round.categories[c];
                if (q < cat.questions.length) {
                    const tileId = `${s.roundIndex}-${c}-${q}`;
                    const isUsed = s.usedTiles.has(tileId);
                    const question = cat.questions[q];
                    const isDailyDouble = question.isDailyDouble || false;
                    const classes = ['ctrl-tile', `cat-${c}`];
                    if (isUsed) classes.push('used');
                    if (isDailyDouble && !isUsed) classes.push('daily-double');
                    html += `<div class="${classes.join(' ')}" data-id="${tileId}" data-cat="${c}" data-q="${q}">${isUsed ? '' : question.value}</div>`;
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
                <div class="score-value">${team.score.toLocaleString()}</div>
            </div>
        `).join('');
    }

    function renderQuestionControl() {
        const s = localState;
        const q = s.currentQuestion;
        if (!q) return;

        renderControlScores();
        $('#control-header').classList.remove('hidden');

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.remove('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.add('hidden');
        $('#dd-control').classList.add('hidden');

        $('#control-question-category').textContent = q.category;
        $('#control-question-value').textContent = `${q.value}`;
        $('#control-question-text').textContent = q.question;
        $('#control-answer-text').textContent = `Answer: ${q.answer}`;

        if (s.buzzLocked && s.buzzLockedPlayer) {
            $('#control-buzz-indicator').classList.remove('hidden');
            $('#control-buzz-text').textContent = `${s.buzzLockedPlayer.playerName} buzzed in!`;
        } else {
            $('#control-buzz-indicator').classList.add('hidden');
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

        typesetControl($('#question-control'));
    }

    function renderDailyDoubleControl() {
        const s = localState;
        const q = s.currentQuestion;
        if (!q) return;

        renderControlScores();
        $('#control-header').classList.remove('hidden');

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.add('hidden');
        $('#dd-control').classList.remove('hidden');

        $('#ctrl-dd-title').textContent = 'BONUS QUESTION';

        if (s.ddTeamSelection) {
            $('#ctrl-dd-team-selection').classList.remove('hidden');
            $('#ctrl-dd-wager-section').classList.add('hidden');
            $('#ctrl-dd-question-section').classList.add('hidden');

            const btns = $('#ctrl-dd-team-buttons');
            btns.innerHTML = s.teams.map((team, i) =>
                `<button class="ctrl-dd-team-btn ctrl-btn" onclick="TeacherControl.ddSelectTeam(${i})">${team.name} (${team.score.toLocaleString()})</button>`
            ).join('');
        } else if (s.ddWagerPhase) {
            $('#ctrl-dd-team-selection').classList.add('hidden');
            $('#ctrl-dd-wager-section').classList.remove('hidden');
            $('#ctrl-dd-question-section').classList.add('hidden');

            const team = s.teams[s.ddTeamIndex];
            if (team) {
                $('#ctrl-dd-team-name').textContent = team.name;
                $('#ctrl-dd-team-score').textContent = `${team.score.toLocaleString()}`;

                const minWager = MIN_WAGER;
                const boardMax = Math.max(...s.rounds[s.roundIndex].categories.flatMap(c => c.questions.map(q => q.value)));
                const maxWager = Math.max(team.score, boardMax);
                const sliderMin = getSliderAlignedMinimum(minWager, maxWager);

                const slider = $('#ctrl-dd-wager-slider');
                slider.min = sliderMin;
                slider.max = maxWager;
                slider.step = WAGER_SLIDER_STEP;
                const currentWager = Number(s.ddWager);
                slider.value = normalizeWagerToSliderStep(Number.isFinite(currentWager) && currentWager > 0
                    ? Math.max(minWager, Math.min(currentWager, maxWager))
                    : Math.max(minWager, Math.min(team.score, maxWager)), minWager, maxWager);
                $('#ctrl-dd-wager-display').textContent = `${parseInt(slider.value).toLocaleString()}`;

                slider.oninput = () => {
                    $('#ctrl-dd-wager-display').textContent = `${parseInt(slider.value).toLocaleString()}`;
                };
                slider.onchange = () => {
                    sendDailyDoubleWagerUpdate();
                };
            }
        } else if (s.ddQuestionSection) {
            $('#ctrl-dd-team-selection').classList.add('hidden');
            $('#ctrl-dd-wager-section').classList.add('hidden');
            $('#ctrl-dd-question-section').classList.remove('hidden');

            const team = s.teams[s.ddTeamIndex];
            $('#ctrl-dd-wagering-team').textContent = team ? `${team.name} is wagering ${(s.ddWager || 0).toLocaleString()}` : '';
            $('#ctrl-dd-question-category').textContent = q.category;
            $('#ctrl-dd-question-value').textContent = `${q.value}`;
            $('#ctrl-dd-question-text').textContent = q.question;
            $('#ctrl-dd-answer-text').textContent = `Answer: ${q.answer}`;

            if (s.ddScoringVisible) {
                $('#ctrl-dd-scoring').classList.remove('hidden');
                renderDDTeamScoring();
            } else {
                $('#ctrl-dd-scoring').classList.add('hidden');
            }

            if (s.ddAnswerRevealed) {
                $('#ctrl-dd-answer').classList.remove('hidden');
                $('#ctrl-dd-reveal-btn').classList.add('hidden');
                $('#ctrl-dd-continue-btn').classList.remove('hidden');
            } else {
                $('#ctrl-dd-answer').classList.add('hidden');
                $('#ctrl-dd-reveal-btn').classList.remove('hidden');
                $('#ctrl-dd-continue-btn').classList.add('hidden');
            }

            typesetControl($('#dd-control'));
        }
    }

    function renderDDTeamScoring() {
        const container = $('#ctrl-dd-team-scoring');
        const team = localState.teams[localState.ddTeamIndex];
        if (!team) return;
        container.innerHTML = `
            <div class="ctrl-team-score">
                <div class="name">${team.name}</div>
                <div>Wagered: ${(localState.ddWager || 0).toLocaleString()}</div>
                <div class="buttons">
                    <button class="ctrl-score-btn correct" onclick="TeacherControl.scoreTeam(${localState.ddTeamIndex}, true, false)">Correct</button>
                    <button class="ctrl-score-btn wrong" onclick="TeacherControl.scoreTeam(${localState.ddTeamIndex}, false, false)">Wrong</button>
                </div>
            </div>
        `;
    }

    function sendDailyDoubleWagerUpdate() {
        const slider = $('#ctrl-dd-wager-slider');
        if (!slider) return;
        sendCommand('DD_WAGER_UPDATE', {
            wager: parseInt(slider.value) || 0,
        });
    }

    function renderControlTeamScoring(isFinal) {
        const container = isFinal ? $('#control-final-team-scoring') : $('#control-team-scoring');
        const teams = localState.teams;
        container.innerHTML = teams.map((team, i) => {
            const wager = isFinal ? (localState.finalWagers[i] || 0) : localState.currentQuestion?.value || 0;
            return `
                <div class="ctrl-team-score">
                    <div class="name">${team.name}</div>
                    ${isFinal ? `<div>Wagered: ${wager.toLocaleString()}</div>` : ''}
                    <div class="buttons">
                        <button class="ctrl-score-btn correct" onclick="TeacherControl.scoreTeam(${i}, true, ${isFinal})">Correct</button>
                        <button class="ctrl-score-btn wrong" onclick="TeacherControl.scoreTeam(${i}, false, ${isFinal})">Wrong</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function updateFinalWagerDisplay(teamIndex) {
        const slider = $(`#ctrl-final-wager-slider-${teamIndex}`);
        const display = $(`#ctrl-final-wager-display-${teamIndex}`);
        if (!slider || !display) return;
        display.textContent = `${(parseInt(slider.value) || 0).toLocaleString()}`;
    }

    function sendFinalWagerUpdate(teamIndex) {
        const slider = $(`#ctrl-final-wager-slider-${teamIndex}`);
        if (!slider) return;
        sendCommand('FINAL_WAGER_UPDATE', {
            teamIndex,
            wager: parseInt(slider.value) || 0,
        });
    }

    function renderFinalWagerControls() {
        const container = $('#control-final-wagers');
        const teams = localState.teams || [];
        container.innerHTML = teams.map((team, i) => {
            const currentWager = Number(localState.finalWagers?.[i]);
            const maxWager = Math.max(team.score, 0);
            const initialValue = Number.isFinite(currentWager) ? Math.max(0, Math.min(currentWager, maxWager)) : 0;
            return `
                <div class="ctrl-final-wager-input">
                    <div class="ctrl-final-wager-team">${team.name} (${team.score.toLocaleString()})</div>
                    <div class="ctrl-final-wager-control">
                        <label for="ctrl-final-wager-slider-${i}">Wager:</label>
                        <div id="ctrl-final-wager-display-${i}" class="ctrl-final-wager-display">${initialValue.toLocaleString()}</div>
                        <input type="range" id="ctrl-final-wager-slider-${i}" class="ctrl-final-wager-slider" min="0" max="${maxWager}" step="${WAGER_SLIDER_STEP}" value="${initialValue}">
                    </div>
                </div>
            `;
        }).join('');

        teams.forEach((_, i) => {
            const slider = $(`#ctrl-final-wager-slider-${i}`);
            if (!slider) return;
            slider.oninput = () => {
                updateFinalWagerDisplay(i);
            };
            slider.onchange = () => {
                sendFinalWagerUpdate(i);
            };
            updateFinalWagerDisplay(i);
        });
    }

    function collectFinalWagers() {
        const wagers = {};
        (localState.teams || []).forEach((team, i) => {
            const slider = $(`#ctrl-final-wager-slider-${i}`);
            const maxWager = Math.max(team.score, 0);
            let wager = parseInt(slider?.value) || 0;
            wager = Math.max(0, Math.min(wager, maxWager));
            wagers[i] = wager;
        });
        return wagers;
    }

    function renderFinalControl() {
        const s = localState;
        renderControlScores();
        $('#control-header').classList.remove('hidden');

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.remove('hidden');
        $('#results-control').classList.add('hidden');
        $('#dd-control').classList.add('hidden');

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
            $('#control-final-wagers').classList.remove('hidden');
            renderFinalWagerControls();
            $('#control-final-clue').textContent = 'Teams are placing wagers...';
            $('#control-final-scoring').classList.add('hidden');
            $('#control-final-answer').classList.add('hidden');
            $('#ctrl-final-clue-btn').classList.remove('hidden');
            $('#ctrl-final-reveal-btn').classList.add('hidden');
            $('#ctrl-final-pause-btn').classList.add('hidden');
            $('#ctrl-final-continue-btn').classList.add('hidden');
        } else {
            $('#control-final-wagers').classList.add('hidden');
            $('#ctrl-final-clue-btn').classList.add('hidden');
            $('#control-final-clue').textContent = s.currentQuestion?.question || '';
            $('#control-final-answer-text').textContent = `Answer: ${s.currentQuestion?.answer || ''}`;

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
        }

        typesetControl($('#final-control'));
    }

    function renderResultsControl() {
        const s = localState;

        $('#board-control').classList.add('hidden');
        $('#question-control').classList.add('hidden');
        $('#final-control').classList.add('hidden');
        $('#results-control').classList.remove('hidden');
        $('#dd-control').classList.add('hidden');

        $('#control-header').classList.add('hidden');

        $('#control-winner').textContent = s.winner || 'Game Over!';
        $('#control-final-scores').innerHTML = (s.finalScores || []).map(team => `
            <div class="ctrl-final-card ${team.isWinner ? 'winner' : ''}">
                <div class="name">${team.name}</div>
                <div class="score">${team.score.toLocaleString()}</div>
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
        revealFinalClue() {
            sendCommand('REVEAL_FINAL_CLUE', { finalWagers: collectFinalWagers() });
        },
        pauseTimer(isFinal) {
            sendCommand('PAUSE_TIMER', { isFinal });
        },
        continue(isFinal) {
            sendCommand('CONTINUE', { isFinal });
        },
        playAgain() {
            sendCommand('PLAY_AGAIN');
        },
        skipRound() {
            sendCommand('SKIP_ROUND');
        },
        ddSelectTeam(teamIndex) {
            sendCommand('DD_SELECT_TEAM', { teamIndex });
        },
        ddConfirmWager() {
            const wager = parseInt($('#ctrl-dd-wager-slider').value);
            sendCommand('DD_CONFIRM_WAGER', { wager });
        },
        ddRevealAnswer() {
            sendCommand('DD_REVEAL_ANSWER');
        },
        ddContinue() {
            sendCommand('DD_CONTINUE');
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

    document.getElementById('ctrl-final-clue-btn').addEventListener('click', () => {
        TeacherControl.revealFinalClue();
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

    document.getElementById('ctrl-skip-round-btn').addEventListener('click', () => {
        TeacherControl.skipRound();
    });

    document.getElementById('ctrl-dd-wager-confirm-btn').addEventListener('click', () => {
        TeacherControl.ddConfirmWager();
    });

    document.getElementById('ctrl-dd-reveal-btn').addEventListener('click', () => {
        TeacherControl.ddRevealAnswer();
    });

    document.getElementById('ctrl-dd-pause-btn').addEventListener('click', () => {
        TeacherControl.pauseTimer(false);
    });

    document.getElementById('ctrl-dd-continue-btn').addEventListener('click', () => {
        TeacherControl.ddContinue();
    });
});
