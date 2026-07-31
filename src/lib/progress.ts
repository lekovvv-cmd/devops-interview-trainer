import { quizQuestions, studyLessons } from '../data/learning'
import { scenarios } from '../data/scenarios'
import type { Confidence, LabAttempt, QuizAttempt, ReviewProgress } from '../store/progressStore'
import type { ModuleId } from '../types/domain'

export type ProgressInput = {
  completedModules: Partial<Record<ModuleId, boolean>>
  quizAttempts: QuizAttempt[]
  labAttempts: Record<string, LabAttempt>
  interviewConfidence: Record<string, Confidence>
  reviewProgress: Record<string, ReviewProgress>
}

export type LessonProgress = { lessonId: ModuleId; readiness: number; quizAccuracy: number; completedLabs: number; labCount: number; weakness: number }

export function lessonProgress(input: ProgressInput, lessonId: ModuleId): LessonProgress {
  const lessonQuestions = quizQuestions.filter((question) => question.lessonId === lessonId)
  const attempts = input.quizAttempts.filter((attempt) => lessonQuestions.some((question) => question.id === attempt.questionId))
  const quizAccuracy = attempts.length ? attempts.filter((attempt) => attempt.correct).length / attempts.length : 0
  const interviewItems = (studyLessons.find((lesson) => lesson.id === lessonId)?.interview ?? [])
    .map((question) => input.interviewConfidence[question.id])
    .filter(Boolean)
  const interviewScore = interviewItems.length ? interviewItems.reduce((sum, value) => sum + confidenceValue(value), 0) / interviewItems.length : 0
  const cards = studyLessons.find((lesson) => lesson.id === lessonId)?.cards ?? []
  const reviewedCards = cards.map((card) => input.reviewProgress[card.id]?.confidence).filter(Boolean)
  const cardScore = reviewedCards.length ? reviewedCards.reduce((sum, value) => sum + confidenceValue(value), 0) / reviewedCards.length : 0
  const relatedScenarios = scenarios.filter((scenario) => scenario.lessonIds.includes(lessonId))
  const completedLabs = relatedScenarios.filter((scenario) => Boolean(input.labAttempts[scenario.id])).length
  const labScore = relatedScenarios.length ? completedLabs / relatedScenarios.length : 0
  const manualScore = input.completedModules[lessonId] ? 1 : 0
  const readiness = clamp(Math.round(manualScore * 10 + quizAccuracy * 45 + interviewScore * 20 + cardScore * 10 + labScore * 15))
  const weakness = clamp(Math.round((1 - readiness / 100) * 70 + (attempts.length && quizAccuracy < 0.7 ? 15 : 0) + (interviewItems.some((value) => value !== 'confident') ? 10 : 0) + (completedLabs < relatedScenarios.length ? 5 : 0)))
  return { lessonId, readiness, quizAccuracy: Math.round(quizAccuracy * 100), completedLabs, labCount: relatedScenarios.length, weakness }
}

export function progressSummary(input: ProgressInput) {
  const lessons = studyLessons.map((lesson) => lessonProgress(input, lesson.id))
  const overall = clamp(Math.round(lessons.reduce((sum, lesson) => sum + lesson.readiness, 0) / lessons.length))
  const allAttempts = input.quizAttempts.filter((attempt) => quizQuestions.some((question) => question.id === attempt.questionId))
  const quizAccuracy = allAttempts.length ? Math.round(allAttempts.filter((attempt) => attempt.correct).length / allAttempts.length * 100) : 0
  const weakLessons = [...lessons].filter((lesson) => lesson.weakness > 0).sort((left, right) => right.weakness - left.weakness)
  return { lessons, overall, quizAccuracy, attempts: allAttempts.length, solvedLabs: Object.keys(input.labAttempts).filter((id) => scenarios.some((scenario) => scenario.id === id)).length, totalLabs: scenarios.length, weakLessons }
}

const confidenceValue = (confidence: Confidence | undefined) => confidence === 'confident' ? 1 : confidence === 'partial' ? 0.5 : 0
const clamp = (value: number) => Math.max(0, Math.min(100, value))
