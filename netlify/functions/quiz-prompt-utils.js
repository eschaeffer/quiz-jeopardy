function buildCurriculumPrompt(curriculumContext) {
  return curriculumContext
    ? `

Curriculum context:
Use the following retrieved curriculum expectations as grounding for the quiz draft. Do not invent curriculum expectations. Generate teacher-reviewable trivia questions aligned with these expectations.
${curriculumContext}`
    : '';
}

function buildStudentFriendlyLanguagePromptBlock() {
  return `

Student-friendly language policy:
Write for students who are currently learning or have only recently learned this topic. Curriculum expectations determine what to ask, not how to phrase it. Questions should sound like something a teacher would ask aloud during a classroom review game. A student should not need to decode formal curriculum language before beginning to think about the answer.

Vocabulary rule:
- Use technical vocabulary only when the term itself is the learning target.
- Otherwise prefer accessible classroom language.
- For example, use "starting amount" instead of "principal" unless the question is specifically testing that term.

Sentence and reading burden:
- Use one or two sentences per question.
- Use no unnecessary context or long setup unless the setup itself is the skill being tested.
- A student should be able to read the question and begin thinking within 15 seconds.
- Use no hidden assumptions, no long lists of conditions, and no multiple questions in one prompt.

Phrasing substitutions:
- Prefer student-friendly wording instead of curriculum-document phrasing.
- For example: "principal" -> "starting amount" unless principal is the target.
- "accrued interest" -> "interest earned" or "interest added".
- "duration" -> "length of time".
- "determine" -> "find".
- "evaluate" -> "judge" or "compare".
- "utilize" -> "use".
- "in relation to" -> "how ... compares to" or "how ... relates to".
- Remove phrases such as "demonstrate an understanding of" and ask the concept directly.
- Remove phrases such as "analyse the implications of" and ask what happens when something changes.
- "financial obligation" -> "amount owed".
- "expenditure" -> "expense" or "money spent".
- These are guidance, not mandatory replacements. Accuracy and curriculum vocabulary expectations still matter.

Difficulty and language:
- Difficulty should come from the concept or reasoning required, not from complicated wording.
- Do not increase difficulty by using longer sentences, advanced synonyms, unfamiliar terminology, or formal curriculum language.
- Increase difficulty through comparison, application, classification, error detection, interpretation, cause and effect, or connecting two familiar ideas.

Phrasing to avoid:
- Avoid phrases commonly found in curriculum documents unless students are expected to know them.
- Examples: "demonstrate an understanding of", "analyse the implications of", "evaluate the effectiveness of", "in relation to", "with respect to", "under the conditions described", "accrued value", "magnitude of", "utilize", "facilitate", "determine the extent to which".
- Replace these with direct classroom wording.

Context use:
- Use familiar situations, realistic numbers, and concise scenarios.
- Use details only when they directly affect the answer.
- Avoid unnecessary character names, complicated financial products, culturally narrow assumptions, adult experiences students may not understand, and background details that do not affect the answer.

Answer language:
- Expected answers should be concise, clearly defensible, and written in language students could reasonably produce.
- Do not require formal phrasing when a simpler correct response demonstrates the intended understanding.`;
}

function buildSubjectRulesPromptBlock(subjectFamily) {
  if (subjectFamily !== 'math') {
    return '';
  }

  return `

Math-specific generation rules:
- Favour vocabulary recall, concept identification, one-step calculation, estimation/comparison, error diagnosis, graph/table interpretation, and identifying the correct method.
- Increase difficulty through reasoning, interpretation, or method choice, not through longer computation chains.
- Avoid multi-step computation.
- Avoid unstated assumptions.
- Avoid calculator-precision answers.
- Avoid advanced content added only to make the clue feel harder.
- Avoid clues whose correctness would be hard to judge quickly when answered aloud in class.`;
}

function buildMathFormattingPromptBlock() {
  return `

Math formatting rules:
- Use standard inline LaTeX delimiters \(...\) for symbolic math.
- Because you are returning JSON, escape each backslash in the JSON text.
- Wrap the entire symbolic expression, not just part of it.
- Do not use <<MATH>> tags, $...$, $$...$$, or bare <<...>> markers.
- Do not wrap only part of a quadratic expression.
- If you need a blank inside math, use \square, not an underscore placeholder such as \_ or __.
- Good: \( (x-3)^2 + 1 \)
- Good: \( (h,k) \)
- Good: \(x^2+8x+7=(x+\square)^2-9\)
- Good in JSON text: "Solve \\(2x + 3 = 11\\)."
- Bad: <<MATH>>(x-3)^2+1<</MATH>>
- Bad: \(x-3\)^2+1
- Bad: \(x^2+8x+7=(x+\_)^2-9\)
- Bad: y=a<<x-h>>^2+k
- Before returning JSON, mentally check that every \( has a matching \) and that no << or >> markers appear anywhere.`;
}

