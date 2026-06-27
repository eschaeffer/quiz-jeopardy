const AIQuizGenerator = (() => {
    const $ = (sel) => document.querySelector(sel);

    let modal = null;
    let topicInput = null;
    let topicField = null;
    let conceptField = null;
    let conceptSelect = null;
    let catSlider = null;
    let qpcSlider = null;
    let curriculumSelect = null;
    let catDisplay = null;
    let qpcDisplay = null;
    let generateBtn = null;
    let errorEl = null;
    let loadingEl = null;
    let errorDebugBtn = null;
    let lastError = null;
    let debugModal = null;

    const MTH1W_CONCEPTS = [
        { id: 'on-mth1w-2021-concept-linear-relations', name: 'Linear Relations' },
        { id: 'on-mth1w-2021-concept-powers-scientific-notation', name: 'Powers and Scientific Notation' },
        { id: 'on-mth1w-2021-concept-rational-numbers-fractions', name: 'Rational Numbers and Fractions' },
        { id: 'on-mth1w-2021-concept-box-plots-scatter-plots', name: 'Box Plots and Scatter Plots' },
        { id: 'on-mth1w-2021-concept-right-triangles-measurement', name: 'Right Triangles and Measurement' },
        { id: 'on-mth1w-2021-concept-financial-literacy-interest-rates', name: 'Financial Literacy: Interest Rates' },
    ];

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
                <div class="ai-modal-field" id="ai-topic-field">
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
                <div class="ai-modal-field">
                    <label for="ai-curriculum">Curriculum alignment</label>
                    <select id="ai-curriculum">
                        <option value="">None</option>
                        <option value="mth1w">Ontario Grade 9 Math (MTH1W)</option>
                    </select>
                    <p class="ai-modal-help">Optional. Uses the topic to find matching expectations; you do not need to choose expectations manually.</p>
                </div>
                <div class="ai-modal-field" id="ai-concept-field" style="display:none;">
                    <label for="ai-concept">Teaching topic</label>
                    <select id="ai-concept">
                        ${MTH1W_CONCEPTS.map(concept => `<option value="${concept.id}">${concept.name}</option>`).join('')}
                        <option value="custom">Custom Topic</option>
                    </select>
                    <p class="ai-modal-help">Choose a curated MTH1W topic, or use Custom Topic to type your own.</p>
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
        topicField = modal.querySelector('#ai-topic-field');
        conceptField = modal.querySelector('#ai-concept-field');
        conceptSelect = modal.querySelector('#ai-concept');
        catSlider = modal.querySelector('#ai-cat-slider');
        qpcSlider = modal.querySelector('#ai-qpc-slider');
        curriculumSelect = modal.querySelector('#ai-curriculum');
        catDisplay = modal.querySelector('#ai-cat-display');
        qpcDisplay = modal.querySelector('#ai-qpc-display');
        generateBtn = modal.querySelector('#ai-generate-btn');
        errorEl = modal.querySelector('#ai-error');
        loadingEl = modal.querySelector('#ai-loading');
        errorDebugBtn = modal.querySelector('#ai-debug-btn');

        catSlider.addEventListener('input', () => { catDisplay.textContent = catSlider.value; });
        qpcSlider.addEventListener('input', () => { qpcDisplay.textContent = qpcSlider.value; });
        curriculumSelect.addEventListener('change', updateTopicControls);
        conceptSelect.addEventListener('change', updateTopicControls);

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
Teaching topic: ${getSelectedConcept()?.name || 'custom/none'}
Categories: ${catSlider?.value || 'unknown'}
Questions per category: ${qpcSlider?.value || 'unknown'}
Curriculum alignment: ${curriculumSelect?.value || 'none'}
Model: openrouter/auto

--- Error ---
Status: ${lastError.status}
Message: ${lastError.message}
Code: ${lastError.code}
Type: ${lastError.type}
Request ID: ${lastError.requestId}
Details: ${lastError.details || 'N/A'}
Raw response: ${lastError.raw || 'N/A'}

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
        curriculumSelect.value = '';
        conceptSelect.value = MTH1W_CONCEPTS[0].id;
        updateTopicControls();
        errorEl.textContent = '';
        loadingEl.style.display = 'none';
        errorDebugBtn.style.display = 'none';
        lastError = null;
        focusActiveTopicControl();
    }

    function getSelectedConcept() {
        if (!conceptSelect || conceptSelect.value === 'custom') return null;
        return MTH1W_CONCEPTS.find(concept => concept.id === conceptSelect.value) || null;
    }

    function updateTopicControls() {
        const curriculumEnabled = curriculumSelect.value === 'mth1w';
        const customTopic = conceptSelect.value === 'custom';

        conceptField.style.display = curriculumEnabled ? '' : 'none';
        topicField.style.display = !curriculumEnabled || customTopic ? '' : 'none';
        topicInput.placeholder = curriculumEnabled && customTopic
            ? 'e.g. quadratic patterns, data literacy, budgeting'
            : 'e.g. World War II, Biology, Math';
    }

    function focusActiveTopicControl() {
        if (curriculumSelect.value === 'mth1w' && conceptSelect.value !== 'custom') {
            conceptSelect.focus();
        } else {
            topicInput.focus();
        }
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

    async function readJsonResponse(response) {
        const raw = await response.text();
        try {
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            const contentType = response.headers.get('content-type') || 'unknown';
            throw {
                error: true,
                status: response.status,
                message: `Expected JSON but received ${contentType}`,
                code: 'NON_JSON_RESPONSE',
                type: 'parse_error',
                requestId: response.headers.get('x-nf-request-id') || response.headers.get('x-request-id') || 'none',
                details: e.message,
                raw: raw.substring(0, 2000),
            };
        }
    }

    function showGenerationError(err) {
        lastError = {
            error: true,
            status: err.status || 0,
            message: err.message || 'Could not generate quiz. Check your connection.',
            code: err.code || 'GENERATION_ERROR',
            type: err.type || 'client_error',
            requestId: err.requestId || 'none',
            details: err.details || '',
            raw: err.raw || '',
            rateLimitRemaining: err.rateLimitRemaining,
            tokenLimitRemaining: err.tokenLimitRemaining,
        };
        errorEl.textContent = `Quiz generation failed: ${lastError.message}`;
        errorDebugBtn.style.display = '';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'license-retry';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', generateQuiz);
        errorEl.appendChild(retryBtn);
    }

    async function generateQuiz() {
        const selectedConcept = curriculumSelect.value === 'mth1w' ? getSelectedConcept() : null;
        const topic = selectedConcept ? selectedConcept.name : topicInput.value.trim();
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
            const payload = {
                topic,
                categories: parseInt(catSlider.value),
                questionsPerCategory: parseInt(qpcSlider.value),
            };

            if (curriculumSelect.value === 'mth1w') {
                payload.curriculum = {
                    curriculum_id: 'ontario',
                    course_code: 'MTH1W',
                    grade: 9,
                    subject_area: 'Mathematics',
                };

                if (selectedConcept) {
                    payload.curriculum.concept_id = selectedConcept.id;
                    payload.curriculum.concept_name = selectedConcept.name;
                }
            }

            const response = await fetch('/.netlify/functions/gen-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await readJsonResponse(response);

            if (!response.ok) {
                showGenerationError(data || {
                    status: response.status,
                    message: response.statusText || 'Failed to generate quiz.',
                    code: 'HTTP_ERROR',
                    type: 'http_error',
                });
                return;
            }

            const quiz = data;
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
        } catch (e) {
            showGenerationError(e);
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
