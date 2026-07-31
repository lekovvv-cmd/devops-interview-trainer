import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ModuleId } from '../types/domain'

export interface QuizAttempt { questionId: string; correct: boolean; completedAt: string }
export interface LabAttempt { score: number; usedHints: number; completedAt: string }
export type Confidence = 'missed' | 'partial' | 'confident'
export interface ReviewProgress { confidence: Confidence; dueAt: string; updatedAt: string }

export interface ProgressState {
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

export const progressStorageVersion = 2
export const initialProgressState = { completedModules: {}, quizAttempts: [], labAttempts: {}, interviewConfidence: {}, reviewProgress: {}, lastLesson: undefined }
export const migrateProgressState = (persistedState?: unknown, version?: number): typeof initialProgressState => {
  void persistedState
  void version
  return { ...initialProgressState, completedModules: {}, quizAttempts: [], labAttempts: {}, interviewConfidence: {}, reviewProgress: {} }
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      ...initialProgressState,
      completeModule: (id) => set((state) => ({ completedModules: { ...state.completedModules, [id]: true }, lastLesson: id })),
      recordQuiz: (questionId, correct) => set((state) => ({ quizAttempts: [...state.quizAttempts.filter((attempt) => attempt.questionId !== questionId), { questionId, correct, completedAt: new Date().toISOString() }] })),
      recordLab: (scenarioId, score, usedHints) => set((state) => ({ labAttempts: { ...state.labAttempts, [scenarioId]: { score, usedHints, completedAt: new Date().toISOString() } } })),
      recordInterviewConfidence: (questionId, confidence) => set((state) => ({ interviewConfidence: { ...state.interviewConfidence, [questionId]: confidence } })),
      recordReview: (cardId, confidence) => set((state) => { const now = new Date(); const days = confidence === 'missed' ? 1 : confidence === 'partial' ? 3 : 10; return { reviewProgress: { ...state.reviewProgress, [cardId]: { confidence, dueAt: new Date(now.getTime() + days * 86_400_000).toISOString(), updatedAt: now.toISOString() } } } }),
      setLastLesson: (id) => set({ lastLesson: id }),
      resetProgress: () => set(initialProgressState),
    }),
    {
      name: 'devops-interview-trainer-progress',
      version: progressStorageVersion,
      storage: createJSONStorage(() => localStorage),
      migrate: migrateProgressState,
    },
  ),
)
