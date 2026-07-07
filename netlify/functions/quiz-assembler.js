const { convertMathDelimitersDeep, normalizeBonusQuestionsInQuiz } = require('./quiz-generation-utils');
const { auditAssembledQuizBoard } = require('./quiz-quality');

function applyConfidenceAdjustment(confidence, adjustment) {
  const base = Number(confidence) || 0.8;
  const delta = Number(adjustment) || 0;
  return Math.max(0.05, Math.min(0.99, Number((base + delta).toFixed(3))));
}

function buildReviewMap(reviews = [], keyName) {
  const map = new Map();
  for (const review of reviews || []) {
    const key = Number(review[keyName]);
    if (Number.isFinite(key)) map.set(key, review);
  }
  return map;
}

function buildRoundFromGeneratedCategories(roundCategories) {
  return {
    categories: roundCategories.map((category) => ({
      name: category.name,
        questions: [
        ...(category.activeQuestions || []),
        ...(category.bankQuestions || [])
      ].map((question, index) => {
        const activeCount = (category.activeQuestions || []).length;
        const reviewMap = index < activeCount
          ? buildReviewMap(category.verification?.activeQuestionReviews, 'slot')
          : buildReviewMap(category.verification?.bankQuestionReviews, 'slot');
        const review = reviewMap.get(Number(question.slot));
        return {
          question: question.question,
          answer: question.answer,
          confidence: applyConfidenceAdjustment(question.confidence, review?.confidenceAdjustment),
          isBonusQuestion: !!question.isBonusQuestion,
        };
      })
    }))
  };
}

function buildFinalFields(finalData) {
  const activeFinal = finalData.activeFinal || { category: 'Final Showdown', question: '', answer: '', confidence: 0.8 };
  const bankFinals = finalData.bankFinals || [];
  const activeReview = finalData.verification?.activeFinalReview || null;
  const bankReviewMap = buildReviewMap(finalData.verification?.bankFinalReviews, 'index');
  const options = [activeFinal, ...bankFinals].slice(0, 3).map((option) => ({
    category: option.category || 'Final Showdown',
    clue: option.question || option.clue || '',
    answer: option.answer || '',
    confidence: option === activeFinal
      ? applyConfidenceAdjustment(option.confidence, activeReview?.confidenceAdjustment)
      : applyConfidenceAdjustment(option.confidence, bankReviewMap.get(bankFinals.indexOf(option))?.confidenceAdjustment),
  }));

  return {
    finalCategory: activeFinal.category || 'Final Showdown',
    finalClue: activeFinal.question || activeFinal.clue || '',
    finalAnswer: activeFinal.answer || '',
    finalConfidence: applyConfidenceAdjustment(activeFinal.confidence, activeReview?.confidenceAdjustment),
    finalShowdownOptions: options,
  };
}

function assembleQuizDraft({ categoryPlan, generatedRounds, finalData, curriculumContext, generationMetadata }) {
  const assembled = {
    round1: buildRoundFromGeneratedCategories(generatedRounds.round1),
    round2: buildRoundFromGeneratedCategories(generatedRounds.round2),
    ...buildFinalFields(finalData),
    generationPlan: categoryPlan,
  };

  if (curriculumContext) {
    assembled.curriculumContext = curriculumContext;
  }

  if (generationMetadata) {
    assembled.generationMetadata = generationMetadata;
  }

  const normalized = normalizeBonusQuestionsInQuiz(convertMathDelimitersDeep(assembled));
  normalized.hasMath = JSON.stringify(normalized).includes('\\(');
  normalized.boardQuality = auditAssembledQuizBoard(normalized);
  return normalized;
}

module.exports = {
  assembleQuizDraft,
};
