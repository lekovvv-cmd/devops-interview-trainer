import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ModuleId } from '../types/domain'

export interface QuizAttempt {
  questionId: string
  correct: boolean
  completedAt: string
}

export interface LabAttempt {
  score: number
  usedHints: number
  completedAt: string
}

export type Confidence = 'missed' | 'partial' | 'confident'

export interface ReviewProgress {
  confidence: Confidence
  dueAt: string
  updatedAt: string
}

interface ProgressState {
  completedModules: Partial<Record<ModuleId, boolean>>
  quizAttempts: QuizAttempt[]
  labAttempts: Record<string, LabAttempt>
  interviewConfidence: Record<string, Confidence>
  reviewProgress: Record<string, ReviewProgress>
  lastLesson?: ModuleId
  completeModule: (id: ModuleId) => void
  recordQuiz: (questionId: string, correct: boolean) => void
  recordLab: (scenarioId: string, score: number, usedHints: number) => void
  recordInterviewConfidence: (questionId: string, confidence: Confidence) => void
  recordReview: (cardId: string, confidence: Confidence) => void
  setLastLesson: (id: ModuleId) => void
  resetProgress: () => void
}

const initialState = {
  completedModules: {},
  quizAttempts: [],
  labAttempts: {},
  interviewConfidence: {},
  reviewProgress: {},
  lastLesson: undefined,
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      ...initialState,
      completeModule: (id) => set((state) => ({ completedModules: { ...state.completedModules, [id]: true }, lastLesson: id })),
      recordQuiz: (questionId, correct) => set((state) => ({ quizAttempts: [...state.quizAttempts.filter((attempt) => attempt.questionId !== questionId), { questionId, correct, completedAt: new Date().toISOString() }] })),
      recordLab: (scenarioId, score, usedHints) => set((state) => ({ labAttempts: { ...state.labAttempts, [scenarioId]: { score, usedHints, completedAt: new Date().toISOString() } } })),
      recordInterviewConfidence: (questionId, confidence) => set((state) => ({ interviewConfidence: { ...state.interviewConfidence, [questionId]: confidence } })),
      recordReview: (cardId, confidence) => set((state) => {
        const now = new Date()
        const delay = confidence === 'missed' ? 1 : confidence === 'partial' ? 3 : 10
        const dueAt = new Date(now.getTime() + delay * 24 * 60 * 60 * 1000).toISOString()
        return { reviewProgress: { ...state.reviewProgress, [cardId]: { confidence, dueAt, updatedAt: now.toISOString() } } }
      }),
      setLastLesson: (id) => set({ lastLesson: id }),
      resetProgress: () => set(initialState),
    }),
    { name: 'devops-interview-trainer-progress', storage: createJSONStorage(() => localStorage) },
  ),
)
