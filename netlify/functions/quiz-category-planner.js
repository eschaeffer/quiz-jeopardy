const { createChatCompletion } = require('./quiz-openrouter');
const { parseModelJsonContent } = require('./quiz-generation-utils');
const { buildStudentFriendlyLanguagePromptBlock, buildSubjectRulesPromptBlock } = require('./quiz-prompt-utils');
const { auditCategoryPlan, getBlockingQualityIssues } = require('./quiz-quality');

const ALLOWED_CATEGORY_TYPES = new Set(['content', 'mode', 'context', 'hybrid']);

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

function buildCategoryPlanningPrompt({ topic, categories, subjectFamily, curriculumPrompt, retryFeedback = '' }) {
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  const subjectRulesPrompt = buildSubjectRulesPromptBlock(subjectFamily);
  const retryBlock = retryFeedback ? `\n\nRetry guidance from the previous attempt:\n${retryFeedback}` : '';
  return `Plan a classroom trivia quiz about "${topic}" with ${categories} categories in Round 1 and ${categories} different categories in Round 2.${curriculumPrompt}${studentFriendlyLanguagePrompt}${subjectRulesPrompt}${retryBlock}

Subject family: ${subjectFamily}

Requirements:
- Return valid JSON only, no markdown and no code fences.
- Round 1 and Round 2 must have different category names.
- Category names should be concise, teacher-friendly, and fit the topic.
- Avoid duplicate or near-duplicate categories.
- Use a mix of category identities when natural for the topic: content, mode, context, or hybrid.
- Category identity should be genuinely different, not just a renamed version of another category.
- If the topic is narrow, use mode and context variety to increase board variety without leaving the topic.
- Mode-led examples: true or false, cause and effect, compare and contrast, error spotting, scenario application.
- Context-led examples: everyday life, technology, community, environment, common cultural tie-ins.
- Do not overuse pure mode categories. Most boards should still be anchored in content or hybrid categories.
- Do not generate questions yet.

Return this exact JSON shape:
{
  "round1": [{ "name": "...", "categoryType": "content", "angle": "...", "preferredModes": ["..."], "exampleSpace": "...", "avoidOverlapWith": ["..."] }],
  "round2": [{ "name": "...", "categoryType": "hybrid", "angle": "...", "preferredModes": ["..."], "exampleSpace": "...", "avoidOverlapWith": ["..."] }]
}`;
}

function normalizePlannedRound(round, subjectFamily, questionsPerCategory) {
  return (Array.isArray(round) ? round : []).map((category, index) => ({
    name: category.name || `Category ${index + 1}`,
    categoryType: ALLOWED_CATEGORY_TYPES.has(String(category.categoryType || '').trim()) ? String(category.categoryType).trim() : 'content',
    angle: String(category.angle || '').trim(),
    preferredModes: Array.isArray(category.preferredModes)
      ? category.preferredModes.map(mode => String(mode || '').trim()).filter(Boolean).slice(0, 4)
      : [],
    exampleSpace: String(category.exampleSpace || '').trim(),
    avoidOverlapWith: Array.isArray(category.avoidOverlapWith)
      ? category.avoidOverlapWith.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4)
      : [],
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
    if (category.categoryType && !ALLOWED_CATEGORY_TYPES.has(String(category.categoryType).trim())) {
      throw new Error(`${roundName} category ${index + 1} has an invalid categoryType`);
    }
    if (category.preferredModes && !Array.isArray(category.preferredModes)) {
      throw new Error(`${roundName} category ${index + 1} has invalid preferredModes`);
    }
  });
}

function validateCategoryPlanShape(parsed, expectedCount) {
  validatePlannedRound(parsed?.round1, expectedCount, 'Round 1');
  validatePlannedRound(parsed?.round2, expectedCount, 'Round 2');
  const audit = auditCategoryPlan(parsed?.round1, parsed?.round2);
  const blockingIssues = getBlockingQualityIssues(audit.issues);
  if (blockingIssues.length > 0) {
    throw new Error(`Category plan quality audit failed: ${blockingIssues.join('; ')}`);
  }
}

async function requestCategoryPlan({ apiKey, model, topic, categories, questionsPerCategory, subjectFamily, curriculumPrompt }) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const prompt = buildCategoryPlanningPrompt({
        topic,
        categories,
        subjectFamily,
        curriculumPrompt,
        retryFeedback: attempt > 0 && lastError ? lastError.message : '',
      });
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
