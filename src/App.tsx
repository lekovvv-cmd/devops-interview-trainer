import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then(({ DashboardPage: page }) => ({ default: page })))
const LabPage = lazy(() => import('./pages/LabPage').then(({ LabPage: page }) => ({ default: page })))
const LessonPage = lazy(() => import('./pages/LessonPage').then(({ LessonPage: page }) => ({ default: page })))
const ModulesPage = lazy(() => import('./pages/ModulesPage').then(({ ModulesPage: page }) => ({ default: page })))
const ProgressPage = lazy(() => import('./pages/ProgressPage').then(({ ProgressPage: page }) => ({ default: page })))
const QuizPage = lazy(() => import('./pages/QuizPage').then(({ QuizPage: page }) => ({ default: page })))
const InterviewPage = lazy(() => import('./pages/InterviewPage').then(({ InterviewPage: page }) => ({ default: page })))

export default function App() {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#101416] font-mono text-sm text-lime-300">Загрузка тренажёра…</div>}><Routes><Route element={<AppShell />}><Route index element={<DashboardPage />} /><Route path="modules" element={<ModulesPage />} /><Route path="modules/:moduleId" element={<LessonPage />} /><Route path="quiz" element={<QuizPage />} /><Route path="interview" element={<InterviewPage />} /><Route path="labs/:domain" element={<LabPage />} /><Route path="progress" element={<ProgressPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes></Suspense>
}
