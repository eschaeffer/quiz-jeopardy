const QuestionReview = (() => {
    const $ = (sel) => document.querySelector(sel);

    let reviewOverlay = null;
    let yoloModal = null;
    let reviewState = null;
    let onConfirm = null;

    const CAT_COLORS = ['#6C3CE1', '#E5553A', '#00B4D8', '#F59E0B', '#10B981', '#EC4899'];

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
                <div class="review-bank-count" id="review-bank-count"></div>
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
        const r1 = aiData.round1?.categories || [];
        const r2 = aiData.round2?.categories || [];

        const pages = [];
        r1.forEach((cat, i) => {
            const active = cat.questions.slice(0, requiredPerCategory);
            const bank = cat.questions.slice(requiredPerCategory);
            pages.push({ type: 'category', roundIndex: 0, catIndex: i, name: cat.name, active, bank });
        });
        r2.forEach((cat, i) => {
            const active = cat.questions.slice(0, requiredPerCategory);
            const bank = cat.questions.slice(requiredPerCategory);
            pages.push({ type: 'category', roundIndex: 1, catIndex: i, name: cat.name, active, bank });
        });

        pages.push({
            type: 'final',
            question: {
                question: aiData.finalClue || '',
                answer: aiData.finalAnswer || '',
                confidence: aiData.finalConfidence || 0.8,
            },
            name: 'Final Showdown',
        });

        reviewState = {
            pages,
            requiredPerCategory,
            currentPageIndex: 0,
            removalHistory: [],
            finalRemoved: false,
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
        const newIdx = reviewState.currentPageIndex + direction;
        if (newIdx < 0 || newIdx >= reviewState.pages.length) return;
        reviewState.currentPageIndex = newIdx;
        renderReview();
    }

    function removeQuestion(pageIndex, qIndex) {
        const page = reviewState.pages[pageIndex];
        if (page.type === 'final') {
            page.question.removed = true;
            reviewState.finalRemoved = true;
            reviewState.removalHistory.push({ pageIndex, qIndex: 0, type: 'final' });
            renderReview();
            return;
        }

        const q = page.active[qIndex];
        if (!q || q.removed) return;

        let bankQ = null;
        if (page.bank.length > 0) {
            bankQ = page.bank.shift();
            page.active.splice(qIndex, 1, bankQ);
        } else {
            q.removed = true;
        }

        reviewState.removalHistory.push({ pageIndex, qIndex, removed: q, bankQ });
        renderReview();
    }

    function undoLastRemoval() {
        if (reviewState.removalHistory.length === 0) return;
        const last = reviewState.removalHistory.pop();
        const page = reviewState.pages[last.pageIndex];

        if (last.type === 'final') {
            page.question.removed = false;
            reviewState.finalRemoved = false;
            renderReview();
            return;
        }

        if (last.bankQ) {
            const bankIdx = page.active.findIndex(q => q === last.bankQ);
            if (bankIdx >= 0) {
                page.active.splice(bankIdx, 1, last.removed);
                page.bank.unshift(last.bankQ);
            }
        } else if (page.active[last.qIndex]) {
            page.active[last.qIndex].removed = false;
        }
        renderReview();
    }

    function getBankCount(pageIndex) {
        const page = reviewState.pages[pageIndex];
        return page.type === 'final' ? -1 : page.bank.length;
    }

    function canStartGame() {
        for (const page of reviewState.pages) {
            if (page.type === 'final') {
                if (!page.question.removed) continue;
                return false;
            }
            const remaining = page.active.filter(q => !q.removed).length;
            if (remaining < reviewState.requiredPerCategory) return false;
        }
        return true;
    }

    function getDollarValue(pageIndex, qIndex) {
        const page = reviewState.pages[pageIndex];
        if (page.type === 'final') return 'Final';

        const isRound2 = page.roundIndex === 1;
        const multiplier = isRound2 ? 400 : 200;
        return (qIndex + 1) * multiplier;
    }

    function trimAndLoad() {
        const r1Pages = reviewState.pages.filter(p => p.type === 'category' && p.roundIndex === 0);
        const r2Pages = reviewState.pages.filter(p => p.type === 'category' && p.roundIndex === 1);

        const buildRound = (name, pages, multiplier) => ({
            name,
            categories: pages.map(page => ({
                name: page.name,
                questions: page.active
                    .filter(q => !q.removed)
                    .slice(0, reviewState.requiredPerCategory)
                    .map((q, j) => ({
                        value: (j + 1) * multiplier,
                        question: q.question,
                        answer: q.answer,
                    })),
            })),
        });

        const finalPage = reviewState.pages.find(p => p.type === 'final');

        return {
            rounds: [
                buildRound('Round 1', r1Pages, 200),
                buildRound('Round 2', r2Pages, 400),
            ],
            finalShowdown: finalPage && !reviewState.finalRemoved ? {
                category: 'Final Showdown',
                clue: finalPage.question.question,
                answer: finalPage.question.answer,
            } : null,
        };
    }

    function getConfidenceClass(confidence) {
        if (confidence >= 0.8) return 'high';
        if (confidence >= 0.5) return 'medium';
        return 'low';
    }

    function renderReview() {
        const page = reviewState.pages[reviewState.currentPageIndex];
        const totalPages = reviewState.pages.length;

        $('#review-cat-name').textContent = page.name;
        $('#review-prev-btn').disabled = reviewState.currentPageIndex === 0;
        $('#review-next-btn').disabled = reviewState.currentPageIndex >= totalPages - 1;

        const dotsHtml = reviewState.pages.map((p, i) =>
            `<span class="review-dot ${i === reviewState.currentPageIndex ? 'active' : ''}"></span>`
        ).join('');
        $('#review-dots').innerHTML = dotsHtml;

        const bankCount = getBankCount(reviewState.currentPageIndex);
        const bankEl = $('#review-bank-count');
        if (bankCount >= 0) {
            bankEl.textContent = bankCount > 0 ? `Bank: ${bankCount} questions remaining` : 'No more replacements';
            bankEl.style.display = '';
        } else {
            bankEl.style.display = 'none';
        }

        let allCardsHtml = '';

        if (page.type === 'final') {
            const q = page.question;
            const isRemoved = q.removed;
            const confClass = getConfidenceClass(q.confidence || 0.8);
            const confLabel = q.confidence ? Math.round(q.confidence * 100) + '%' : '';

            allCardsHtml = `
                <div class="review-question-card ${isRemoved ? 'removed' : ''}" style="border-left: 4px solid var(--cts-accent);">
                    <span class="review-q-value" style="color:var(--cts-accent);">Final</span>
                    <span class="review-q-text">${q.question} <span style="color:var(--cts-text-muted);">[${q.answer}]</span></span>
                    <span class="review-q-right">
                        <span class="review-confidence ${confClass}">${confLabel}</span>
                        ${isRemoved
                            ? `<button class="review-undo-btn" onclick="QuestionReview.undoQuestion(${reviewState.currentPageIndex}, 0)">&#8617;</button>`
                            : `<button class="review-remove-btn" onclick="QuestionReview.removeQ(${reviewState.currentPageIndex}, 0)">&times;</button>`
                        }
                    </span>
                </div>
            `;
        } else {
            page.active.forEach((q, qIdx) => {
                const isRemoved = q.removed;
                const confClass = getConfidenceClass(q.confidence || 0.8);
                const confLabel = q.confidence ? Math.round(q.confidence * 100) + '%' : '';
                const value = getDollarValue(reviewState.currentPageIndex, qIdx);
                const catColor = CAT_COLORS[page.catIndex % CAT_COLORS.length];

                allCardsHtml += `
                    <div class="review-question-card ${isRemoved ? 'removed' : ''}" style="border-left: 4px solid ${catColor};">
                        <span class="review-q-value">$${value}</span>
                        <span class="review-q-text"><span style="color:${catColor};font-weight:600;">[${page.name}]</span> ${q.question} <span style="color:var(--cts-text-muted);">[${q.answer}]</span></span>
                        <span class="review-q-right">
                            <span class="review-confidence ${confClass}">${confLabel}</span>
                            ${isRemoved
                                ? `<button class="review-undo-btn" onclick="QuestionReview.undoQuestion(${reviewState.currentPageIndex}, ${qIdx})">&#8617;</button>`
                                : (bankCount > 0 || q.removed
                                    ? `<button class="review-remove-btn" onclick="QuestionReview.removeQ(${reviewState.currentPageIndex}, ${qIdx})">&times;</button>`
                                    : '')
                            }
                        </span>
                    </div>
                `;
            });
        }

        $('#review-questions').innerHTML = allCardsHtml;

        const countEl = $('#review-count');
        if (page.type === 'final') {
            countEl.textContent = page.question.removed ? 'Removed' : 'Ready';
            countEl.className = `review-count ${page.question.removed ? 'warning' : 'ok'}`;
        } else {
            const remaining = page.active.filter(q => !q.removed).length;
            countEl.textContent = `${remaining}/${reviewState.requiredPerCategory}`;
            countEl.className = `review-count ${remaining >= reviewState.requiredPerCategory ? 'ok' : 'warning'}`;
        }

        const canStart = canStartGame();
        $('#review-start-btn').disabled = !canStart;
        $('#review-undo-btn').disabled = reviewState.removalHistory.length === 0;
    }

    function removeQ(pageIdx, qIdx) {
        removeQuestion(pageIdx, qIdx);
    }

    function undoQuestion(pageIdx, qIdx) {
        undoLastRemoval();
    }

    return {
        init,
        startReview,
        hideReview,
        removeQ,
        undoQuestion,
    };
})();
