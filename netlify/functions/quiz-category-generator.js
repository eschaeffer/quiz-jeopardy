const { createChatCompletion } = require('./quiz-openrouter');
const { parseModelJsonContent, objectHasBrokenLegacyMathMarkers } = require('./quiz-generation-utils');
const { buildCategoryGenerationPrompt } = require('./quiz-prompt-utils');

function normalizeQuestion(question = {}, fallbackSlot = 1) {
  return {
    slot: Number(question.slot) || fallbackSlot,
    question: question.question || '',
    answer: question.answer || '',
    confidence: Number(question.confidence) || 0.8,
    isBonusQuestion: !!question.isBonusQuestion,
  };
}

function validateQuestionList(questions, expectedCount, label) {
  if (!Array.isArray(questions) || questions.length !== expectedCount) {
    throw new Error(`${label} must contain exactly ${expectedCount} questions`);
  }

  const seenSlots = new Set();
  questions.forEach((question, index) => {
    const slot = Number(question?.slot);
    if (!Number.isFinite(slot) || slot < 1 || slot > expectedCount) {
      throw new Error(`${label} question ${index + 1} has an invalid slot`);
    }
    if (seenSlots.has(slot)) {
      throw new Error(`${label} contains duplicate slot ${slot}`);
    }
    seenSlots.add(slot);
    if (!question?.question || !question?.answer) {
      throw new Error(`${label} question ${index + 1} is missing question or answer text`);
    }
  });
}

function validateGeneratedCategoryShape(parsed, expectedName, expectedCount) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Category generation returned an invalid payload');
  }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    throw new Error(`Generated category for ${expectedName} is missing a valid name`);
  }
  validateQuestionList(parsed.activeQuestions, expectedCount, `Active questions for ${expectedName}`);
  validateQuestionList(parsed.bankQuestions, expectedCount, `Bank questions for ${expectedName}`);
  if (objectHasBrokenLegacyMathMarkers(parsed)) {
    throw new Error(`Generated category for ${expectedName} contains malformed legacy math markers`);
  }
}

async function requestCategoryGeneration({ apiKey, model, topic, roundName, category, questionsPerCategory, curriculumPrompt }) {
  const prompt = buildCategoryGenerationPrompt({
    topic,
    roundName,
    categoryName: category.name,
    questionsPerCategory,
    subjectFamily: category.subjectFamily,
    curriculumPrompt,
    slotPlan: category.slotPlan,
  });

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await createChatCompletion({
        apiKey,
        model,
        messages: [
          { role: 'system', content: 'You generate one reviewable category at a time. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        maxTokens: 8000,
      });

      const rawText = await response.text();
      let jsonResponse;
      try {
        jsonResponse = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        throw new Error(`Category generation returned non-JSON API response: ${error.message}`);
      }

      if (!response.ok) {
        throw new Error(jsonResponse?.error?.message || jsonResponse?.message || response.statusText || 'Category generation request failed');
      }

      const content = jsonResponse?.choices?.[0]?.message?.content || '';
      const parsed = parseModelJsonContent(content);
      validateGeneratedCategoryShape(parsed, category.name, questionsPerCategory);

      return {
        name: parsed.name || category.name,
        subjectFamily: category.subjectFamily,
        slotPlan: category.slotPlan,
        activeQuestions: (parsed.activeQuestions || []).map((q, index) => normalizeQuestion(q, index + 1)),
        bankQuestions: (parsed.bankQuestions || []).map((q, index) => normalizeQuestion(q, index + 1)),
        routedModel: jsonResponse.model || model,
        usage: jsonResponse.usage || null,
        rawContent: String(content).slice(0, 2000),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

module.exports = {
  requestCategoryGeneration,
};
