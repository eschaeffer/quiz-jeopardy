const SoundEffects = (() => {
    let audioCtx = null;
    let masterGain = null;
    let isMuted = false;
    let isInitialized = false;
    let muteButton = null;

    const MAX_VOLUME = 0.3;

    function init() {
        if (isInitialized) return;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = isMuted ? 0 : 1;
        masterGain.connect(audioCtx.destination);

        isInitialized = true;
    }

    function ensureAudioContext() {
        if (!isInitialized) {
            init();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function createMuteButton() {
        muteButton = document.createElement('button');
        muteButton.id = 'mute-toggle';
        muteButton.className = 'btn secondary small';
        muteButton.setAttribute('aria-label', 'Toggle sound');
        updateMuteButton();

        muteButton.addEventListener('click', toggleMute);

        const app = document.getElementById('app');
        if (app) {
            app.appendChild(muteButton);
        }
    }

    function updateMuteButton() {
        if (!muteButton) return;
        muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
    }

    function toggleMute() {
        isMuted = !isMuted;
        if (masterGain) {
            masterGain.gain.setValueAtTime(isMuted ? 0 : 1, audioCtx.currentTime);
        }
        updateMuteButton();
    }

    function playTone(frequency, duration, type = 'sine', volume = 0.5, delay = 0) {
        if (!isInitialized || isMuted) return;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime + delay);

        gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(volume * MAX_VOLUME, audioCtx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
    }

    function playNoise(duration, volume = 0.3, delay = 0) {
        if (!isInitialized || isMuted) return;

        const bufferSize = audioCtx.sampleRate * duration;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(volume * MAX_VOLUME, audioCtx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 500;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        source.start(audioCtx.currentTime + delay);
        source.stop(audioCtx.currentTime + delay + duration);
    }

    function tileSelection() {
        ensureAudioContext();
        playTone(800, 0.08, 'sine', 0.6);
        playTone(1200, 0.06, 'sine', 0.4, 0.04);
    }

    function correctAnswer() {
        ensureAudioContext();
        playTone(523.25, 0.15, 'sine', 0.7);
        playTone(659.25, 0.15, 'sine', 0.7, 0.12);
        playTone(783.99, 0.3, 'sine', 0.8, 0.24);
    }

    function incorrectAnswer() {
        ensureAudioContext();
        playNoise(0.4, 0.5);
        playTone(150, 0.4, 'sawtooth', 0.4);
        playTone(120, 0.4, 'square', 0.2);
    }

    function buzzInConfirmation() {
        ensureAudioContext();
        playTone(1000, 0.05, 'sine', 0.8);
        playTone(1500, 0.08, 'sine', 0.6, 0.05);
    }

    function timerWarning() {
        ensureAudioContext();
        playTone(880, 0.1, 'square', 0.5);
    }

    function timerExpiry() {
        ensureAudioContext();
        playTone(440, 0.15, 'square', 0.6);
        playTone(440, 0.15, 'square', 0.6, 0.2);
        playTone(440, 0.3, 'square', 0.7, 0.4);
    }

    function roundTransition() {
        ensureAudioContext();
        playTone(523.25, 0.15, 'sine', 0.6);
        playTone(659.25, 0.15, 'sine', 0.6, 0.15);
        playTone(783.99, 0.15, 'sine', 0.6, 0.3);
        playTone(1046.50, 0.3, 'sine', 0.7, 0.45);
    }

    function dailyDouble() {
        ensureAudioContext();
        playTone(330, 0.3, 'sine', 0.8);
        playTone(392, 0.3, 'sine', 0.8, 0.25);
        playTone(440, 0.3, 'sine', 0.8, 0.5);
        playTone(523.25, 0.5, 'sine', 0.9, 0.75);
        playTone(659.25, 0.6, 'sine', 1.0, 1.0);
    }

    return {
        init,
        toggleMute,
        tileSelection,
        correctAnswer,
        incorrectAnswer,
        buzzInConfirmation,
        timerWarning,
        timerExpiry,
        roundTransition,
        dailyDouble,
        get isMuted() { return isMuted; },
        get audioContext() { return audioCtx; },
        createMuteButton
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    SoundEffects.init();
    SoundEffects.createMuteButton();
});
