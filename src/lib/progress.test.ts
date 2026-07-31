import { describe, expect, it } from 'vitest'
import { quizQuestions, studyLessons } from '../data/learning'
import { scenarios } from '../data/scenarios'
import { lessonProgress, progressSummary } from './progress'
import { migrateProgressState, progressStorageVersion } from '../store/progressStore'

const empty = { completedModules: {}, quizAttempts: [], labAttempts: {}, interviewConfidence: {}, reviewProgress: {} }

describe('canonical learning data and progress', () => {
  it('gives every one of the ten lessons five distinct question kinds', () => {
    expect(studyLessons).toHaveLength(10)
    for (const lesson of studyLessons) {
      const questions = quizQuestions.filter((question) => question.lessonId === lesson.id)
      expect(questions).toHaveLength(5)
      expect(questions.filter((question) => question.kind === 'single')).toHaveLength(2)
      expect(questions.filter((question) => question.kind === 'multiple')).toHaveLength(1)
      expect(questions.filter((question) => question.kind === 'command')).toHaveLength(1)
      expect(questions.filter((question) => question.kind === 'open')).toHaveLength(1)
    }
  })

  it('never creates readiness from a click alone and keeps overall readiness bounded', () => {
    const lesson = studyLessons[0]
    const clicked = lessonProgress({ ...empty, completedModules: { [lesson.id]: true } }, lesson.id)
    expect(clicked.readiness).toBe(10)

    const impossible = progressSummary({
      completedModules: Object.fromEntries(studyLessons.map((item) => [item.id, true])),
      quizAttempts: quizQuestions.map((question) => ({ questionId: question.id, correct: true, completedAt: '2026-07-31T00:00:00.000Z' })),
      labAttempts: Object.fromEntries(scenarios.map((scenario) => [scenario.id, { score: 100, usedHints: 0, completedAt: '2026-07-31T00:00:00.000Z' }])),
      interviewConfidence: Object.fromEntries(studyLessons.flatMap((item) => item.interview.map((question) => [question.id, 'confident'] as const))),
      reviewProgress: Object.fromEntries(studyLessons.flatMap((item) => item.cards.map((card) => [card.id, { confidence: 'confident' as const, dueAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z' }]))),
    })
    expect(impossible.overall).toBeGreaterThanOrEqual(0)
    expect(impossible.overall).toBeLessThanOrEqual(100)
    expect(impossible.lessons).toHaveLength(10)
  })

  it('uses quiz errors, interview confidence, cards and incomplete labs to find weak topics', () => {
    const progress = progressSummary({
      ...empty,
      quizAttempts: [{ questionId: 'linux-processes-single-1', correct: false, completedAt: '2026-07-31T00:00:00.000Z' }],
      interviewConfidence: { 'proc-ans-1': 'missed' },
      reviewProgress: { 'proc-card-1': { confidence: 'missed', dueAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z' } },
    })
    expect(progress.weakLessons[0].lessonId).toBe('linux-processes')
    expect(progress.quizAccuracy).toBe(0)
  })

  it('resets incompatible persisted state through the explicit versioned migration', () => {
    const migrated = migrateProgressState({ completedModules: { legacy: true } }, 1)
    expect(progressStorageVersion).toBe(2)
    expect(migrated).toEqual(empty)
  })
})
