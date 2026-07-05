function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode, message, code, type, extra = {}) {
  return jsonResponse(statusCode, {
    error: true,
    status: statusCode,
    message,
    code,
    type,
    requestId: 'none',
    ...extra,
  });
}

function normalizeMathExpressionContent(mathContent) {
  return String(mathContent || '')
    .replace(/\\{2,}(?=[A-Za-z])/g, '\\')
    .replace(/\t(?=imes\b)/g, '\\t')
    .replace(/\f(?=rac\b)/g, '\\f')
    .replace(/\r(?=ight\b)/g, '\\r')
    .replace(/(?<!\\)\b(times|cdot|div)\b/g, '\\$1')
    .replace(/(?<!\\)\bfrac(?=\s*\{)/g, '\\frac')
    .replace(/\\_(?=\s|[)\]{}^_+\-*/=,.;:?]|$)/g, '\\square')
    .replace(/\s*\*\s*/g, ' \\cdot ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeExistingDelimitedMathContent(mathContent) {
  return String(mathContent || '')
    .replace(/\\{2,}(?=[A-Za-z])/g, '\\')
    .replace(/\t(?=imes\b)/g, '\\t')
    .replace(/\f(?=rac\b)/g, '\\f')
    .replace(/\r(?=ight\b)/g, '\\r')
    .replace(/(?<!\\)\b(times|cdot|div)\b/g, '\\$1')
    .replace(/(?<!\\)\bfrac(?=\s*\{)/g, '\\frac')
    .replace(/\\_(?=\s|[)\]{}^_+\-*/=,.;:?]|$)/g, '\\square')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeLatexDelimiterSlashes(value) {
  return String(value || '')
    .replace(/\\{2,}(?=[()\[\]])/g, '\\');
}

function normalizeUnitExponentsOutsideMath(value) {
  const parts = String(value || '').split(/(\\\(.*?\\\)|\\\[.*?\\\])/gs);
  return parts.map((part) => {
    if (/^\\[([]/.test(part)) return part;
    return part.replace(/\b(\d+(?:\.\d+)?)\s*(mm|cm|km|m)\^([23])\b/g, '\\($1\\text{ $2}^$3\\)');
  }).join('');
}

function normalizeLegacyMathTags(value) {
  return String(value || '')
    .replace(/\\\(\s*<<\s*MATH\s*>>\s*(.*?)\s*<<\s*\/\s*MATH\s*>>\s*\\\)/gs, (_, mathContent) => `\\(${normalizeMathExpressionContent(mathContent)}\\)`)
    .replace(/<<\s*MATH\s*>>\s*(.*?)\s*<<\s*\/\s*MATH\s*>>/gs, (_, mathContent) => `\\(${normalizeMathExpressionContent(mathContent)}\\)`);
}

function normalizeResidualMathMarkers(value) {
  let normalized = String(value || '')
    .replace(/<<\s*(?!\/?\s*MATH\b)([^<>]{1,80})\s*>>/g, '($1)')
    .replace(/\\\((.*?)\\\)\^([0-9]+)/gs, '\\($1^$2\\)')
    .replace(/\\\((.*?)\\\)_(\{[^}]+\}|[A-Za-z0-9]+)/gs, '\\($1_$2\\)')
    .replace(/=\s*\\\)/g, '=');

  return normalized.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
}

function convertMathDelimitersInString(value) {
  if (typeof value !== 'string') return value;
  return normalizeUnitExponentsOutsideMath(
    normalizeResidualMathMarkers(
      normalizeLatexDelimiterSlashes(normalizeLegacyMathTags(value))
        .replace(/\\\((.*?)\\\)/gs, (_, mathContent) => `\\(${normalizeExistingDelimitedMathContent(mathContent)}\\)`)
        .replace(/\\\[(.*?)\\\]/gs, (_, mathContent) => `\\[${normalizeExistingDelimitedMathContent(mathContent)}\\]`)
        .replace(/([A-Za-z0-9)])\\\(/g, '$1 \\(')
        .replace(/\\\)([A-Za-z0-9(])/g, '\\) $1')
        .replace(/\s{2,}/g, ' ')
        .trim()
    )
  )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function convertMathDelimitersDeep(value) {
  if (typeof value === 'string') return convertMathDelimitersInString(value);
  if (Array.isArray(value)) return value.map(convertMathDelimitersDeep);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, convertMathDelimitersDeep(nestedValue)])
  );
}

function normalizeMathDelimiterTypos(jsonText) {
  if (typeof jsonText !== 'string') return jsonText;
  return jsonText.replace(/<<\s*(\/?)\s*MATH\s*"?\s*>>?/gi, (_, slash) => {
    return slash ? '<</MATH>>' : '<<MATH>>';
  });
}

