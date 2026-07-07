const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'both', 'by', 'can', 'could', 'did', 'do', 'does', 'for',
  'from', 'had', 'has', 'have', 'how', 'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'them', 'then', 'there', 'they', 'this', 'to', 'was', 'what', 'when', 'which', 'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your'
]);

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(' ')
    .filter(token => token && token.length > 2 && !STOPWORDS.has(token));
}

function uniqueTokens(tokens) {
  return Array.from(new Set(tokens));
}

function jaccardSimilarity(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function answerFingerprint(answer) {
  return normalizeText(answer)
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function questionFingerprint(question) {
  return uniqueTokens(tokenizeText(question)).sort().join(' ');
}

function detectQuestionMode(question) {
  const text = String(question || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.startsWith('true or false')) return 'true_false';
  if (/\bcompare\b|\bdifference\b|\bdiffer\b/.test(text)) return 'compare';
  if (/\bwhy\b|\bhow does\b|\bhow do\b|\bwhat causes\b|\bexplain\b/.test(text)) return 'cause_effect';
  if (/\bwhat happens\b|\bwhat will happen\b|\bif\b.*\bwill\b|\bif\b.*\bwhat\b/.test(text)) return 'predict';
  if (/\bwrong\b|\bmistake\b|\berror\b/.test(text)) return 'error_spotting';
  if (/\bwhich\b.*\bbetter\b|\bwhich\b.*\bfit\b|\bwhich\b.*\bchoice\b/.test(text)) return 'method_choice';
  if (/\bhow is\b|\bhow are\b|\bwhat is one simple difference\b/.test(text)) return 'compare';
  if (/\bwhat do we call\b|\bwhich kind\b|\bwhich type\b|\bwhat part\b/.test(text)) return 'identify';
  return 'identify';
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function auditCategoryPlan(round1, round2) {
  const issues = [];
  const all = [...normalizeList(round1), ...normalizeList(round2)];
  const nameMap = new Map();

  all.forEach((category, index) => {
    const key = normalizeText(category?.name || '');
    if (!key) {
      issues.push(`category_${index + 1}_missing_name`);
      return;
    }
    if (nameMap.has(key)) {
      issues.push(`duplicate_category_name:${category.name}`);
    } else {
      nameMap.set(key, category.name);
    }
  });

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      const aTokens = uniqueTokens(tokenizeText(`${a?.name || ''} ${a?.angle || ''}`));
      const bTokens = uniqueTokens(tokenizeText(`${b?.name || ''} ${b?.angle || ''}`));
      const similarity = jaccardSimilarity(aTokens, bTokens);
      if (similarity >= 0.8) {
        issues.push(`near_duplicate_category_angles:${a?.name || `Category ${i + 1}`}|${b?.name || `Category ${j + 1}`}`);
      }
    }
  }

  return {
    issues,
    passed: issues.length === 0,
  };
}

function getBlockingQualityIssues(issues = []) {
  return (issues || []).filter((issue) => {
    return /^(duplicate_category_name|near_duplicate_category_angles|same_answer_target_repeated|near_duplicate_active|reused_stock_example|category_overlap|final_repeats_board_fact)/.test(issue);
  });
}

function compareQuestions(a, b) {
  const aQuestionTokens = uniqueTokens(tokenizeText(a?.question || ''));
  const bQuestionTokens = uniqueTokens(tokenizeText(b?.question || ''));
  const questionSimilarity = jaccardSimilarity(aQuestionTokens, bQuestionTokens);
  const aAnswer = answerFingerprint(a?.answer || '');
  const bAnswer = answerFingerprint(b?.answer || '');
  const sameAnswer = !!aAnswer && aAnswer === bAnswer;
  const sameMode = detectQuestionMode(a?.question) === detectQuestionMode(b?.question);

  const sharedTokens = aQuestionTokens.filter(token => bQuestionTokens.includes(token));
  const repeatedScenario = sharedTokens.length >= 4 && questionSimilarity >= 0.45;
  const nearDuplicate = questionSimilarity >= 0.72 || (sameAnswer && questionSimilarity >= 0.38) || (repeatedScenario && sameMode);

  return {
    questionSimilarity,
    sameAnswer,
    repeatedScenario,
    nearDuplicate,
    sharedTokens,
  };
}

function auditQuestionSet(questions, { label = 'questions', requireDistinctModes = true } = {}) {
  const list = normalizeList(questions);
  const issues = [];
  const modes = new Set();

  const answers = new Map();
  list.forEach((question, index) => {
    const fingerprint = answerFingerprint(question?.answer || '');
    if (fingerprint) {
      if (answers.has(fingerprint)) {
        issues.push(`same_answer_target_repeated:${label}:${answers.get(fingerprint)}&${index + 1}`);
      } else {
        answers.set(fingerprint, index + 1);
      }
    }
    modes.add(detectQuestionMode(question?.question));
  });

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const comparison = compareQuestions(list[i], list[j]);
      if (comparison.nearDuplicate) {
        issues.push(`near_duplicate_active:${label}:${i + 1}&${j + 1}`);
      } else if (comparison.repeatedScenario) {
        issues.push(`reused_stock_example:${label}:${i + 1}&${j + 1}`);
      }
    }
  }

  if (requireDistinctModes) {
    const minimumModes = Math.min(3, Math.max(1, list.length));
    if (modes.size < minimumModes) {
      issues.push(`difficulty_progression_flat:${label}:only_${modes.size}_modes`);
    }
  }

  return {
    issues,
    modes: Array.from(modes),
    passed: issues.length === 0,
  };
}

