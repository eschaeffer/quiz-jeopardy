const QuestionReview = (() => {
    const $ = (sel) => document.querySelector(sel);

    let reviewOverlay = null;
    let yoloModal = null;
    let reviewState = null;
    let onConfirm = null;

    function init() {
        createReviewOverlay();
        createYoloModal();
    }

    function createReviewOverlay() {
        reviewOverlay = document.createElement('div');
        reviewOverlay.className = 'review-overlay hidden';
        reviewOverlay.innerHTML = `
            <div class="review-content">
                <div class="review-header">
                    <h2>Review Questions</h2>
                    <p>Remove any questions you don't want. You need at least the required amount per category.</p>
                </div>
                <div class="review-nav">
                    <button class="review-nav-btn" id="review-prev-btn">&larr;</button>
                    <span class="review-category-name" id="review-cat-name"></span>
                    <button class="review-nav-btn" id="review-next-btn">&rarr;</button>
                </div>
                <div class="review-dots" id="review-dots"></div>
                <div class="review-questions" id="review-questions"></div>
                <div class="review-bottom-bar">
                    <div class="review-bottom-left">
                        <button class="review-undo-all-btn" id="review-undo-btn" disabled>Undo Last Removal</button>
                        <span class="review-count" id="review-count"></span>
                    </div>
                    <div class="review-bottom-right">
                        <button class="review-yolo-btn" id="review-yolo-btn">YOLO it (No Review)</button>
                        <button class="btn primary review-start-btn" id="review-start-btn" disabled>Start Game</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('app').appendChild(reviewOverlay);

        $('#review-prev-btn').addEventListener('click', () => navigateCategory(-1));
        $('#review-next-btn').addEventListener('click', () => navigateCategory(1));
        $('#review-undo-btn').addEventListener('click', undoLastRemoval);
        $('#review-yolo-btn').addEventListener('click', showYoloModal);
        $('#review-start-btn').addEventListener('click', () => {
            if (onConfirm) onConfirm(trimAndLoad());
        });
    }

    function createYoloModal() {
        yoloModal = document.createElement('div');
        yoloModal.className = 'yolo-modal-overlay hidden';
        yoloModal.innerHTML = `
            <div class="yolo-modal-content">
                <h3>Skip Review?</h3>
                <p>You are about to skip question review.<br><br>
                There are no guarantees as to the correctness or school-appropriateness of the AI-generated content.<br><br>
                Are you sure?</p>
                <div class="yolo-modal-buttons">
                    <button class="btn secondary" id="yolo-back-btn">Go Back</button>
                    <button class="btn primary" id="yolo-confirm-btn">Yes, Start Game</button>
                </div>
            </div>
        `;
        document.getElementById('app').appendChild(yoloModal);

        $('#yolo-back-btn').addEventListener('click', hideYoloModal);
        $('#yolo-confirm-btn').addEventListener('click', () => {
            hideYoloModal();
            if (onConfirm) onConfirm(trimAndLoad());
        });
    }

    function showYoloModal() {
        yoloModal.classList.remove('hidden');
    }

    function hideYoloModal() {
        yoloModal.classList.add('hidden');
    }

    function startReview(aiData, requiredPerCategory, callback) {
        reviewState = {
            rounds: [
                { name: 'Round 1', categories: aiData.round1?.categories || [] },
                { name: 'Round 2', categories: aiData.round2?.categories || [] },
            ],
            finalShowdown: {
                category: aiData.finalCategory || '',
                clue: aiData.finalClue || '',
                answer: aiData.finalAnswer || '',
                confidence: aiData.finalConfidence || 0.8,
            },
            requiredPerCategory,
            currentRoundIndex: 0,
            removalHistory: [],
        };
        onConfirm = callback;
        renderReview();
        reviewOverlay.classList.remove('hidden');
    }

    function hideReview() {
        reviewOverlay.classList.add('hidden');
        yoloModal.classList.add('hidden');
        reviewState = null;
        onConfirm = null;
    }

    function navigateCategory(direction) {
        const newIdx = reviewState.currentRoundIndex + direction;
        if (newIdx < 0 || newIdx >= reviewState.rounds.length) return;
        reviewState.currentRoundIndex = newIdx;
        renderReview();
    }

    function removeQuestion(roundIndex, catIndex, qIndex) {
        const cat = reviewState.rounds[roundIndex].categories[catIndex];
        const q = cat.questions[qIndex];
        if (!q || q.removed) return;

        q.removed = true;
        reviewState.removalHistory.push({ roundIndex, catIndex, qIndex });
        renderReview();
    }

    function undoLastRemoval() {
        if (reviewState.removalHistory.length === 0) return;
        const last = reviewState.removalHistory.pop();
        const cat = reviewState.rounds[last.roundIndex].categories[last.catIndex];
        if (cat.questions[last.qIndex]) {
            cat.questions[last.qIndex].removed = false;
        }
        renderReview();
    }

    function getRemainingCount(roundIndex, catIndex) {
        const cat = reviewState.rounds[roundIndex].categories[catIndex];
        return cat.questions.filter(q => !q.removed).length;
    }

    function canStartGame() {
        for (let r = 0; r < reviewState.rounds.length; r++) {
            for (let c = 0; c < reviewState.rounds[r].categories.length; c++) {
                if (getRemainingCount(r, c) < reviewState.requiredPerCategory) return false;
            }
        }
        return true;
    }

    function trimAndLoad() {
        const trimmedRounds = reviewState.rounds.map((round, rIdx) => ({
            name: round.name,
            categories: round.categories.map(cat => ({
                name: cat.name,
                questions: cat.questions
                    .filter(q => !q.removed)
                    .slice(0, reviewState.requiredPerCategory)
                    .map((q, j) => ({
                        value: (j + 1) * (rIdx === 0 ? 200 : 400),
                        question: q.question,
                        answer: q.answer,
                    })),
            })),
        }));

        return {
            rounds: trimmedRounds,
            finalShowdown: {
                category: reviewState.finalShowdown.category,
                clue: reviewState.finalShowdown.clue,
                answer: reviewState.finalShowdown.answer,
            },
        };
    }

    const CAT_COLORS = ['#6C3CE1', '#E5553A', '#00B4D8', '#F59E0B', '#10B981', '#EC4899'];

    function getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'high';
        if (confidence >= 0.5) return 'medium';
        return 'low';
    }

    function renderReview() {
        const round = reviewState.rounds[reviewState.currentRoundIndex];
        const totalRounds = reviewState.rounds.length;

        $('#review-cat-name').textContent = `${round.name}`;
        $('#review-prev-btn').disabled = reviewState.currentRoundIndex === 0;
        $('#review-next-btn').disabled = reviewState.currentRoundIndex >= totalRounds - 1;

        const dotsHtml = reviewState.rounds.map((r, i) =>
            `<span class="review-dot ${i === reviewState.currentRoundIndex ? 'active' : ''}"></span>`
        ).join('');
        $('#review-dots').innerHTML = dotsHtml;

        let totalRemaining = 0;
        let totalNeeded = 0;
        let allCardsHtml = '';

        round.categories.forEach((cat, catIdx) => {
            const remaining = getRemainingCount(reviewState.currentRoundIndex, catIdx);
            totalRemaining += remaining;
            totalNeeded += reviewState.requiredPerCategory;

            cat.questions.forEach((q, qIdx) => {
                const isRemoved = q.removed;
                const confClass = getConfidenceClass(q.confidence || 0.8);
                const confLabel = q.confidence ? Math.round(q.confidence * 100) + '%' : '';
                const value = (qIdx + 1) * (reviewState.currentRoundIndex === 0 ? 200 : 400);
                const catColor = CAT_COLORS[catIdx % CAT_COLORS.length];

                allCardsHtml += `
                    <div class="review-question-card ${isRemoved ? 'removed' : ''}" style="border-left: 4px solid ${catColor};">
                        <span class="review-q-value">$${value}</span>
                        <span class="review-q-text"><span style="color:${catColor};font-weight:600;">[${cat.name}]</span> ${q.question} <span style="color:var(--cts-text-muted);">[${q.answer}]</span></span>
                        <span class="review-q-right">
                            <span class="review-confidence ${confClass}">${confLabel}</span>
                            ${isRemoved
                                ? `<button class="review-undo-btn" onclick="QuestionReview.undoQuestion(${reviewState.currentRoundIndex}, ${catIdx}, ${qIdx})">&#8617;</button>`
                                : `<button class="review-remove-btn" onclick="QuestionReview.removeQ(${reviewState.currentRoundIndex}, ${catIdx}, ${qIdx})">&times;</button>`
                            }
                        </span>
                    </div>
                `;
            });
        });

        $('#review-questions').innerHTML = allCardsHtml;

        const countEl = $('#review-count');
        countEl.textContent = `Questions: ${totalRemaining}/${totalNeeded} needed`;
        countEl.className = `review-count ${totalRemaining >= totalNeeded ? 'ok' : 'warning'}`;

        const canStart = canStartGame();
        $('#review-start-btn').disabled = !canStart;
        $('#review-undo-btn').disabled = reviewState.removalHistory.length === 0;
    }

    function removeQ(roundIdx, catIdx, qIdx) {
        removeQuestion(roundIdx, catIdx, qIdx);
    }

    function undoQuestion(roundIdx, catIdx, qIdx) {
        const cat = reviewState.rounds[roundIdx].categories[catIdx];
        if (cat.questions[qIdx]) {
            cat.questions[qIdx].removed = false;
            reviewState.removalHistory = reviewState.removalHistory.filter(
                r => !(r.roundIndex === roundIdx && r.catIndex === catIdx && r.qIndex === qIdx)
            );
        }
        renderReview();
    }

    return {
        init,
        startReview,
        hideReview,
        removeQ,
        undoQuestion,
    };
})();
