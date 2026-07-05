const { getCurriculumMetadata, getCourses, getFocusAreas } = require('./curriculum');
const curriculumData = require('./curriculum-data/ontario-expectations.json');

const CURRICULUM_META_VERSION = '2026-07-05-mfm2p';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const curricula = getCurriculumMetadata().map((curriculum) => ({
    id: curriculum.id,
    label: curriculum.id === 'ontario' ? 'Ontario, Canada' : curriculum.label,
    jurisdiction: curriculum.jurisdiction,
    courses: getCourses({ curriculumId: curriculum.id }).map((course) => ({
      course_code: course.course_code,
      label: course.label,
      grade: course.grade,
      subject_area: course.subject_area,
      course_name: course.course_name,
      course_type: course.course_type,
      focus_areas: getFocusAreas({
        curriculumId: curriculum.id,
        courseCode: course.course_code,
        grade: course.grade,
        subjectArea: course.subject_area,
      }),
    })),
  }));

  const debug = {
    version: CURRICULUM_META_VERSION,
    generated_at: new Date().toISOString(),
    concept_count: Array.isArray(curriculumData.concepts) ? curriculumData.concepts.length : 0,
    expectation_count: Array.isArray(curriculumData.expectations) ? curriculumData.expectations.length : 0,
    course_codes: curricula.flatMap((curriculum) => (curriculum.courses || []).map((course) => course.course_code)),
  };

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ curricula, debug }),
  };
};
