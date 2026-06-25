const AIQuizGenerator = (() => {
    const $ = (sel) => document.querySelector(sel);

    let modal = null;
    let topicInput = null;
    let catSlider = null;
    let qpcSlider = null;
    let catDisplay = null;
    let qpcDisplay = null;
    let generateBtn = null;
    let errorEl = null;
    let loadingEl = null;
    let errorDebugBtn = null;
    let lastError = null;
    let debugModal = null;

    function init() {
        createModal();
        createDebugModal();
        wireUpButton();
    }

    function createModal() {
        modal = document.createElement('div');
        modal.className = 'ai-modal-overlay hidden';
        modal.innerHTML = `
            <div class="ai-modal-content">
                <button class="ai-modal-close">&times;</button>
                <h2>AI Generate Quiz</h2>
                <p>Enter a topic and we'll generate a quiz for you.</p>
                <div class="ai-modal-field">
                    <label for="ai-topic">Topic</label>
                    <input type="text" id="ai-topic" placeholder="e.g. World War II, Biology, Math">
                </div>
                <div class="ai-modal-field">
                    <label>Categories per round: <span id="ai-cat-display">5</span></label>
                    <input type="range" id="ai-cat-slider" min="3" max="6" value="5">
                </div>
                <div class="ai-modal-field">
                    <label>Questions per category: <span id="ai-qpc-display">5</span></label>
                    <input type="range" id="ai-qpc-slider" min="3" max="5" value="5">
                </div>
                <button id="ai-generate-btn" class="btn primary">Generate Quiz</button>
                <div id="ai-loading" style="display:none;">
                    <span class="license-spinner"></span> Generating quiz...
                </div>
                <div id="ai-error" class="license-error"></div>
                <button id="ai-debug-btn" class="license-retry" style="display:none;">Copy Debug Info</button>
            </div>
        `;
        document.getElementById('app').appendChild(modal);

        topicInput = modal.querySelector('#ai-topic');
        catSlider = modal.querySelector('#ai-cat-slider');
        qpcSlider = modal.querySelector('#ai-qpc-slider');
        catDisplay = modal.querySelector('#ai-cat-display');
        qpcDisplay = modal.querySelector('#ai-qpc-display');
        generateBtn = modal.querySelector('#ai-generate-btn');
        errorEl = modal.querySelector('#ai-error');
        loadingEl = modal.querySelector('#ai-loading');
        errorDebugBtn = modal.querySelector('#ai-debug-btn');

        catSlider.addEventListener('input', () => { catDisplay.textContent = catSlider.value; });
        qpcSlider.addEventListener('input', () => { qpcDisplay.textContent = qpcSlider.value; });

        modal.querySelector('.ai-modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        generateBtn.addEventListener('click', generateQuiz);
        topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateQuiz(); });
        errorDebugBtn.addEventListener('click', showDebugModal);
    }

    function createDebugModal() {
        debugModal = document.createElement('div');
        debugModal.className = 'yolo-modal-overlay hidden';
        debugModal.innerHTML = `
            <div class="yolo-modal-content">
                <h3>Copy Debug Info</h3>
                <p>Choose what to copy to your clipboard:</p>
                <div class="yolo-modal-buttons">
                    <button class="btn secondary" id="debug-copy-summary">Copy Summary</button>
                    <button class="btn primary" id="debug-copy-full">Copy Full Details</button>
                </div>
                <button class="license-retry" id="debug-close-btn" style="margin-top:1rem;">Close</button>
            </div>
        `;
        document.getElementById('app').appendChild(debugModal);

        debugModal.querySelector('#debug-close-btn').addEventListener('click', hideDebugModal);
        debugModal.querySelector('#debug-copy-summary').addEventListener('click', () => copyDebugInfo('summary'));
        debugModal.querySelector('#debug-copy-full').addEventListener('click', () => copyDebugInfo('full'));
    }

    function showDebugModal() {
        debugModal.classList.remove('hidden');
    }

    function hideDebugModal() {
        debugModal.classList.add('hidden');
    }

    function copyDebugInfo(mode) {
        if (!lastError) return;

        let text;
        if (mode === 'summary') {
            text = `Quiz generation failed: ${lastError.message} (Code: ${lastError.code}, Status: ${lastError.status})`;
        } else {
            text = `=== Classroom Trivia Showdown - Debug Info ===
Timestamp: ${new Date().toISOString()}
Topic: ${topicInput?.value || 'unknown'}
Categories: ${catSlider?.value || 'unknown'}
Questions per category: ${qpcSlider?.value || 'unknown'}
Model: openrouter/auto

--- Error ---
Status: ${lastError.status}
Message: ${lastError.message}
Code: ${lastError.code}
Type: ${lastError.type}
Request ID: ${lastError.requestId}

--- Rate Limits ---
Requests remaining: ${lastError.rateLimitRemaining || 'N/A'}
Tokens remaining: ${lastError.tokenLimitRemaining || 'N/A'}

--- Environment ---
Browser: ${navigator.userAgent}
Platform: ${navigator.platform}`;
        }

        navigator.clipboard.writeText(text).then(() => {
            const btn = debugModal.querySelector(mode === 'summary' ? '#debug-copy-summary' : '#debug-copy-full');
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 2000);
        });
    }

    function openModal() {
        modal.classList.remove('hidden');
        topicInput.value = '';
        errorEl.textContent = '';
        loadingEl.style.display = 'none';
        errorDebugBtn.style.display = 'none';
        lastError = null;
        topicInput.focus();
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    function wireUpButton() {
        const btn = document.createElement('button');
        btn.id = 'ai-generate-quiz-btn';
        btn.className = 'btn secondary';
        btn.textContent = 'AI Generate Quiz';
        btn.addEventListener('click', () => {
            if (!LicenseManager.isValidated()) {
                alert('Please activate your license first.');
                return;
            }
            openModal();
        });

        const setupActions = document.querySelector('.setup-actions');
        if (setupActions) {
            setupActions.appendChild(btn);
        }
    }

    function setLoading(loading) {
        generateBtn.style.display = loading ? 'none' : '';
        loadingEl.style.display = loading ? '' : 'none';
    }

    async function generateQuiz() {
        const topic = topicInput.value.trim();
        if (!topic) {
            errorEl.textContent = 'Please enter a topic.';
            errorDebugBtn.style.display = 'none';
            return;
        }

        setLoading(true);
        errorEl.textContent = '';
        errorDebugBtn.style.display = 'none';
        lastError = null;

        try {
            const response = await fetch('/.netlify/functions/gen-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic,
                    categories: parseInt(catSlider.value),
                    questionsPerCategory: parseInt(qpcSlider.value),
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                if (err.error) {
                    lastError = err;
                    errorEl.textContent = `Quiz generation failed: ${err.message}`;
                    errorDebugBtn.style.display = '';
                } else {
                    errorEl.textContent = err.message || 'Failed to generate quiz.';
                }
                return;
            }

            const quiz = await response.json();
            const qPerCat = parseInt(qpcSlider.value);

            closeModal();

            QuestionReview.startReview(quiz, qPerCat, (trimmedData) => {
                    QuestionReview.hideReview();
                    if (typeof JeopardyGame !== 'undefined' && JeopardyGame.validateAndStoreData) {
                        JeopardyGame.validateAndStoreData(trimmedData);
                        const fileNameEl = document.getElementById('file-name');
                        if (fileNameEl) fileNameEl.textContent = `AI Generated: ${topic}`;
                    }
                });
            });
        } catch (e) {
            errorEl.textContent = e.message || 'Could not generate quiz. Check your connection.';
            errorDebugBtn.style.display = 'none';
            const retryBtn = document.createElement('button');
            retryBtn.className = 'license-retry';
            retryBtn.textContent = 'Retry';
            retryBtn.addEventListener('click', generateQuiz);
            errorEl.appendChild(retryBtn);
        } finally {
            setLoading(false);
        }
    }

    function loadMathJax() {
        if (window.MathJax) return Promise.resolve();
        window.MathJax = {
            tex: {
                inlineMath: [['\\(', '\\)']],
                displayMath: [['\\[', '\\]']]
            },
            options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
            }
        };
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js';
            script.defer = true;
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    return { init, openModal };
})();
