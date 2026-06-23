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
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a quiz generator. Return valid JSON only, no markdown, no code fences.'
        },
        {
          role: 'user',
          content: `Generate a trivia quiz about "${topic}" with ${categories} categories and ${doubleQ} questions per category for EACH of two rounds. Round 1 and Round 2 must have completely different categories and different questions.

For each question, include a confidence score from 0.0 to 1.0 indicating how factually accurate you believe the question and answer pair is. Common well-known facts should be 0.8-1.0. Obscure or potentially ambiguous facts should be lower.

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
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return {
      statusCode: response.status,
      body: JSON.stringify({ error: 'OpenRouter API error', details: err }),
    };
  }

  const data = await response.json();

  try {
    let content = data.choices[0].message.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    const quiz = JSON.parse(content);
    return {
      statusCode: 200,
      body: JSON.stringify(quiz),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to parse quiz JSON', raw: data.choices[0].message.content }),
    };
  }
};
