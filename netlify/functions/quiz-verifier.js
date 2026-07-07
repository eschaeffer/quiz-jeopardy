const { createChatCompletion } = require('./quiz-openrouter');
const { parseModelJsonContent } = require('./quiz-generation-utils');
const { buildCategoryVerificationPrompt, buildFinalVerificationPrompt } = require('./quiz-prompt-utils');

function clampAdjustment(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(0, Math.max(-0.9, number));
}

function normalizeQuestionReview(review = {}, fallbackSlot = 1) {
  return {
    slot: Number(review.slot) || fallbackSlot,
    confidenceAdjustment: clampAdjustment(review.confidenceAdjustment),
    issues: Array.isArray(review.issues) ? review.issues : [],
  };
}

async function requestCategoryVerification({ apiKey, model, topic, roundName, categoryName, subjectFamily, curriculumPrompt, generatedCategory }) {
  const prompt = buildCategoryVerificationPrompt({ topic, roundName, categoryName, subjectFamily, curriculumPrompt, generatedCategory });
  let retried = false;

  while (true) {
    try {
      const response = await createChatCompletion({
        apiKey,
        model,
        messages: [
          { role: 'system', content: 'You verify generated trivia categories. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 4000,
      });

      const rawText = await response.text();
      let jsonResponse;
      try {
        jsonResponse = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        throw new Error(`Category verification returned non-JSON API response: ${error.message}`);
      }

      if (!response.ok) {
        throw new Error(jsonResponse?.error?.message || jsonResponse?.message || response.statusText || 'Category verification request failed');
      }

      const parsed = parseModelJsonContent(jsonResponse?.choices?.[0]?.message?.content || '');
      return {
        status: parsed.status || 'pass',
        activeQuestionReviews: (parsed.activeQuestionReviews || []).map((review, index) => normalizeQuestionReview(review, index + 1)),
        bankQuestionReviews: (parsed.bankQuestionReviews || []).map((review, index) => normalizeQuestionReview(review, index + 1)),
        categoryIssues: Array.isArray(parsed.categoryIssues) ? parsed.categoryIssues : [],
        routedModel: jsonResponse.model || model,
        usage: jsonResponse.usage || null,
      };
    } catch (error) {
      if (retried) throw error;
      retried = true;
    }
  }
}

async function requestFinalVerification({ apiKey, model, topic, subjectFamily, curriculumPrompt, generatedFinal, boardSummary = '' }) {
  const prompt = buildFinalVerificationPrompt({ topic, subjectFamily, curriculumPrompt, generatedFinal, boardSummary });
  let retried = false;

  while (true) {
    try {
      const response = await createChatCompletion({
        apiKey,
        model,
        messages: [
          { role: 'system', content: 'You verify Final Showdown options. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 3000,
      });

      const rawText = await response.text();
      let jsonResponse;
      try {
        jsonResponse = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        throw new Error(`Final verification returned non-JSON API response: ${error.message}`);
      }

      if (!response.ok) {
        throw new Error(jsonResponse?.error?.message || jsonResponse?.message || response.statusText || 'Final verification request failed');
      }

      const parsed = parseModelJsonContent(jsonResponse?.choices?.[0]?.message?.content || '');
      return {
        status: parsed.status || 'pass',
        activeFinalReview: {
          confidenceAdjustment: clampAdjustment(parsed.activeFinalReview?.confidenceAdjustment),
          issues: Array.isArray(parsed.activeFinalReview?.issues) ? parsed.activeFinalReview.issues : [],
        },
        bankFinalReviews: (parsed.bankFinalReviews || []).map((review, index) => ({
          index: Number.isFinite(Number(review.index)) ? Number(review.index) : index,
          confidenceAdjustment: clampAdjustment(review.confidenceAdjustment),
          issues: Array.isArray(review.issues) ? review.issues : [],
        })),
        finalIssues: Array.isArray(parsed.finalIssues) ? parsed.finalIssues : [],
        routedModel: jsonResponse.model || model,
        usage: jsonResponse.usage || null,
      };
    } catch (error) {
      if (retried) throw error;
      retried = true;
    }
  }
}

module.exports = {
  requestCategoryVerification,
  requestFinalVerification,
};
