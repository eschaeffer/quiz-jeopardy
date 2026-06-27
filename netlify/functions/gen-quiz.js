const { retrieveCurriculumContext, formatExpectationsForPrompt } = require('./curriculum');

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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', 'request_error');
  }

  try {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return errorResponse(400, 'Request body must be valid JSON', 'BAD_REQUEST_JSON', 'request_error', {
        raw: event.body?.substring(0, 2000) || '',
      });
    }

    const { topic, categories, questionsPerCategory, curriculum } = payload;
    if (!topic || !Number.isFinite(categories) || !Number.isFinite(questionsPerCategory)) {
      return errorResponse(400, 'topic, categories, and questionsPerCategory are required', 'BAD_REQUEST', 'request_error');
    }
    if (!process.env.OPENROUTER_API_KEY) {
      return errorResponse(500, 'OpenRouter API key is not configured', 'MISSING_OPENROUTER_API_KEY', 'configuration_error');
    }

    const doubleQ = questionsPerCategory * 2;
    const retrievedCurriculum = curriculum ? retrieveCurriculumContext({
      curriculumId: curriculum.curriculum_id || curriculum.curriculumId || 'ontario',
      courseCode: curriculum.course_code || curriculum.courseCode,
      grade: curriculum.grade,
      subjectArea: curriculum.subject_area || curriculum.subjectArea,
      topic,
      conceptId: curriculum.concept_id || curriculum.conceptId,
      conceptName: curriculum.concept_name || curriculum.conceptName,
      limit: curriculum.limit || 6,
    }) : { concept: null, expectations: [] };
    const expectations = retrievedCurriculum.expectations;
    const selectedConcept = retrievedCurriculum.concept;
    const curriculumContext = formatExpectationsForPrompt(expectations, selectedConcept);
    const curriculumPrompt = curriculumContext
      ? `

Curriculum context:
Use the following retrieved curriculum expectations as grounding for the quiz draft. Do not invent curriculum expectations. Generate teacher-reviewable trivia questions aligned with these expectations.
${curriculumContext}`
      : '';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
      model: 'openrouter/auto',
        messages: [
          {
            role: 'system',
            content: 'You are a quiz generator. Return valid JSON only, no markdown, no code fences.'
          },
          {
            role: 'user',
            content: `Generate a trivia quiz about "${topic}" with ${categories} categories and ${doubleQ} questions per category for EACH of two rounds. Round 1 and Round 2 must have completely different categories and different questions.${curriculumPrompt}

For each question, include a confidence score from 0.0 to 1.0 indicating how factually accurate you believe the question and answer pair is. Common well-known facts should be 0.8-1.0. Obscure or potentially ambiguous facts should be lower.

Return as JSON with this exact structure:
{
  "round1": { "categories": [{ "name": "...", "questions": [{ "question": "...", "answer": "...", "confidence": 0.9 }] }] },
  "round2": { "categories": [{ "name": "...", "questions": [{ "question": "...", "answer": "...", "confidence": 0.85 }] }] },
  "finalCategory": "...",
  "finalClue": "...",
  "finalAnswer": "...",
  "finalConfidence": 0.85,
  "finalShowdownOptions": [
    { "category": "...", "clue": "...", "answer": "...", "confidence": 0.85 },
    { "category": "...", "clue": "...", "answer": "...", "confidence": 0.82 },
    { "category": "...", "clue": "...", "answer": "...", "confidence": 0.8 }
  ]
}

Important: Generate exactly ${doubleQ} questions per category and exactly 3 Final Showdown options. The first Final Showdown option should match finalCategory/finalClue/finalAnswer for backward compatibility.`
          }
        ],
        temperature: 0.7,
        max_tokens: 32768,
      }),
    });

    if (!response.ok) {
      let errorData = {};
      let raw = '';
      try {
        raw = await response.text();
        errorData = raw ? JSON.parse(raw) : {};
      } catch (e) {}

      return jsonResponse(response.status, {
        error: true,
        status: response.status,
        message: errorData.error?.message || response.statusText || 'Unknown error',
        code: errorData.error?.code || 'UNKNOWN',
        type: errorData.error?.type || 'unknown',
        requestId: response.headers.get('x-request-id') || 'none',
        rateLimitRemaining: response.headers.get('x-rate-limit-requests-remaining'),
        tokenLimitRemaining: response.headers.get('x-rate-limit-tokens-remaining'),
        raw: raw.substring(0, 2000),
      });
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      return errorResponse(502, 'OpenRouter returned a non-JSON response', 'UPSTREAM_NON_JSON', 'upstream_error', {
        details: e.message,
      });
    }

    let content = data.choices[0].message.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    // Fix truncated JSON:
    // 1. Close unclosed string
    if (!content.endsWith('"') && (content.match(/"/g) || []).length % 2 !== 0) {
      content += '"';
    }
    // 2. Close unclosed braces/brackets
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) content += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i++) content += ']';

    let quiz;
    try {
      quiz = JSON.parse(content);
    } catch (e) {
      return errorResponse(500, 'Failed to parse quiz JSON', 'PARSE_ERROR', 'parse_error', {
        details: e.message,
        raw: data.choices?.[0]?.message?.content?.substring(0, 2000) || '',
      });
    }
    if (Array.isArray(quiz.finalShowdownOptions) && quiz.finalShowdownOptions.length > 0) {
      const firstFinal = quiz.finalShowdownOptions[0];
      quiz.finalCategory = firstFinal.category || quiz.finalCategory || 'Final Showdown';
      quiz.finalClue = firstFinal.clue || firstFinal.question || quiz.finalClue || '';
      quiz.finalAnswer = firstFinal.answer || quiz.finalAnswer || '';
      quiz.finalConfidence = firstFinal.confidence || quiz.finalConfidence || 0.8;
    } else {
      quiz.finalShowdownOptions = [{
        category: quiz.finalCategory || 'Final Showdown',
        clue: quiz.finalClue || '',
        answer: quiz.finalAnswer || '',
        confidence: quiz.finalConfidence || 0.8,
      }];
    }
    if (selectedConcept || expectations.length > 0) {
      quiz.curriculumContext = {
        curriculum_id: curriculum.curriculum_id || curriculum.curriculumId || 'ontario',
        selected_concept: selectedConcept ? {
          id: selectedConcept.id,
          name: selectedConcept.name,
          description: selectedConcept.description,
          related_expectations: selectedConcept.related_expectations,
        } : null,
        matched_expectations: expectations.map(expectation => ({
          id: expectation.id,
          course_code: expectation.course_code,
          grade: expectation.grade,
          subject_area: expectation.subject_area,
          strand_id: expectation.strand_id,
          strand_name: expectation.strand_name,
          expectation_code: expectation.expectation_code,
          source_document: expectation.source_document,
          source_url: expectation.source_url,
          version_year: expectation.version_year,
          retrieval_score: expectation.retrieval_score,
        })),
      };
    }
    return jsonResponse(200, quiz);
  } catch (e) {
    return errorResponse(500, e.message === 'Failed to fetch' ? 'Could not reach OpenRouter' : 'Failed to generate quiz JSON', 'GEN_QUIZ_ERROR', 'server_error', {
      details: e.message,
    });
  }
};
