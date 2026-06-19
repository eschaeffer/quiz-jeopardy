const BuzzerClient = (() => {
    const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
    let client = null;
    let sessionId = null;
    let playerId = null;
    let playerName = null;
    let buzzTopic = null;
    let commandTopic = null;
    let statusTopic = null;
    let isBuzzing = false;
    let isConnected = false;
    let reconnectBanner = null;

    const $ = (sel) => document.querySelector(sel);

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
        $('#name-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') connect();
        });

        createReconnectBanner();
    }

    function createReconnectBanner() {
        reconnectBanner = document.createElement('div');
        reconnectBanner.id = 'reconnect-banner';
        reconnectBanner.className = 'disconnected-banner';
        reconnectBanner.innerHTML = '<span class="banner-spinner"></span><span class="banner-text">Connection lost — reconnecting...</span>';
        reconnectBanner.style.display = 'none';

        const app = document.getElementById('app');
        if (app) {
            app.insertBefore(reconnectBanner, app.firstChild);
        }
    }

    function showReconnectBanner() {
        isConnected = false;
        if (reconnectBanner) reconnectBanner.style.display = 'flex';
        updateStatusDot('disconnected', 'Reconnecting...');
    }

    function hideReconnectBanner() {
        isConnected = true;
        if (reconnectBanner) reconnectBanner.style.display = 'none';
        updateStatusDot('connected', 'Connected');
    }

    function updateStatusDot(className, text) {
        const dot = $('#connection-status .status-dot');
        const txt = $('#connection-status .status-text');
        if (dot) {
            dot.className = 'status-dot ' + className;
        }
        if (txt) {
            txt.textContent = text;
        }
    }

    function publishStatus(status) {
        if (!client || !client.connected || !statusTopic) return;
        client.publish(statusTopic, JSON.stringify({
            playerId,
            playerName,
            status,
            timestamp: Date.now()
        }), { qos: 1 });
    }

    function connect() {
        sessionId = $('#session-input').value.trim().toUpperCase();
        if (!sessionId) return;

        const nameValue = $('#name-input').value.trim();
        playerName = nameValue || `Player-${Date.now().toString(36).slice(0, 4)}`;

        playerId = generateId();

        buzzTopic = `jeopardy/buzz/${sessionId}`;
        commandTopic = `jeopardy/command/${sessionId}`;
        statusTopic = `jeopardy/status/${sessionId}/${playerId}`;

        client = mqtt.connect(MQTT_BROKER, {
            clientId: `jeopardy-buzzer-${playerId}`,
            clean: true,
            connectTimeout: 10000,
            reconnectPeriod: 2000,
            will: {
                topic: statusTopic,
                payload: JSON.stringify({
                    playerId,
                    playerName,
                    status: 'disconnected',
                    timestamp: Date.now()
                }),
                qos: 1,
                retain: true
            }
        });

        client.on('connect', () => {
            client.subscribe(commandTopic, { qos: 1 });
            client.publish(`jeopardy/join/${sessionId}`, JSON.stringify({
                playerId,
                playerName,
                timestamp: Date.now()
            }), { qos: 1 });
            publishStatus('connected');
            showScreen('buzzer-ready-screen');
            $('#player-name-display').textContent = playerName;
            hideReconnectBanner();
        });

        client.on('message', (topic, message) => {
            const data = JSON.parse(message.toString());
            handleCommand(data);
        });

        client.on('error', (err) => {
            console.error('MQTT Error:', err);
        });

        client.on('close', () => {
            showReconnectBanner();
        });

        client.on('reconnect', () => {
            showReconnectBanner();
        });

        client.on('offline', () => {
            showReconnectBanner();
        });

        client.on('end', () => {
            showReconnectBanner();
        });
    }

    function handleCommand(data) {
        switch (data.type) {
            case 'QUESTION_OPEN':
                isBuzzing = false;
                showScreen('buzzer-active-screen');
                $('#buzz-result').textContent = '';
                $('#buzz-btn').disabled = true;
                $('#buzz-btn').textContent = 'Read the question...';
                break;

            case 'BUZZERS_ENABLE':
                isBuzzing = true;
                $('#buzz-btn').disabled = false;
                $('#buzz-btn').textContent = 'BUZZ!';
                break;

            case 'BUZZ_LOCKED':
                isBuzzing = false;
                if (data.playerId === playerId) {
                    showScreen('buzzer-buzzed-screen');
                    $('#buzzed-text').textContent = 'You buzzed in first!';
                } else {
                    showScreen('buzzer-locked-screen');
                    $('#locked-subtext').textContent = `${data.playerName} buzzed first.`;
                }
                break;

            case 'QUESTION_CLOSE':
                isBuzzing = false;
                showScreen('buzzer-ready-screen');
                break;

            case 'RESET':
                isBuzzing = false;
                showScreen('buzzer-ready-screen');
                break;

            case 'KICKED':
                isBuzzing = false;
                if (client) client.end(true);
                showScreen('buzzer-kicked-screen');
                break;
        }
    }

    function sendBuzz() {
        if (!isBuzzing || !client || !client.connected) return;

        $('#buzz-btn').disabled = true;
        client.publish(buzzTopic, JSON.stringify({
            playerId,
            playerName,
            timestamp: Date.now()
        }), { qos: 1 });
    }

    function generateId() {
        return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        $(`#${screenId}`).classList.add('active');
    }

    return {
        init,
        sendBuzz
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    BuzzerClient.init();

    document.getElementById('buzz-btn').addEventListener('click', BuzzerClient.sendBuzz);
    document.getElementById('buzz-btn').addEventListener('touchstart', (e) => {
        e.preventDefault();
        BuzzerClient.sendBuzz();
    });
});
