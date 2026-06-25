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
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const { topic, categories, questionsPerCategory } = JSON.parse(event.body);
  const doubleQ = questionsPerCategory * 2;

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
          content: `Generate a trivia quiz about "${topic}" with ${categories} categories and ${doubleQ} questions per category for EACH of two rounds. Round 1 and Round 2 must have completely different categories and different questions.

For each question, include a confidence score from 0.0 to 1.0 indicating how factually accurate you believe the question and answer pair is. Common well-known facts should be 0.8-1.0. Obscure or potentially ambiguous facts should be lower.

For math questions, use LaTeX notation:
- Inline math: \\(equation\\)
- Display math: \\[equation\\]
Examples: "What is the solution to \\(x^2 - 4 = 0\\)?" Answer: "\\(x = \\pm 2\\)"
Non-math questions should NOT use LaTeX notation.

Return as JSON with this exact structure:
{
  "round1": { "categories": [{ "name": "...", "questions": [{ "question": "...", "answer": "...", "confidence": 0.9 }] }] },
  "round2": { "categories": [{ "name": "...", "questions": [{ "question": "...", "answer": "...", "confidence": 0.85 }] }] },
  "finalCategory": "...",
  "finalClue": "...",
  "finalAnswer": "...",
  "finalConfidence": 0.85
}

Important: Generate exactly ${doubleQ} questions per category.`
        }
      ],
      temperature: 0.7,
      max_tokens: 16384,
    }),
  });

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {}

    const errorResponse = {
      error: true,
      status: response.status,
      message: errorData.error?.message || response.statusText || 'Unknown error',
      code: errorData.error?.code || 'UNKNOWN',
      type: errorData.error?.type || 'unknown',
      requestId: response.headers.get('x-request-id') || 'none',
      rateLimitRemaining: response.headers.get('x-rate-limit-requests-remaining'),
      tokenLimitRemaining: response.headers.get('x-rate-limit-tokens-remaining'),
    };

    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorResponse),
    };
  }

  const data = await response.json();

  try {
    let content = data.choices[0].message.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    // Fix truncated JSON: close any unclosed braces/brackets
    const openBraces = (content.match(/{/g) || []).length;
    const closeBraces = (content.match(/}/g) || []).length;
    const openBrackets = (content.match(/\[/g) || []).length;
    const closeBrackets = (content.match(/\]/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) content += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i++) content += ']';

    const quiz = JSON.parse(content);
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(quiz),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: true,
        status: 500,
        message: 'Failed to parse quiz JSON',
        code: 'PARSE_ERROR',
        type: 'parse_error',
        requestId: 'none',
        raw: data.choices?.[0]?.message?.content?.substring(0, 500),
      }),
    };
  }
};