function auditCategoryGeneration(parsed, expectedName) {
  const activeAudit = auditQuestionSet(parsed?.activeQuestions, { label: `${expectedName}:active`, requireDistinctModes: true });
  const bankAudit = auditQuestionSet(parsed?.bankQuestions, { label: `${expectedName}:bank`, requireDistinctModes: false });
  const crossIssues = [];
  const activeBySlot = new Map(normalizeList(parsed?.activeQuestions).map(q => [Number(q.slot), q]));

  normalizeList(parsed?.bankQuestions).forEach((bankQuestion) => {
    const activeQuestion = activeBySlot.get(Number(bankQuestion?.slot));
    if (!activeQuestion) return;
    const comparison = compareQuestions(activeQuestion, bankQuestion);
    if (comparison.sameAnswer || comparison.nearDuplicate) {
      crossIssues.push(`near_duplicate_bank:${expectedName}:slot_${bankQuestion.slot}`);
    }
  });

  const issues = [...activeAudit.issues, ...bankAudit.issues, ...crossIssues];
  return {
    issues,
    passed: issues.length === 0,
    activeModes: activeAudit.modes,
    bankModes: bankAudit.modes,
  };
}

function auditFinalGeneration(parsed, { boardSummaryText = '' } = {}) {
  const issues = [];
  const options = [parsed?.activeFinal, ...normalizeList(parsed?.bankFinals)].filter(Boolean);
  const optionQuestions = options.map(option => ({ question: option.question || option.clue || '', answer: option.answer || '' }));
  const optionAudit = auditQuestionSet(optionQuestions, { label: 'final', requireDistinctModes: false });
  issues.push(...optionAudit.issues.map(issue => issue.replace('near_duplicate_active', 'final_repeats_board_fact')));

  const activeFinal = parsed?.activeFinal;
  const activeQuestionText = normalizeText(activeFinal?.question || activeFinal?.clue || '');
  const activeAnswerText = answerFingerprint(activeFinal?.answer || '');
  if (activeQuestionText && (activeQuestionText.split(' ').length < 8 || detectQuestionMode(activeQuestionText) === 'identify')) {
    issues.push('final_too_easy:active_final');
  }

  const normalizedBoardSummary = normalizeText(boardSummaryText);
  if (normalizedBoardSummary && activeAnswerText && normalizedBoardSummary.includes(activeAnswerText)) {
    issues.push('final_repeats_board_fact:answer_overlap');
  }

  return {
    issues,
    passed: issues.length === 0,
  };
}

function buildBoardSummary(rounds = []) {
  return normalizeList(rounds)
    .flatMap(round => normalizeList(round?.categories).flatMap(category => normalizeList(category?.activeQuestions || category?.questions).map((question, index) => ({
      category: category.name,
      slot: Number(question.slot) || index + 1,
      question: question.question || '',
      answer: question.answer || '',
    }))))
    .map(item => `${item.category} slot ${item.slot}: Q ${item.question} A ${item.answer}`)
    .join(' | ');
}

function auditAssembledQuizBoard(quiz) {
  const issues = [];
  const roundSummaries = [];
  const allActiveQuestions = [];

  ['round1', 'round2'].forEach((roundKey) => {
    const round = quiz?.[roundKey];
    const categories = normalizeList(round?.categories);
    const roundQuestionCount = [];

    categories.forEach((category) => {
      const activeQuestions = normalizeList(category?.questions).slice(0, 5);
      roundQuestionCount.push({ category: category.name, count: activeQuestions.length });
      activeQuestions.forEach((question, index) => {
        allActiveQuestions.push({
          round: roundKey,
          category: category.name,
          slot: index + 1,
          question: question.question,
          answer: question.answer,
        });
      });
    });

    roundSummaries.push({ round: roundKey, categories: roundQuestionCount });
  });

  const activeAudit = auditQuestionSet(allActiveQuestions, { label: 'board_active', requireDistinctModes: false });
  issues.push(...activeAudit.issues);

  const categoryNameSet = new Set();
  ['round1', 'round2'].forEach((roundKey) => {
    normalizeList(quiz?.[roundKey]?.categories).forEach((category) => {
      const normalized = normalizeText(category?.name || '');
      if (!normalized) return;
      if (categoryNameSet.has(normalized)) {
        issues.push(`category_overlap:duplicate_name:${category.name}`);
      } else {
        categoryNameSet.add(normalized);
      }
    });
  });

  const finalQuestion = quiz?.finalClue || '';
  const finalAnswer = quiz?.finalAnswer || '';
  const boardSummaryText = buildBoardSummary([
    { categories: normalizeList(quiz?.round1?.categories).map(category => ({ ...category, activeQuestions: normalizeList(category.questions).slice(0, 5) })) },
    { categories: normalizeList(quiz?.round2?.categories).map(category => ({ ...category, activeQuestions: normalizeList(category.questions).slice(0, 5) })) },
  ]);
  const finalAudit = auditFinalGeneration({ activeFinal: { question: finalQuestion, answer: finalAnswer }, bankFinals: (quiz?.finalShowdownOptions || []).slice(1).map(option => ({ question: option.clue || option.question || '', answer: option.answer || '' })) }, { boardSummaryText });
  issues.push(...finalAudit.issues);

  return {
    issues,
    passed: issues.length === 0,
    summary: roundSummaries,
  };
}

module.exports = {
  normalizeText,
  tokenizeText,
  detectQuestionMode,
  getBlockingQualityIssues,
  auditCategoryPlan,
  auditCategoryGeneration,
  auditFinalGeneration,
  auditAssembledQuizBoard,
  buildBoardSummary,
};
