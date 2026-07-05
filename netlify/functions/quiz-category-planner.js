const { createChatCompletion } = require('./quiz-openrouter');
const { parseModelJsonContent } = require('./quiz-generation-utils');
const { buildStudentFriendlyLanguagePromptBlock, buildSubjectRulesPromptBlock } = require('./quiz-prompt-utils');

const DEFAULT_SLOT_PLAN = {
  math: [
    { slot: 1, difficulty: 'easy', archetype: 'vocabulary recall' },
    { slot: 2, difficulty: 'moderate', archetype: 'concept identification' },
    { slot: 3, difficulty: 'moderate', archetype: 'one-step calculation' },
    { slot: 4, difficulty: 'hard', archetype: 'error diagnosis' },
    { slot: 5, difficulty: 'hard', archetype: 'identify the correct method' },
  ],
  default: [
    { slot: 1, difficulty: 'easy', archetype: 'foundational recall' },
    { slot: 2, difficulty: 'moderate', archetype: 'basic application' },
    { slot: 3, difficulty: 'moderate', archetype: 'comparison or interpretation' },
    { slot: 4, difficulty: 'hard', archetype: 'error diagnosis or reasoning' },
    { slot: 5, difficulty: 'hard', archetype: 'scenario reasoning' },
  ]
};

function buildSlotPlan(subjectFamily, questionsPerCategory) {
  const base = DEFAULT_SLOT_PLAN[subjectFamily] || DEFAULT_SLOT_PLAN.default;
  const slots = [];
  for (let i = 0; i < questionsPerCategory; i++) {
    const template = base[Math.min(i, base.length - 1)];
    slots.push({ ...template, slot: i + 1 });
  }
  return slots;
}

function buildCategoryPlanningPrompt({ topic, categories, subjectFamily, curriculumPrompt }) {
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  const subjectRulesPrompt = buildSubjectRulesPromptBlock(subjectFamily);
  return `Plan a classroom trivia quiz about "${topic}" with ${categories} categories in Round 1 and ${categories} different categories in Round 2.${curriculumPrompt}${studentFriendlyLanguagePrompt}${subjectRulesPrompt}

Subject family: ${subjectFamily}

Requirements:
- Return valid JSON only, no markdown and no code fences.
- Round 1 and Round 2 must have different category names.
- Category names should be concise, teacher-friendly, and fit the topic.
- Avoid duplicate or near-duplicate categories.
- Do not generate questions yet.

Return this exact JSON shape:
{
  "round1": [{ "name": "..." }],
  "round2": [{ "name": "..." }]
}`;
}

function normalizePlannedRound(round, subjectFamily, questionsPerCategory) {
  return (Array.isArray(round) ? round : []).map((category, index) => ({
    name: category.name || `Category ${index + 1}`,
    subjectFamily,
    slotPlan: buildSlotPlan(subjectFamily, questionsPerCategory),
  }));
}

function validatePlannedRound(round, expectedCount, roundName) {
  if (!Array.isArray(round) || round.length !== expectedCount) {
    throw new Error(`${roundName} must contain exactly ${expectedCount} categories`);
  }

  round.forEach((category, index) => {
    if (!category || typeof category.name !== 'string' || !category.name.trim()) {
      throw new Error(`${roundName} category ${index + 1} is missing a valid name`);
    }
  });
}

function validateCategoryPlanShape(parsed, expectedCount) {
  validatePlannedRound(parsed?.round1, expectedCount, 'Round 1');
  validatePlannedRound(parsed?.round2, expectedCount, 'Round 2');
}

async function requestCategoryPlan({ apiKey, model, topic, categories, questionsPerCategory, subjectFamily, curriculumPrompt }) {
  const prompt = buildCategoryPlanningPrompt({ topic, categories, subjectFamily, curriculumPrompt });
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await createChatCompletion({
        apiKey,
        model,
        messages: [
          { role: 'system', content: 'You are a category planner. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        maxTokens: 4000,
      });

      const rawText = await response.text();
      let jsonResponse;
      try {
        jsonResponse = rawText ? JSON.parse(rawText) : null;
      } catch (error) {
        throw new Error(`Category planner returned non-JSON API response: ${error.message}`);
      }

      if (!response.ok) {
        throw new Error(jsonResponse?.error?.message || jsonResponse?.message || response.statusText || 'Category planner request failed');
      }

      const content = jsonResponse?.choices?.[0]?.message?.content || '';
      const parsed = parseModelJsonContent(content);
      validateCategoryPlanShape(parsed, categories);

      return {
        round1: normalizePlannedRound(parsed.round1, subjectFamily, questionsPerCategory),
        round2: normalizePlannedRound(parsed.round2, subjectFamily, questionsPerCategory),
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
  buildCategoryPlanningPrompt,
  buildSlotPlan,
  requestCategoryPlan,
};
