const curriculumData = require('./curriculum-data/ontario-expectations.json');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function tokenize(value) {
  const stopwords = new Set(['and', 'the', 'for', 'with', 'using', 'use', 'into', 'from', 'that', 'this']);
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2 && !stopwords.has(token));
}

function getCurriculumMetadata() {
  return curriculumData.curricula || [];
}

function formatCourseLabel(course) {
  if (!course) return '';
  if (course.course_name) {
    return course.course_type
      ? `${course.course_name} (${course.course_code})`
      : `${course.course_name} (${course.course_code})`;
  }
  if (course.grade && course.subject_area) {
    return `Grade ${course.grade} ${course.subject_area} (${course.course_code})`;
  }
  return course.course_code || '';
}

function getCourses({ curriculumId = 'ontario' } = {}) {
  const courseMap = new Map();

  const registerCourse = (record = {}) => {
    const courseCode = String(record.course_code || '').trim().toUpperCase();
    if (!courseCode) return;
    if (courseMap.has(courseCode)) return;

    const course = {
      curriculum_id: curriculumId,
      course_code: courseCode,
      grade: record.grade || null,
      subject_area: record.subject_area || '',
      course_name: record.course_name || '',
      course_type: record.course_type || '',
    };

    course.label = formatCourseLabel(course);
    courseMap.set(courseCode, course);
  };

  (curriculumData.concepts || [])
    .filter(concept => concept.status === 'active' && concept.curriculum_id === curriculumId)
    .forEach(registerCourse);

  (curriculumData.expectations || [])
    .filter(expectation => expectation.status === 'active' && expectation.curriculum_id === curriculumId)
    .forEach(registerCourse);

  return Array.from(courseMap.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function getConcepts({ curriculumId = 'ontario', courseCode, grade, subjectArea } = {}) {
  const normalizedCourse = normalize(courseCode);
  const normalizedSubject = normalize(subjectArea);

  return (curriculumData.concepts || []).filter(concept => {
    if (concept.status !== 'active') return false;
    if (concept.curriculum_id !== curriculumId) return false;
    if (normalizedCourse && normalize(concept.course_code) !== normalizedCourse) return false;
    if (grade && Number(concept.grade) !== Number(grade)) return false;
    if (normalizedSubject && normalize(concept.subject_area) !== normalizedSubject) return false;
    return true;
  });
}

function getFocusAreas({ curriculumId = 'ontario', courseCode, grade, subjectArea } = {}) {
  return getConcepts({ curriculumId, courseCode, grade, subjectArea }).map((concept) => ({
    id: concept.id,
    name: concept.name,
    description: concept.description,
    keywords: concept.keywords || [],
    related_expectations: concept.related_expectations || [],
  }));
}

function findConcept({ curriculumId = 'ontario', courseCode, grade, subjectArea, conceptId, conceptName } = {}) {
  const normalizedConceptId = normalize(conceptId);
  const normalizedConceptName = normalize(conceptName);

  if (!normalizedConceptId && !normalizedConceptName) return null;

  return getConcepts({ curriculumId, courseCode, grade, subjectArea }).find(concept => (
    (normalizedConceptId && normalize(concept.id) === normalizedConceptId) ||
    (normalizedConceptName && normalize(concept.name) === normalizedConceptName)
  )) || null;
}

function scoreExpectation(expectation, topic, topicTokens) {
  if (topicTokens.length === 0) return 0;

  const normalizedTopic = normalize(topic);
  const tags = [
    ...(expectation.keywords || []),
    ...(expectation.skill_tags || []),
    ...(expectation.content_tags || []),
  ].map(normalize);

  const searchable = [
    expectation.expectation_code,
    expectation.expectation_text,
    expectation.strand_name,
    ...tags,
  ].map(normalize).join(' ');

  const phraseScore = normalizedTopic && tags.includes(normalizedTopic) ? 10 : 0;
  return phraseScore + topicTokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
}

function retrieveExpectations({ curriculumId = 'ontario', courseCode, grade, subjectArea, topic = '', conceptId, conceptName, limit = 6 } = {}) {
  const concept = findConcept({ curriculumId, courseCode, grade, subjectArea, conceptId, conceptName });
  const retrievalTopic = concept ? `${concept.name} ${topic}` : topic;
  const conceptCodes = new Set((concept?.related_expectations || []).map(normalize));
  const topicTokens = tokenize(topic);
  const retrievalTokens = tokenize(retrievalTopic);
  const normalizedCourse = normalize(courseCode);
  const normalizedSubject = normalize(subjectArea);

  const hardFiltered = (curriculumData.expectations || []).filter(expectation => {
    if (expectation.status !== 'active') return false;
    if (expectation.curriculum_id !== curriculumId) return false;
    if (normalizedCourse) return normalize(expectation.course_code) === normalizedCourse;
    if (grade && Number(expectation.grade) !== Number(grade)) return false;
    if (normalizedSubject && normalize(expectation.subject_area) !== normalizedSubject) return false;
    return true;
  });

  const scored = hardFiltered
    .map(expectation => {
      const conceptMatch = conceptCodes.has(normalize(expectation.expectation_code));
      const topicScore = scoreExpectation(expectation, retrievalTopic, retrievalTokens);
      return { expectation, score: (conceptMatch ? 100 : 0) + topicScore, conceptMatch };
    })
    .filter(result => conceptCodes.size > 0 ? result.conceptMatch || result.score > 0 : topicTokens.length === 0 || result.score > 0);

  return scored
    .sort((a, b) => b.score - a.score || a.expectation.id.localeCompare(b.expectation.id))
    .slice(0, limit)
    .map(({ expectation, score }) => ({ ...expectation, retrieval_score: score }));
}

function retrieveCurriculumContext({ curriculumId = 'ontario', courseCode, grade, subjectArea, topic = '', conceptId, conceptName, limit = 6 } = {}) {
  const concept = findConcept({ curriculumId, courseCode, grade, subjectArea, conceptId, conceptName });
  const expectations = retrieveExpectations({ curriculumId, courseCode, grade, subjectArea, topic, conceptId, conceptName, limit });

  return { concept, expectations };
}

function assessNarrowTopicRelevance({ curriculumId = 'ontario', courseCode, grade, subjectArea, conceptId, conceptName, narrowTopic = '' } = {}) {
  const trimmedTopic = String(narrowTopic || '').trim();
  if (!trimmedTopic) {
    return { status: 'not_provided', accepted: false, score: 0, sampledExpectations: [] };
  }

  const concept = findConcept({ curriculumId, courseCode, grade, subjectArea, conceptId, conceptName });
  const normalizedCourse = normalize(courseCode);
  const normalizedSubject = normalize(subjectArea);
  const conceptCodes = new Set((concept?.related_expectations || []).map(normalize));
  const topicTokens = tokenize(trimmedTopic);

  const candidates = (curriculumData.expectations || []).filter(expectation => {
    if (expectation.status !== 'active') return false;
    if (expectation.curriculum_id !== curriculumId) return false;
    if (normalizedCourse && normalize(expectation.course_code) !== normalizedCourse) return false;
    if (grade && Number(expectation.grade) !== Number(grade)) return false;
    if (normalizedSubject && normalize(expectation.subject_area) !== normalizedSubject) return false;
    if (conceptCodes.size > 0) return conceptCodes.has(normalize(expectation.expectation_code));
    return true;
  });

  const scored = candidates
    .map((expectation) => ({
      expectation,
      score: scoreExpectation(expectation, trimmedTopic, topicTokens),
    }))
    .sort((a, b) => b.score - a.score || a.expectation.id.localeCompare(b.expectation.id));

  const topScore = scored[0]?.score || 0;
  const sampledExpectations = scored.slice(0, 3).map(({ expectation, score }) => ({
    expectation_code: expectation.expectation_code,
    strand_name: expectation.strand_name,
    expectation_text: expectation.expectation_text,
    retrieval_score: score,
  }));

  if (topScore >= 5) {
    return { status: 'accepted', accepted: true, score: topScore, sampledExpectations };
  }
  if (topScore === 0) {
    return { status: 'rejected', accepted: false, score: topScore, sampledExpectations };
  }

  return { status: 'ambiguous', accepted: false, score: topScore, sampledExpectations };
}

function formatExpectationsForPrompt(expectations, concept) {
  if ((!expectations || expectations.length === 0) && !concept) return '';

  const conceptContext = concept
    ? `Selected focus area: ${concept.name}. ${concept.description}`
    : '';

  const expectationContext = expectations && expectations.length > 0
    ? expectations.map(expectation => (
      `- ${expectation.course_code || `Grade ${expectation.grade} ${expectation.subject_area}`} ${expectation.expectation_code} (${expectation.strand_name}): ${expectation.expectation_text}`
    )).join('\n')
    : '';

  return [conceptContext, expectationContext].filter(Boolean).join('\n');
}

module.exports = {
  getCurriculumMetadata,
  getCourses,
  getConcepts,
  getFocusAreas,
  retrieveExpectations,
  retrieveCurriculumContext,
  assessNarrowTopicRelevance,
  formatExpectationsForPrompt,
};
