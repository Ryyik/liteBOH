export function createEmptyScores() {
  return { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
}

export function calculateScores(questions, answers = {}) {
  const scores = createEmptyScores();

  questions.forEach((question) => {
    const score = answers[question.id];
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return;
    }

    const finalScore = question.reverse ? 6 - score : score;
    if (scores[question.dimension] !== undefined) {
      scores[question.dimension] += finalScore;
    }
  });

  return scores;
}

export function deriveMbtiType(scores) {
  return [
    scores.E >= scores.I ? 'E' : 'I',
    scores.S >= scores.N ? 'S' : 'N',
    scores.T >= scores.F ? 'T' : 'F',
    scores.J >= scores.P ? 'J' : 'P',
  ].join('');
}

export function buildMbtiDimensions(scores) {
  const dimensions = [
    { key: 'EI', leftKey: 'E', leftLabel: '外向', rightKey: 'I', rightLabel: '内向', s1: scores.E, s2: scores.I },
    { key: 'SN', leftKey: 'S', leftLabel: '实感', rightKey: 'N', rightLabel: '直觉', s1: scores.S, s2: scores.N },
    { key: 'TF', leftKey: 'T', leftLabel: '思考', rightKey: 'F', rightLabel: '情感', s1: scores.T, s2: scores.F },
    { key: 'JP', leftKey: 'J', leftLabel: '判断', rightKey: 'P', rightLabel: '知觉', s1: scores.J, s2: scores.P },
  ];

  return dimensions.map((dimension) => {
    const total = dimension.s1 + dimension.s2;
    const isRight = dimension.s2 > dimension.s1;
    const percentage = Math.round((Math.max(dimension.s1, dimension.s2) / (total || 1)) * 100);

    return { ...dimension, isRight, percentage };
  });
}

export function getFirstUnansweredQuestionId(questions, answers = {}) {
  const unanswered = questions.find((question) => answers[question.id] === undefined);
  return unanswered ? unanswered.id : null;
}
