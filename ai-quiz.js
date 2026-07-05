const AIQuizGenerator = (() => {
    const $ = (sel) => document.querySelector(sel);
    const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-5.4';
    const DEV_OPENROUTER_MODELS = [
        { value: 'openai/gpt-5.4', label: 'OpenAI GPT-5.4' },
        { value: 'openai/gpt-5.4-mini', label: 'OpenAI GPT-5.4 Mini' },
        { value: 'anthropic/claude-sonnet-4', label: 'Anthropic Claude Sonnet 4' },
        { value: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
        { value: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
        { value: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
        { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
    ];
    const STAGED_REQUEST_CONCURRENCY = 2;

    let modal = null;
    let curriculumSelect = null;
    let courseField = null;
    let courseSelect = null;
    let focusAreaField = null;
    let focusAreaSelect = null;
    let narrowTopicField = null;
    let narrowTopicInput = null;
    let triviaTopicField = null;
    let triviaTopicInput = null;
    let catSlider = null;
    let qpcSlider = null;
    let catDisplay = null;
    let qpcDisplay = null;
    let modelField = null;
    let modelSelect = null;
    let generateBtn = null;
    let errorEl = null;
    let loadingEl = null;
    let loadingTextEl = null;
    let errorDebugBtn = null;
    let warningEl = null;
    let curriculumDebugEl = null;
    let devSummaryEl = null;
    let creditStatusEl = null;
    let refillField = null;
    let refillInput = null;
    let refillBtn = null;
    let currentCreditBalance = null;
    let lastError = null;
    let debugModal = null;
    let curriculumMeta = [];
    let curriculumMetaPromise = null;
    let curriculumMetaLoadedAt = 0;
    let curriculumMetaDebug = null;

    function isDevModelSelectionEnabled() {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }

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
                <p>Choose a curriculum path or generate a general trivia quiz.</p>
                <div class="ai-modal-field">
                    <label for="ai-curriculum">Curriculum</label>
                    <select id="ai-curriculum">
                        <option value="">None</option>
                    </select>
                    <p class="ai-modal-help">Select None for a general trivia quiz, or choose a curriculum path to align the questions.</p>
                </div>
                <div class="ai-modal-field" id="ai-course-field" style="display:none;">
                    <label for="ai-course">Course</label>
                    <select id="ai-course"></select>
                </div>
                <div class="ai-modal-field" id="ai-focus-area-field" style="display:none;">
                    <label for="ai-focus-area">Focus Area</label>
                    <select id="ai-focus-area"></select>
                    <p class="ai-modal-help">Choose the broad topic area from the selected course.</p>
                </div>
                <div class="ai-modal-field" id="ai-narrow-topic-field" style="display:none;">
                    <label for="ai-narrow-topic">Topic (Narrow)</label>
                    <input type="text" id="ai-narrow-topic" placeholder="Optional narrower focus within the selected area">
                    <p class="ai-modal-help">Optional. Further narrows the selected focus area if it is a good match.</p>
                </div>
                <div class="ai-modal-field" id="ai-trivia-topic-field">
                    <label for="ai-trivia-topic">Trivia Topic</label>
                    <input type="text" id="ai-trivia-topic" placeholder="e.g. World War II, Biology, Math">
                </div>
                <div class="ai-modal-field">
                    <label>Categories per round: <span id="ai-cat-display">3</span></label>
                    <input type="range" id="ai-cat-slider" min="3" max="6" value="3">
                </div>
                <div class="ai-modal-field">
                    <label>Questions per category: <span id="ai-qpc-display">3</span></label>
                    <input type="range" id="ai-qpc-slider" min="3" max="5" value="3">
                </div>
                <div class="ai-modal-field" id="ai-model-field" style="display:none;">
                    <label for="ai-model">OpenRouter Model</label>
                    <select id="ai-model"></select>
                    <p class="ai-modal-help">Development-only model selector for local comparison testing.</p>
                </div>
                <div id="ai-curriculum-debug" class="ai-modal-help" style="display:none;"></div>
                <div id="ai-dev-summary" class="ai-modal-help" style="display:none;"></div>
                <div id="ai-credit-status" class="ai-modal-help" style="display:none;"></div>
                <div class="ai-modal-field" id="ai-refill-field" style="display:none;">
                    <label for="ai-refill-key">Refill Key</label>
                    <div class="license-input-group">
                        <input type="text" id="ai-refill-key" placeholder="Enter refill key" maxlength="32" autocomplete="off">
                        <button id="ai-refill-btn" class="btn secondary" type="button">Redeem</button>
                    </div>
                </div>
                <div id="ai-warning" class="ai-modal-help" style="display:none;color:var(--cts-accent);"></div>
                <button id="ai-generate-btn" class="btn primary">Generate Quiz</button>
                <div id="ai-loading" style="display:none;">
                    <span class="license-spinner"></span> <span id="ai-loading-text">Generating quiz...</span>
                </div>
                <div id="ai-error" class="license-error"></div>
                <button id="ai-debug-btn" class="license-retry" style="display:none;">Copy Debug Info</button>
            </div>
        `;
        document.getElementById('app').appendChild(modal);

        curriculumSelect = modal.querySelector('#ai-curriculum');
        courseField = modal.querySelector('#ai-course-field');
        courseSelect = modal.querySelector('#ai-course');
        focusAreaField = modal.querySelector('#ai-focus-area-field');
        focusAreaSelect = modal.querySelector('#ai-focus-area');
        narrowTopicField = modal.querySelector('#ai-narrow-topic-field');
        narrowTopicInput = modal.querySelector('#ai-narrow-topic');
        triviaTopicField = modal.querySelector('#ai-trivia-topic-field');
        triviaTopicInput = modal.querySelector('#ai-trivia-topic');
        catSlider = modal.querySelector('#ai-cat-slider');
        qpcSlider = modal.querySelector('#ai-qpc-slider');
        catDisplay = modal.querySelector('#ai-cat-display');
        qpcDisplay = modal.querySelector('#ai-qpc-display');
        modelField = modal.querySelector('#ai-model-field');
        modelSelect = modal.querySelector('#ai-model');
        generateBtn = modal.querySelector('#ai-generate-btn');
        errorEl = modal.querySelector('#ai-error');
        loadingEl = modal.querySelector('#ai-loading');
        loadingTextEl = modal.querySelector('#ai-loading-text');
        errorDebugBtn = modal.querySelector('#ai-debug-btn');
        curriculumDebugEl = modal.querySelector('#ai-curriculum-debug');
        devSummaryEl = modal.querySelector('#ai-dev-summary');
        creditStatusEl = modal.querySelector('#ai-credit-status');
        refillField = modal.querySelector('#ai-refill-field');
        refillInput = modal.querySelector('#ai-refill-key');
        refillBtn = modal.querySelector('#ai-refill-btn');
        warningEl = modal.querySelector('#ai-warning');
        populateModelOptions();

        catSlider.addEventListener('input', () => { catDisplay.textContent = catSlider.value; });
        qpcSlider.addEventListener('input', () => { qpcDisplay.textContent = qpcSlider.value; });
        curriculumSelect.addEventListener('change', updateSelectionFlow);
        courseSelect.addEventListener('change', updateSelectionFlow);
        focusAreaSelect.addEventListener('change', updateSelectionFlow);

        modal.querySelector('.ai-modal-close').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        generateBtn.addEventListener('click', generateQuiz);
        triviaTopicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateQuiz(); });
        narrowTopicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') generateQuiz(); });
        refillBtn.addEventListener('click', redeemRefillCredits);
        refillInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') redeemRefillCredits(); });
        errorDebugBtn.addEventListener('click', showDebugModal);
    }

    function populateModelOptions() {
        if (!modelField || !modelSelect) return;
        if (!isDevModelSelectionEnabled()) {
            modelField.style.display = 'none';
            modelSelect.innerHTML = '';
            return;
        }

        modelSelect.innerHTML = DEV_OPENROUTER_MODELS
            .map((model) => `<option value="${model.value}">${model.label}</option>`)
            .join('');
        modelSelect.value = DEFAULT_OPENROUTER_MODEL;
        modelField.style.display = '';
    }

    function getSelectedModel() {
        if (!isDevModelSelectionEnabled() || !modelSelect?.value) {
            return DEFAULT_OPENROUTER_MODEL;
        }
        return modelSelect.value;
    }

    function formatGenerationCostSummary(generationMetadata) {
        const usage = generationMetadata?.usage;
        if (!usage || !Number.isFinite(Number(usage.total_cost_usd))) return '';

        const cost = Number(usage.total_cost_usd).toFixed(4);
        const totalTokens = Number(usage.total_tokens || 0).toLocaleString();
        const model = generationMetadata?.resolved_model || generationMetadata?.requested_model || getSelectedModel();
        return `Generation cost: $${cost} | ${totalTokens} tokens | ${model}`;
    }

    function showDevGenerationSummary(generationMetadata) {
        if (!isDevModelSelectionEnabled() || !devSummaryEl) return false;
        const text = formatGenerationCostSummary(generationMetadata);
        if (!text) return false;
        devSummaryEl.textContent = text;
        devSummaryEl.style.display = '';
        return true;
    }

    function setGenerationControlsDisabled(disabled) {
        [
            curriculumSelect,
            courseSelect,
            focusAreaSelect,
            narrowTopicInput,
            triviaTopicInput,
            catSlider,
            qpcSlider,
            modelSelect,
            generateBtn,
        ].forEach((control) => {
            if (control) control.disabled = !!disabled;
        });
    }

    function renderCreditStatus(balance, message = '') {
        currentCreditBalance = balance || null;
        if (!creditStatusEl) return;

        if (!balance && !message) {
            creditStatusEl.textContent = '';
            creditStatusEl.style.display = 'none';
            return;
        }

        if (message) {
            creditStatusEl.textContent = message;
            creditStatusEl.style.display = '';
            return;
        }

        if (balance.is_unlimited) {
            creditStatusEl.textContent = 'Dev key: unlimited generations';
            creditStatusEl.style.display = '';
            return;
        }

        const remaining = Number(balance.credits_remaining || 0);
        const total = Number(balance.credits_total || 0);
        const lowWarning = remaining <= 5 ? ` Only ${remaining} generations remaining.` : '';
        creditStatusEl.textContent = `Generations remaining: ${remaining}${total ? ` of ${total}` : ''}.${lowWarning}`;
        creditStatusEl.style.display = '';
    }

    function applyCreditGate(balance) {
        const exhausted = !!balance && !balance.is_unlimited && Number(balance.credits_remaining || 0) <= 0;
        setGenerationControlsDisabled(exhausted);
        if (refillField) {
            refillField.style.display = exhausted ? '' : 'none';
        }
        if (exhausted) {
            renderCreditStatus(balance, 'No quiz generations remaining. Enter a refill key to continue.');
        } else {
            renderCreditStatus(balance);
        }
    }

    async function fetchCreditBalance() {
        const licenseKey = LicenseManager.getKey();
        if (!licenseKey) {
            throw new Error('No active license key found.');
        }
        return postJson('/.netlify/functions/check-credits', { license_key: licenseKey });
    }

    async function redeemRefillCredits() {
        const refillKey = refillInput?.value?.trim();
        const licenseKey = LicenseManager.getKey();
        if (!refillKey || !licenseKey) {
            errorEl.textContent = 'Please enter a refill key.';
            return;
        }

        errorEl.textContent = '';
        setLoading(true, 'Redeeming refill key...');

        try {
            const result = await postJson('/.netlify/functions/refill-credits', {
                licenseKey,
                refillKey,
            });
            refillInput.value = '';
            applyCreditGate({
                ...(currentCreditBalance || {}),
                credits_remaining: result.credits_remaining,
                credits_total: result.credits_total,
                tier_name: result.tier_name || currentCreditBalance?.tier_name,
            });
        } catch (error) {
            errorEl.textContent = error.message || 'Could not redeem refill key.';
        } finally {
            setLoading(false);
        }
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

    async function ensureCurriculumMetaLoaded(forceReload = false) {
        const isFresh = curriculumMeta.length > 0 && (Date.now() - curriculumMetaLoadedAt) < 300000;
        if (!forceReload && isFresh) return curriculumMeta;
        if (!curriculumMetaPromise) {
            curriculumMetaPromise = fetch(`/.netlify/functions/curriculum-meta?t=${Date.now()}`, { cache: 'no-store' })
                .then(async (response) => {
                    const data = await readJsonResponse(response);
                    if (!response.ok) {
                        throw data || new Error('Could not load curriculum metadata.');
                    }
                    curriculumMeta = data?.curricula || [];
                    curriculumMetaDebug = data?.debug || null;
                    curriculumMetaLoadedAt = Date.now();
                    return curriculumMeta;
                })
                .finally(() => {
                    curriculumMetaPromise = null;
                });
        }
        return curriculumMetaPromise;
    }

    function populateCurriculumOptions() {
        const currentValue = curriculumSelect.value;
        const options = ['<option value="">None</option>']
            .concat(curriculumMeta.map((curriculum) => `<option value="${curriculum.id}">${curriculum.label}</option>`));
        curriculumSelect.innerHTML = options.join('');
        curriculumSelect.value = currentValue;
    }

    function renderCurriculumDebugInfo() {
        if (!curriculumDebugEl) return;
        if (!curriculumMetaDebug?.version) {
            curriculumDebugEl.textContent = '';
            curriculumDebugEl.style.display = 'none';
            return;
        }

        const courses = Array.isArray(curriculumMetaDebug.course_codes) ? curriculumMetaDebug.course_codes.join(', ') : 'unknown';
        curriculumDebugEl.textContent = `Curriculum data: ${curriculumMetaDebug.version} | Courses: ${courses}`;
        curriculumDebugEl.style.display = '';
    }

    function populateCourseOptions(curriculum, preferredCourseCode = '') {
        const options = (curriculum?.courses || []).map((course) => (
            `<option value="${course.course_code}">${course.label}</option>`
        ));
        const nextValue = preferredCourseCode || courseSelect.value;
        courseSelect.innerHTML = options.join('');
        if (nextValue && (curriculum?.courses || []).some((course) => course.course_code === nextValue)) {
            courseSelect.value = nextValue;
        } else if (options.length > 0) {
            courseSelect.value = curriculum.courses[0].course_code;
        }
    }

    function populateFocusAreaOptions(course, preferredFocusAreaId = '') {
        const options = (course?.focus_areas || []).map((focusArea) => (
            `<option value="${focusArea.id}">${focusArea.name}</option>`
        ));
        const nextValue = preferredFocusAreaId || focusAreaSelect.value;
        focusAreaSelect.innerHTML = options.join('');
        if (nextValue && (course?.focus_areas || []).some((focusArea) => focusArea.id === nextValue)) {
            focusAreaSelect.value = nextValue;
        } else if (options.length > 0) {
            focusAreaSelect.value = course.focus_areas[0].id;
        }
    }

    function getSelectedCurriculum() {
        return curriculumMeta.find((curriculum) => curriculum.id === curriculumSelect.value) || null;
    }

    function getSelectedCourse() {
        const curriculum = getSelectedCurriculum();
        return curriculum?.courses?.find((course) => course.course_code === courseSelect.value) || null;
    }

    function getSelectedFocusArea() {
        const course = getSelectedCourse();
        return course?.focus_areas?.find((focusArea) => focusArea.id === focusAreaSelect.value) || null;
    }

    function updateSelectionFlow(event) {
        const changedControl = event?.target?.id || '';
        const selectedCurriculum = getSelectedCurriculum();

        if (!selectedCurriculum) {
            courseField.style.display = 'none';
            focusAreaField.style.display = 'none';
            narrowTopicField.style.display = 'none';
            triviaTopicField.style.display = '';
            triviaTopicInput.placeholder = 'e.g. World War II, Biology, Math';
            courseSelect.innerHTML = '';
            focusAreaSelect.innerHTML = '';
            return;
        }

        const preferredCourseCode = changedControl === 'ai-curriculum' ? '' : courseSelect.value;
        courseField.style.display = '';
        populateCourseOptions(selectedCurriculum, preferredCourseCode);

        const selectedCourse = getSelectedCourse();
        if (!selectedCourse) {
            focusAreaField.style.display = 'none';
            narrowTopicField.style.display = 'none';
            triviaTopicField.style.display = 'none';
            focusAreaSelect.innerHTML = '';
            return;
        }

        const preferredFocusAreaId = changedControl === 'ai-course' || changedControl === 'ai-curriculum'
            ? ''
            : focusAreaSelect.value;
        focusAreaField.style.display = '';
        populateFocusAreaOptions(selectedCourse, preferredFocusAreaId);

        const selectedFocusArea = getSelectedFocusArea();
        narrowTopicField.style.display = selectedFocusArea ? '' : 'none';
        triviaTopicField.style.display = 'none';
    }

    function focusActiveControl() {
        if (currentCreditBalance && !currentCreditBalance.is_unlimited && Number(currentCreditBalance.credits_remaining || 0) <= 0) {
            refillInput?.focus();
            return;
        }
        const selectedCurriculum = getSelectedCurriculum();
        if (!selectedCurriculum) {
            triviaTopicInput.focus();
            return;
        }
        const selectedCourse = getSelectedCourse();
        if (!selectedCourse) {
            courseSelect.focus();
            return;
        }
        const selectedFocusArea = getSelectedFocusArea();
        if (!selectedFocusArea) {
            focusAreaSelect.focus();
            return;
        }
        narrowTopicInput.focus();
    }

    function showDebugModal() {
        debugModal.classList.remove('hidden');
    }

    function hideDebugModal() {
        debugModal.classList.add('hidden');
    }

    function getActiveTopicSummary() {
        const selectedCurriculum = getSelectedCurriculum();
        const selectedCourse = getSelectedCourse();
        const selectedFocusArea = getSelectedFocusArea();
        if (!selectedCurriculum) {
            return {
                curriculum: 'None',
                course: 'N/A',
                focusArea: 'N/A',
                narrowTopic: 'N/A',
                triviaTopic: triviaTopicInput?.value?.trim() || 'unknown',
            };
        }

        return {
            curriculum: selectedCurriculum.label,
            course: selectedCourse?.label || 'unknown',
            focusArea: selectedFocusArea?.name || 'unknown',
            narrowTopic: narrowTopicInput?.value?.trim() || 'none',
            triviaTopic: 'N/A',
        };
    }

    function copyDebugInfo(mode) {
        if (!lastError) return;

        const topicSummary = getActiveTopicSummary();
        const curriculumDebug = curriculumMetaDebug?.version || 'unknown';
        const selectedModel = getSelectedModel();
        let text;
        if (mode === 'summary') {
            text = `Quiz generation failed: ${lastError.message} (Code: ${lastError.code}, Status: ${lastError.status}, Curriculum Data: ${curriculumDebug}, Model: ${selectedModel})`;
        } else {
            text = `=== Classroom Trivia Showdown - Debug Info ===
Timestamp: ${new Date().toISOString()}
Curriculum Data Version: ${curriculumDebug}
Curriculum: ${topicSummary.curriculum}
Course: ${topicSummary.course}
Focus Area: ${topicSummary.focusArea}
Topic (Narrow): ${topicSummary.narrowTopic}
Trivia Topic: ${topicSummary.triviaTopic}
Categories: ${catSlider?.value || 'unknown'}
Questions per category: ${qpcSlider?.value || 'unknown'}
Requested Model: ${selectedModel}
Resolved Model: ${lastError.model || 'unknown'}

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

    async function openModal() {
        modal.classList.remove('hidden');
        triviaTopicInput.value = '';
        narrowTopicInput.value = '';
        curriculumSelect.value = '';
        courseSelect.innerHTML = '';
        focusAreaSelect.innerHTML = '';
        catSlider.value = '3';
        qpcSlider.value = '3';
        catDisplay.textContent = '3';
        qpcDisplay.textContent = '3';
        if (modelSelect) {
            modelSelect.value = DEFAULT_OPENROUTER_MODEL;
        }
        if (refillInput) {
            refillInput.value = '';
        }
        warningEl.textContent = '';
        warningEl.style.display = 'none';
        curriculumDebugEl.textContent = '';
        curriculumDebugEl.style.display = 'none';
        if (devSummaryEl) {
            devSummaryEl.textContent = '';
            devSummaryEl.style.display = 'none';
        }
        renderCreditStatus(null);
        setGenerationControlsDisabled(false);
        if (refillField) {
            refillField.style.display = 'none';
        }
        errorEl.textContent = '';
        loadingEl.style.display = 'none';
        errorDebugBtn.style.display = 'none';
        lastError = null;

        try {
            await ensureCurriculumMetaLoaded(true);
            populateCurriculumOptions();
            renderCurriculumDebugInfo();
            applyCreditGate(await fetchCreditBalance());
        } catch (error) {
            errorEl.textContent = error.message || 'Could not load curriculum metadata.';
            return;
        }

        updateSelectionFlow();
        focusActiveControl();
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

    function setLoadingMessage(message) {
        if (loadingTextEl) {
            loadingTextEl.textContent = message || 'Generating quiz...';
        }
    }

    function setLoading(loading, message = 'Generating quiz...') {
        if (loading) {
            setLoadingMessage(message);
        }
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

    async function postJson(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await readJsonResponse(response);
        if (!response.ok) {
            throw data || {
                status: response.status,
                message: response.statusText || 'Request failed.',
                code: 'HTTP_ERROR',
                type: 'http_error',
            };
        }
        return data;
    }

    async function runWithConcurrency(items, limit, worker) {
        const results = new Array(items.length);
        let nextIndex = 0;

        async function runWorker() {
            while (nextIndex < items.length) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                results[currentIndex] = await worker(items[currentIndex], currentIndex);
            }
        }

        const workerCount = Math.max(1, Math.min(limit, items.length));
        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
        return results;
    }

    async function generateRoundCategories(roundName, categories, setup) {
        let completed = 0;
        setLoadingMessage(`Generating ${roundName} categories (0/${categories.length})...`);
        return runWithConcurrency(categories, STAGED_REQUEST_CONCURRENCY, async (category) => {
            const result = await postJson('/.netlify/functions/gen-quiz-generate-category', {
                model: setup.resolved_model,
                topic: setup.generationTopic,
                roundName,
                category,
                questionsPerCategory: setup.questionsPerCategory,
                curriculumPrompt: setup.curriculumPrompt,
            });
            completed += 1;
            setLoadingMessage(`Generating ${roundName} categories (${completed}/${categories.length})...`);
            return result;
        });
    }

    async function verifyRoundCategories(roundName, generatedCategories, setup) {
        let completed = 0;
        setLoadingMessage(`Verifying ${roundName} categories (0/${generatedCategories.length})...`);
        return runWithConcurrency(generatedCategories, STAGED_REQUEST_CONCURRENCY, async (category) => {
            const result = await postJson('/.netlify/functions/gen-quiz-verify-category', {
                model: setup.resolved_model,
                topic: setup.generationTopic,
                roundName,
                categoryName: category.name,
                subjectFamily: setup.subjectFamily,
                curriculumPrompt: setup.curriculumPrompt,
                generatedCategory: category,
            });
            completed += 1;
            setLoadingMessage(`Verifying ${roundName} categories (${completed}/${generatedCategories.length})...`);
            return result;
        });
    }

    async function generateQuizStaged(payload) {
        setLoadingMessage('Planning categories...');
        const setup = await postJson('/.netlify/functions/gen-quiz-init', payload);
        const round1 = await generateRoundCategories('Round 1', setup.categoryPlan.round1 || [], setup);
        const round2 = await generateRoundCategories('Round 2', setup.categoryPlan.round2 || [], setup);
        setLoadingMessage('Generating Final Showdown...');
        const finalData = await postJson('/.netlify/functions/gen-quiz-generate-final', {
            model: setup.resolved_model,
            topic: setup.topic,
            subjectFamily: setup.subjectFamily,
            curriculumPrompt: setup.curriculumPrompt,
        });
        const round1Verification = await verifyRoundCategories('Round 1', round1, setup);
        const round2Verification = await verifyRoundCategories('Round 2', round2, setup);
        setLoadingMessage('Verifying Final Showdown...');
        const finalVerification = await postJson('/.netlify/functions/gen-quiz-verify-final', {
            model: setup.resolved_model,
            topic: setup.generationTopic,
            subjectFamily: setup.subjectFamily,
            curriculumPrompt: setup.curriculumPrompt,
            generatedFinal: finalData,
        });
        setLoadingMessage('Assembling quiz...');
        return postJson('/.netlify/functions/gen-quiz-assemble', {
            setup,
            round1,
            round2,
            finalData,
            round1Verification,
            round2Verification,
            finalVerification,
        });
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
            model: err.model || '',
            rateLimitRemaining: err.rateLimitRemaining,
            tokenLimitRemaining: err.tokenLimitRemaining,
        };

        if (lastError.code === 'GENERATIONS_EXHAUSTED' || err.errorType === 'GENERATIONS_EXHAUSTED') {
            applyCreditGate({
                ...(currentCreditBalance || {}),
                credits_remaining: Number(err.credits_remaining || 0),
            });
            errorEl.textContent = lastError.message;
            errorDebugBtn.style.display = 'none';
            return;
        }

        errorEl.textContent = `Quiz generation failed: ${lastError.message}`;
        errorDebugBtn.style.display = '';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'license-retry';
        retryBtn.textContent = 'Retry';
        retryBtn.addEventListener('click', generateQuiz);
        errorEl.appendChild(retryBtn);
    }

    function buildGenerationPayload() {
        const selectedCurriculum = getSelectedCurriculum();
        const payload = {
            categories: parseInt(catSlider.value),
            questionsPerCategory: parseInt(qpcSlider.value),
            license_key: LicenseManager.getKey(),
        };

        if (!payload.license_key) {
            throw new Error('Please activate your license first.');
        }

        if (isDevModelSelectionEnabled()) {
            payload.model = getSelectedModel();
        }

        if (!selectedCurriculum) {
            const triviaTopic = triviaTopicInput.value.trim();
            if (!triviaTopic) {
                throw new Error('Please enter a trivia topic.');
            }
            payload.topic = triviaTopic;
            return payload;
        }

        const selectedCourse = getSelectedCourse();
        if (!selectedCourse) {
            throw new Error('Please choose a course.');
        }

        const selectedFocusArea = getSelectedFocusArea();
        if (!selectedFocusArea) {
            throw new Error('Please choose a focus area.');
        }

        payload.topic = selectedFocusArea.name;
        payload.curriculum = {
            curriculum_id: selectedCurriculum.id,
            curriculum_label: selectedCurriculum.label,
            course_code: selectedCourse.course_code,
            grade: selectedCourse.grade,
            subject_area: selectedCourse.subject_area,
            concept_id: selectedFocusArea.id,
            concept_name: selectedFocusArea.name,
            concept_description: selectedFocusArea.description,
            narrow_topic: narrowTopicInput.value.trim(),
        };
        return payload;
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function generateQuiz() {
        let payload;
        try {
            payload = buildGenerationPayload();
        } catch (error) {
            errorEl.textContent = error.message;
            errorDebugBtn.style.display = 'none';
            return;
        }

        setLoading(true, 'Planning categories...');
        warningEl.textContent = '';
        warningEl.style.display = 'none';
        if (devSummaryEl) {
            devSummaryEl.textContent = '';
            devSummaryEl.style.display = 'none';
        }
        errorEl.textContent = '';
        errorDebugBtn.style.display = 'none';
        lastError = null;

        try {
            const quiz = await generateQuizStaged(payload);
            const qPerCat = parseInt(qpcSlider.value);
            applyCreditGate(quiz.credit_balance || currentCreditBalance);

            if (quiz.hasMath && window.MathJaxLoader) {
                await window.MathJaxLoader.ensureLoaded();
            }

            setLoading(false);

            const showedDevSummary = showDevGenerationSummary(quiz.generationMetadata);
            if (showedDevSummary) {
                await wait(1800);
            }

            const narrowTopicWarning = quiz.curriculumContext?.narrow_topic?.warning;
            if (narrowTopicWarning) {
                warningEl.textContent = narrowTopicWarning;
                warningEl.style.display = '';
                await wait(1400);
            }

            closeModal();

            const fileLabel = payload.curriculum
                ? `${payload.curriculum.course_code}: ${payload.curriculum.concept_name}`
                : payload.topic;

            QuestionReview.startReview(quiz, qPerCat, (trimmedData) => {
                QuestionReview.hideReview();
                if (typeof JeopardyGame !== 'undefined' && JeopardyGame.validateAndStoreData) {
                    JeopardyGame.validateAndStoreData(trimmedData);
                    const fileNameEl = document.getElementById('file-name');
                    if (fileNameEl) fileNameEl.textContent = `AI Generated: ${fileLabel}`;
                }
            });
        } catch (e) {
            showGenerationError(e);
        } finally {
            if (loadingEl.style.display !== 'none') {
                setLoading(false);
            }
        }
    }

    return { init, openModal };
})();