function escapeMathBackslashesInJsonText(jsonText) {
  if (typeof jsonText !== 'string') return jsonText;
  return jsonText.replace(/<<\s*MATH\s*>>(.*?)<<\s*\/\s*MATH\s*>>/gs, (match, mathContent) => {
    const escapedMathContent = mathContent.replace(/\\/g, '\\\\');
    return match.replace(mathContent, escapedMathContent);
  });
}

function escapeInvalidJsonBackslashes(jsonText) {
  if (typeof jsonText !== 'string') return jsonText;

  const validEscapeChars = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let result = '';

  for (let i = 0; i < jsonText.length; i++) {
    const current = jsonText[i];

    if (current !== '\\') {
      result += current;
      continue;
    }

    const next = jsonText[i + 1];
    if (next && validEscapeChars.has(next)) {
      result += current + next;
      i++;
      continue;
    }

    result += '\\\\';
  }

  return result;
}

function repairPotentiallyTruncatedJson(content) {
  let repaired = String(content || '');
  if (!repaired.endsWith('"') && (repaired.match(/"/g) || []).length % 2 !== 0) {
    repaired += '"';
  }

  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
  return repaired;
}

function stringHasBrokenLegacyMathMarkers(value) {
  if (typeof value !== 'string') return false;

  const normalized = normalizeMathDelimiterTypos(value);
  const openTags = normalized.match(/<<MATH>>/g) || [];
  const closeTags = normalized.match(/<<\/MATH>>/g) || [];
  const stripped = normalized.replace(/<<MATH>>|<<\/MATH>>/g, '');

  if (openTags.length !== closeTags.length) return true;
  return stripped.includes('<<') || stripped.includes('>>');
}

function stringHasBrokenLatexDelimiters(value) {
  if (typeof value !== 'string') return false;

  const text = String(value);
  let inlineDepth = 0;
  let displayDepth = 0;

  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);

    if (pair === '\\(') {
      if (inlineDepth > 0 || displayDepth > 0) return true;
      inlineDepth++;
      i++;
      continue;
    }

    if (pair === '\\)') {
      if (inlineDepth === 0) return true;
      inlineDepth--;
      i++;
      continue;
    }

    if (pair === '\\[') {
      if (inlineDepth > 0 || displayDepth > 0) return true;
      displayDepth++;
      i++;
      continue;
    }

    if (pair === '\\]') {
      if (displayDepth === 0) return true;
      displayDepth--;
      i++;
    }
  }

  return inlineDepth !== 0 || displayDepth !== 0;
}

function objectHasBrokenLegacyMathMarkers(value) {
  if (typeof value === 'string') {
    return stringHasBrokenLegacyMathMarkers(value) || stringHasBrokenLatexDelimiters(value);
  }
  if (Array.isArray(value)) return value.some(objectHasBrokenLegacyMathMarkers);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(objectHasBrokenLegacyMathMarkers);
}

function parseModelJsonContent(content) {
  let normalized = String(content || '').trim();
  if (normalized.startsWith('```')) {
    normalized = normalized.replace(/^```json?\n?/i, '').replace(/\n?```$/, '');
  }
  normalized = normalizeMathDelimiterTypos(normalized);
  normalized = escapeMathBackslashesInJsonText(normalized);
  normalized = escapeInvalidJsonBackslashes(normalized);
  normalized = repairPotentiallyTruncatedJson(normalized);
  return JSON.parse(normalized);
}

function normalizeBonusQuestionsForRound(round, targetCount) {
  if (!round?.categories || !Array.isArray(round.categories)) return round;

  const allQuestions = round.categories.flatMap((category) =>
    (category.questions || []).map((question, questionIndex) => ({
      question,
      questionIndex,
      score: Number(question.confidence) || 0,
      alreadyMarked: !!question.isBonusQuestion
    }))
  );

  allQuestions.forEach(({ question }) => {
    if (question && typeof question === 'object') {
      question.isBonusQuestion = false;
    }
  });

  allQuestions
    .sort((a, b) => {
      if (a.alreadyMarked !== b.alreadyMarked) return a.alreadyMarked ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.questionIndex - b.questionIndex;
    })
    .slice(0, Math.min(targetCount, allQuestions.length))
    .forEach(({ question }) => {
      question.isBonusQuestion = true;
    });

  return round;
}

function normalizeBonusQuestionsInQuiz(quiz) {
  if (quiz?.round1) normalizeBonusQuestionsForRound(quiz.round1, 1);
  if (quiz?.round2) normalizeBonusQuestionsForRound(quiz.round2, 2);
  return quiz;
}

module.exports = {
  jsonResponse,
  errorResponse,
  normalizeMathDelimiterTypos,
  escapeMathBackslashesInJsonText,
  escapeInvalidJsonBackslashes,
  repairPotentiallyTruncatedJson,
  parseModelJsonContent,
  convertMathDelimitersDeep,
  normalizeBonusQuestionsInQuiz,
  objectHasBrokenLegacyMathMarkers,
};