function buildCategoryPlanPromptBlock(categoryPlan) {
  if (!categoryPlan) return '';

  const formatRound = (roundName, categories) => {
    return (categories || []).map((category, index) => {
      const slotText = (category.slotPlan || []).map(slot => `slot ${slot.slot}: ${slot.difficulty}, ${slot.archetype}`).join('; ');
      return `- ${roundName} category ${index + 1}: ${category.name}${slotText ? ` (${slotText})` : ''}`;
    }).join('\n');
  };

  const round1Text = formatRound('Round 1', categoryPlan.round1);
  const round2Text = formatRound('Round 2', categoryPlan.round2);

  return `

Use this approved category plan exactly:
${round1Text}
${round2Text}`;
}

function buildSlotPlanPromptBlock(slotPlan, label) {
  const lines = (slotPlan || []).map((slot) =>
    `- ${label} slot ${slot.slot}: ${slot.difficulty}, ${slot.archetype}`
  ).join('\n');

  return lines ? `

${label} slot plan:
${lines}` : '';
}

function buildSinglePassQuizPrompt({ topic, categories, doubleQ, curriculumPrompt, categoryPlan }) {
  const categoryPlanPrompt = buildCategoryPlanPromptBlock(categoryPlan);
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  const mathFormattingPrompt = buildMathFormattingPromptBlock();
  return `Generate a trivia quiz about "${topic}" with ${categories} categories and ${doubleQ} questions per category for EACH of two rounds. Round 1 and Round 2 must have completely different categories and different questions.${curriculumPrompt}${studentFriendlyLanguagePrompt}${categoryPlanPrompt}${mathFormattingPrompt}

For math expressions, use standard LaTeX inline delimiters: \(...\).
In the JSON text you return, escape those backslashes correctly.
Example question text: "Simplify \\(\\frac{2}{3} + \\frac{1}{6}\\)."
Example answer text: "\\(\\frac{5}{6}\\)"
Example exponent text: "Evaluate \\(10^2\\)."
Example equation text: "Solve \\(2x + 3 = 11\\)."
Example multiplication text: "Simplify \\(x^2 \\cdot x^3\\)."
Do not use <<MATH>> tags, \\[ \\], $...$, or $$...$$ in JSON strings.
Wrap every mathematical expression in \(...\), including fractions, exponents, powers, roots, negatives used mathematically, equations, inequalities, ratios, percentages when written symbolically, and algebraic expressions inside longer sentences.
If a question or answer includes both words and math, wrap only the math portion, but do not leave symbolic math outside the delimiters.
Do not use a literal * for multiplication inside math. Use juxtaposition when natural, or LaTeX such as \\cdot.

For each question, include a confidence score from 0.0 to 1.0 indicating how factually accurate you believe the question and answer pair is. Common well-known facts should be 0.8-1.0. Obscure or potentially ambiguous facts should be lower.
Mark Bonus Questions with "isBonusQuestion": true. Generate exactly 1 Bonus Question somewhere in Round 1 and exactly 2 Bonus Questions somewhere in Round 2.

Return as JSON with this exact structure:
{
  "round1": { "categories": [{ "name": "...", "questions": [{ "question": "...", "answer": "...", "confidence": 0.9, "isBonusQuestion": false }] }] },
  "round2": { "categories": [{ "name": "...", "questions": [{ "question": "...", "answer": "...", "confidence": 0.85, "isBonusQuestion": false }] }] },
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

Important: Generate exactly ${doubleQ} questions per category and exactly 3 Final Showdown options. Within each category, order the questions from easier/more straightforward to harder/more challenging so earlier questions fit lower board values and later questions fit higher board values. Round 1 must contain exactly 1 question with "isBonusQuestion": true. Round 2 must contain exactly 2 questions with "isBonusQuestion": true. The first Final Showdown option should match finalCategory/finalClue/finalAnswer for backward compatibility.`;
}

function buildCategoryGenerationPrompt({ topic, roundName, categoryName, questionsPerCategory, subjectFamily, curriculumPrompt, slotPlan }) {
  const activeSlotBlock = buildSlotPlanPromptBlock(slotPlan, 'Active');
  const bankSlotBlock = buildSlotPlanPromptBlock(slotPlan, 'Bank');
  const subjectRulesPrompt = buildSubjectRulesPromptBlock(subjectFamily);
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  const mathFormattingPrompt = buildMathFormattingPromptBlock();

  return `Generate one trivia category for a classroom review game.

Overall topic: "${topic}"
Round: ${roundName}
Category name: "${categoryName}"
Subject family: ${subjectFamily}.${curriculumPrompt}${studentFriendlyLanguagePrompt}${subjectRulesPrompt}${activeSlotBlock}${bankSlotBlock}${mathFormattingPrompt}

Requirements:
- Return valid JSON only, no markdown and no code fences.
- Generate exactly ${questionsPerCategory} active questions and exactly ${questionsPerCategory} bank questions.
- Active questions should progress from easier to harder in slot order.
- Each bank question should be an alternate for the matching active slot number, not just a generic extra question.
- Avoid duplicate or near-duplicate wording across active and bank questions.
- Include confidence for every question.
- Set isBonusQuestion to false for every generated question; Bonus Question assignment is handled later.
- For math expressions, use standard inline LaTeX delimiters \(...\).
- Because you are returning JSON, escape backslashes correctly inside string values.
- Do not use <<MATH>> tags, \[ \], $...$, or $$...$$ delimiters in JSON strings.

Return this exact JSON shape:
{
  "name": "${categoryName}",
  "activeQuestions": [
    { "slot": 1, "question": "...", "answer": "...", "confidence": 0.9, "isBonusQuestion": false }
  ],
  "bankQuestions": [
    { "slot": 1, "question": "...", "answer": "...", "confidence": 0.82, "isBonusQuestion": false }
  ]
}`;
}

