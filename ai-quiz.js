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

    function init() {
        createModal();
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
                    <label>Categories: <span id="ai-cat-display">5</span></label>
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

        catSlider.addEventListener('input', () => { catDisplay.textContent = catSlider.value; });
        qpcSlider.addEventListener('input', () => { qpcDisplay.textContent = qpcSlider.value; });

        modal.querySelector('.ai-modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        generateBtn.addEventListener('click', generateQuiz);
        topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateQuiz(); });
    }

    function openModal() {
        modal.classList.remove('hidden');
        topicInput.value = '';
        errorEl.textContent = '';
        loadingEl.style.display = 'none';
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
            return;
        }

        setLoading(true);
        errorEl.textContent = '';

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
                throw new Error(err.error || 'Failed to generate quiz.');
            }

            const quiz = await response.json();
            const data = {
                rounds: [{
                    name: 'Round 1',
                    categories: quiz.categories.map((cat, i) => ({
                        name: cat.name,
                        questions: cat.questions.map((q, j) => ({
                            value: (j + 1) * 200,
                            question: q.question,
                            answer: q.answer,
                        })),
                    })),
                }],
            };

            closeModal();

            if (typeof JeopardyGame !== 'undefined' && JeopardyGame.validateAndStoreData) {
                JeopardyGame.validateAndStoreData(data);
                const fileNameEl = document.getElementById('file-name');
                if (fileNameEl) fileNameEl.textContent = `AI Generated: ${topic}`;
            } else {
                window.dispatchEvent(new CustomEvent('quiz-data-ready', { detail: data }));
                const fileNameEl = document.getElementById('file-name');
                if (fileNameEl) fileNameEl.textContent = `AI Generated: ${topic}`;
            }
        } catch (e) {
            errorEl.textContent = e.message || 'Could not generate quiz. Check your connection.';
            const retryBtn = document.createElement('button');
            retryBtn.className = 'license-retry';
            retryBtn.textContent = 'Retry';
            retryBtn.addEventListener('click', generateQuiz);
            errorEl.appendChild(retryBtn);
        } finally {
            setLoading(false);
        }
    }

    return { init, openModal };
})();
