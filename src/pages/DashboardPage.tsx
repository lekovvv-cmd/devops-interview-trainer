import { ArrowRight, BookOpen, BrainCircuit, CalendarClock, MessageSquare, Play, TerminalSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import { studyLessons, type StudyLesson } from '../data/learning'
import { ProgressBar } from '../components/ui'
import { useProgressStore } from '../store/progressStore'
import { progressSummary } from '../lib/progress'

export function DashboardPage() {
  const completed = useProgressStore((state) => state.completedModules)
  const labs = useProgressStore((state) => state.labAttempts)
  const lastLesson = useProgressStore((state) => state.lastLesson)
  const reviewProgress = useProgressStore((state) => state.reviewProgress)
  const interviewConfidence = useProgressStore((state) => state.interviewConfidence)
  const attempts = useProgressStore((state) => state.quizAttempts)
  const completedCount = Object.keys(completed).length
  const current = (lastLesson && studyLessons.find((lesson) => lesson.id === lastLesson)) ?? studyLessons.find((lesson) => !completed[lesson.id]) ?? studyLessons[0]
  const summary = progressSummary({ completedModules: completed, quizAttempts: attempts, labAttempts: labs, interviewConfidence, reviewProgress })
  const weak = studyLessons.find((lesson) => lesson.id === summary.weakLessons[0]?.lessonId) ?? current
  const due = Object.values(reviewProgress).filter((item) => new Date(item.dueAt).getTime() <= Date.now()).length
  const reviewCount = due || current.cards.length
  const readiness = summary.overall
  const labRoute = current.challenge.route

  return <div className="space-y-7">
    <section className="flex flex-col justify-between gap-5 border-b border-[#263035] pb-7 sm:flex-row sm:items-end">
      <div><p className="font-mono text-xs uppercase tracking-wide text-lime-300">Локальный учебный план · сегодня</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Продолжай обучение</h1><p className="mt-2 max-w-2xl text-base leading-7 text-slate-400">Следующий шаг подобран по текущей теме, карточкам и ответам на собеседовании.</p></div>
      <Link to={`/modules/${current.id}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-lime-300 bg-lime-300 px-4 text-sm font-semibold text-[#111711] transition hover:bg-lime-200"><Play size={16} fill="currentColor" />Продолжить урок</Link>
    </section>

    <section className="grid gap-4 md:grid-cols-3"><Metric label="Готовность" value={`${readiness}%`} note={`${completedCount} из ${studyLessons.length} уроков отмечены пройденными`} progress={readiness} /><Metric label="Карточки на сегодня" value={String(reviewCount)} note={due ? 'срок повторения уже наступил' : 'первые карточки текущей темы'} progress={Math.min(100, reviewCount * 20)} /><Metric label="Лаборатории" value={`${summary.solvedLabs} / ${summary.totalLabs}`} note="разобранных самостоятельных задач" progress={Math.round((summary.solvedLabs / summary.totalLabs) * 100)} /></section>

    <section className="grid gap-4 xl:grid-cols-4">
      <ActionCard icon={<BookOpen size={20} />} label="Сейчас изучаем" title={current.title} body={current.goal} to={`/modules/${current.id}`} action="Открыть урок" />
      <ActionCard icon={<CalendarClock size={20} />} label="Повторить сегодня" title={`${reviewCount} карточек`} body="Вспомни термин, команду, вывод или следующий диагностический шаг." to={`/modules/${current.id}#review`} action="Повторить" />
      <ActionCard icon={<BrainCircuit size={20} />} label="Слабая тема" title={weak.title} body="Тема выбрана по самооценкам интервью и незавершённым урокам." to={`/interview?lesson=${weak.id}`} action="Потренировать ответ" />
      <ActionCard icon={<TerminalSquare size={20} />} label="Ближайшая практика" title={current.challenge.title} body="Самостоятельный сценарий без подсказок и единственного верного пути." to={labRoute} action="Открыть терминал" />
    </section>

    <section className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-xs uppercase tracking-wide text-lime-300">Готовые занятия</p><h2 className="mt-2 text-xl font-semibold text-white">Выбери время — тренажёр соберёт подходящий следующий шаг</h2></div><p className="text-sm text-slate-400">Тема: {current.title}</p></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><SessionLink label="10 минут" body="карточки и один вывод" to={`/modules/${current.id}#review`} /><SessionLink label="20 минут" body="теория и проверки" to={`/modules/${current.id}`} /><SessionLink label="30 минут" body="урок и guided practice" to={`/modules/${current.id}#guided`} /><SessionLink label="45 минут" body="урок и самостоятельная лаба" to={labRoute} /><SessionLink label="Пробное интервью" body="вопросы и диагностика" to={`/interview?lesson=${current.id}`} interview /></div>
    </section>

    <section><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-semibold text-white">Все эталонные уроки</h2><p className="mt-1 text-sm text-slate-400">У каждого — свой план, объяснения трёх уровней, практика, интервью и повторение.</p></div><Link to="/modules" className="text-sm font-medium text-lime-300 hover:text-lime-200">Открыть программу</Link></div><div className="divide-y divide-[#263035] overflow-hidden rounded-lg border border-[#2d383d] bg-[#151b1e]">{studyLessons.map((lesson, index) => <LessonRow key={lesson.id} lesson={lesson} index={index} completed={Boolean(completed[lesson.id])} />)}</div></section>
  </div>
}

function ActionCard({ icon, label, title, body, to, action }: { icon: React.ReactNode; label: string; title: string; body: string; to: string; action: string }) {
  return <div className="flex min-h-52 flex-col rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><div className="flex items-center gap-2 text-lime-300">{icon}<p className="font-mono text-xs uppercase tracking-wide">{label}</p></div><h2 className="mt-4 font-semibold leading-6 text-white">{title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{body}</p><Link to={to} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-lime-300 hover:text-lime-200">{action}<ArrowRight size={15} /></Link></div>
}

function SessionLink({ label, body, to, interview = false }: { label: string; body: string; to: string; interview?: boolean }) {
  return <Link to={to} className="rounded-md border border-[#394348] bg-[#151b1e] p-4 transition hover:border-lime-300/70 hover:bg-[#1c2428]"><div className="flex items-center justify-between"><p className="font-semibold text-white">{label}</p>{interview ? <MessageSquare size={16} className="text-lime-300" /> : <ArrowRight size={16} className="text-lime-300" />}</div><p className="mt-2 text-xs leading-5 text-slate-400">{body}</p></Link>
}

function LessonRow({ lesson, index, completed }: { lesson: StudyLesson; index: number; completed: boolean }) {
  return <Link to={`/modules/${lesson.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-[#1c2428]"><span className="font-mono text-sm text-lime-300">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><p className="font-medium text-slate-100">{lesson.title}</p><p className="mt-1 truncate text-sm text-slate-500">{lesson.duration} · {lesson.goal}</p></div><span className={completed ? 'text-sm text-lime-300' : 'text-sm text-slate-500'}>{completed ? 'Пройден' : 'Открыть'}</span></Link>
}

function Metric({ label, value, note, progress }: { label: string; value: string; note: string; progress: number }) {
  return <div className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p><ProgressBar className="mt-4" value={progress} /><p className="mt-3 text-xs text-slate-500">{note}</p></div>
}