function buildFinalGenerationPrompt({ topic, subjectFamily, curriculumPrompt }) {
  const subjectRulesPrompt = buildSubjectRulesPromptBlock(subjectFamily);
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  const mathFormattingPrompt = buildMathFormattingPromptBlock();
  return `Generate Final Showdown options for a classroom trivia review game.

Overall topic: "${topic}"
Subject family: ${subjectFamily}.${curriculumPrompt}${studentFriendlyLanguagePrompt}${subjectRulesPrompt}${mathFormattingPrompt}

Requirements:
- Return valid JSON only, no markdown and no code fences.
- Generate exactly 1 active final option and exactly 2 bank final options.
- Final clues should be high-impact but quickly judgeable in a classroom setting.
- Include confidence for every option.
- For math expressions, use standard inline LaTeX delimiters \(...\).
- Because you are returning JSON, escape backslashes correctly inside string values.
- Do not use <<MATH>> tags, \[ \], $...$, or $$...$$ delimiters in JSON strings.

Return this exact JSON shape:
{
  "activeFinal": { "category": "...", "question": "...", "answer": "...", "confidence": 0.85 },
  "bankFinals": [
    { "category": "...", "question": "...", "answer": "...", "confidence": 0.82 }
  ]
}`;
}

function buildCategoryVerificationPrompt({ topic, roundName, categoryName, subjectFamily, curriculumPrompt, generatedCategory }) {
  const subjectRulesPrompt = buildSubjectRulesPromptBlock(subjectFamily);
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  return `Review one generated trivia category for a classroom review game.

Overall topic: "${topic}"
Round: ${roundName}
Category name: "${categoryName}"
Subject family: ${subjectFamily}.${curriculumPrompt}${studentFriendlyLanguagePrompt}${subjectRulesPrompt}

The generated category is:
${JSON.stringify(generatedCategory, null, 2)}

Task:
- Do not rewrite any question or answer.
- Judge correctness, curriculum fit, trivia suitability, duplication, and difficulty fit.
- For math topics, penalize multi-step computation, unstated assumptions, hard-to-judge correctness, and content beyond the intended course level.
- Return only confidence adjustments and issue notes.
- Confidence adjustments must be 0 or negative numbers.

Return this exact JSON shape:
{
  "status": "pass",
  "activeQuestionReviews": [
    { "slot": 1, "confidenceAdjustment": 0, "issues": [] }
  ],
  "bankQuestionReviews": [
    { "slot": 1, "confidenceAdjustment": 0, "issues": [] }
  ],
  "categoryIssues": []
}`;
}

function buildFinalVerificationPrompt({ topic, subjectFamily, curriculumPrompt, generatedFinal }) {
  const subjectRulesPrompt = buildSubjectRulesPromptBlock(subjectFamily);
  const studentFriendlyLanguagePrompt = buildStudentFriendlyLanguagePromptBlock();
  return `Review Final Showdown options for a classroom review game.

Overall topic: "${topic}"
Subject family: ${subjectFamily}.${curriculumPrompt}${studentFriendlyLanguagePrompt}${subjectRulesPrompt}

The generated final data is:
${JSON.stringify(generatedFinal, null, 2)}

Task:
- Do not rewrite any clue or answer.
- Judge correctness, curriculum fit, trivia suitability, duplication, and whether the final is quickly judgeable in a classroom setting.
- Return only confidence adjustments and issue notes.
- Confidence adjustments must be 0 or negative numbers.

Return this exact JSON shape:
{
  "status": "pass",
  "activeFinalReview": { "confidenceAdjustment": 0, "issues": [] },
  "bankFinalReviews": [
    { "index": 0, "confidenceAdjustment": 0, "issues": [] }
  ],
  "finalIssues": []
}`;
}

module.exports = {
  buildCurriculumPrompt,
  buildStudentFriendlyLanguagePromptBlock,
  buildSubjectRulesPromptBlock,
  buildCategoryPlanPromptBlock,
  buildSinglePassQuizPrompt,
  buildCategoryGenerationPrompt,
  buildFinalGenerationPrompt,
  buildCategoryVerificationPrompt,
  buildFinalVerificationPrompt,
};
