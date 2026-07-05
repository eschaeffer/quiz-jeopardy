function detectSubjectFamily({ topic = '', curriculum } = {}) {
  const normalizedTopic = String(topic || '').trim().toLowerCase();
  const courseCode = String(curriculum?.course_code || curriculum?.courseCode || '').trim().toUpperCase();
  const subjectArea = String(curriculum?.subject_area || curriculum?.subjectArea || '').trim().toLowerCase();

  if (courseCode.startsWith('M') && subjectArea === 'mathematics') {
    return 'math';
  }

  const mathTerms = [
    'math', 'algebra', 'geometry', 'trigonometry', 'fractions', 'equations',
    'quadratics', 'slope', 'graphing', 'interest rates', 'linear relations'
  ];

  if (mathTerms.some((term) => normalizedTopic.includes(term))) {
    return 'math';
  }

  return 'default';
}

module.exports = {
  detectSubjectFamily,
};
