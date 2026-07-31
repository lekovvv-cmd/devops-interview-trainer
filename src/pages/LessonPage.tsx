import { ArrowLeft, CheckCircle2, ChevronRight, Lightbulb, MessageSquare, RotateCcw, TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { lessonById, lessonCycle, lessonPlans, type StudyLesson } from '../data/learning'
import { Button, SecondaryButton, SuccessNotice } from '../components/ui'
import { useProgressStore } from '../store/progressStore'
import { matchesAcceptedCommand } from '../lib/terminal/commandParser'

type Level = 'simple' | 'technical' | 'interview'
const labels: Record<Level, string> = { simple: 'Простое объяснение', technical: 'Как это работает', interview: 'Как ответить на собеседовании' }

export function LessonPage() {
  const { moduleId } = useParams()
  const lesson = moduleId ? lessonById.get(moduleId as StudyLesson['id']) : undefined
  const completed = useProgressStore((state) => state.completedModules)
  const completeModule = useProgressStore((state) => state.completeModule)
  const setLastLesson = useProgressStore((state) => state.setLastLesson)
  if (!lesson) return <Navigate to="/modules" replace />

  return <article className="mx-auto max-w-6xl pb-10">
    <Link to="/modules" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} />Все уроки</Link>
    <header className="mt-5 border-b border-[#263035] pb-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-xs uppercase tracking-wide text-lime-300">{lesson.duration} · учебный маршрут</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{lesson.title}</h1><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{lesson.goal}</p></div><a href="#guided" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-lime-300 bg-lime-300 px-4 text-sm font-semibold text-[#111711] hover:bg-lime-200"><TerminalSquare size={16} />Начать практику</a></div>
      <ol className="mt-7 grid gap-2 text-xs text-slate-400 sm:grid-cols-5">{lessonPlans[lesson.id].map((stage, index) => <li key={stage} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full border border-[#465158] font-mono text-[10px] text-lime-300">{index + 1}</span>{stage}</li>)}</ol><p className="mt-4 text-xs text-slate-500">Формат каждого этапа одинаков: {lessonCycle.slice(2).join(' → ')}.</p>
    </header>

    <section className="mt-7 rounded-lg border border-[#394348] bg-[#171d20] p-5 sm:p-6"><p className="font-mono text-xs uppercase tracking-wide text-lime-300">Ситуация из работы</p><p className="mt-3 max-w-4xl text-base leading-7 text-slate-200">{lesson.situation}</p></section>

    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-10">
        <ExplanationExplorer lesson={lesson} />
        <FlowDiagram nodes={lesson.diagram} />
        <CommandBreakdown lesson={lesson} />
        <TerminalReading lesson={lesson} />
        <KnowledgeChecks lesson={lesson} />
        <GuidedPractice lesson={lesson} />
        <IndependentChallenge lesson={lesson} />
        <InterviewPreview lesson={lesson} />
        <Flashcards lesson={lesson} />
      </div>
      <aside className="h-fit rounded-lg border border-[#2d383d] bg-[#151b1e] p-5 xl:sticky xl:top-20"><p className="font-mono text-xs uppercase tracking-wide text-slate-500">Цель урока</p><p className="mt-3 text-sm leading-6 text-slate-200">Не запоминать команды отдельно, а каждый раз понимать: что проверить, почему и какой следующий шаг логичен.</p><div className="mt-6 border-t border-[#2d383d] pt-5"><p className="text-sm text-slate-400">Статус</p><p className={`mt-2 flex items-center gap-2 text-sm font-medium ${completed[lesson.id] ? 'text-lime-300' : 'text-slate-100'}`}>{completed[lesson.id] && <CheckCircle2 size={16} />}{completed[lesson.id] ? 'Урок пройден' : 'В процессе'}</p><Button className="mt-4 w-full" onClick={() => { completeModule(lesson.id); setLastLesson(lesson.id) }}>{completed[lesson.id] ? 'Пройти ещё раз' : 'Отметить пройденным'}</Button></div></aside>
    </div>
  </article>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section><h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>{children}</section> }

function ExplanationExplorer({ lesson }: { lesson: StudyLesson }) {
  const [conceptIndex, setConceptIndex] = useState(0)
  const [level, setLevel] = useState<Level>('simple')
  const concept = lesson.concepts[conceptIndex]
  return <Section title="Разберёмся по шагам"><div className="mt-5 rounded-lg border border-[#2d383d] bg-[#171d20] p-5 sm:p-6"><div className="flex flex-wrap gap-2">{lesson.concepts.map((item, index) => <button key={item.label} onClick={() => setConceptIndex(index)} className={`rounded-md border px-3 py-2 text-sm transition ${index === conceptIndex ? 'border-lime-300/70 bg-lime-300/10 text-lime-200' : 'border-[#394348] text-slate-300 hover:border-[#566369]'}`}>{item.label}</button>)}</div><div className="mt-5 flex flex-wrap gap-2 border-b border-[#2c373b] pb-4">{(Object.keys(labels) as Level[]).map((item) => <button key={item} onClick={() => setLevel(item)} className={`text-sm ${level === item ? 'font-semibold text-lime-300' : 'text-slate-400 hover:text-white'}`}>{labels[item]}</button>)}</div><p className="mt-5 max-w-4xl text-base leading-7 text-slate-200">{concept[level]}</p></div></Section>
}

function FlowDiagram({ nodes }: { nodes: string[] }) { return <Section title="Наглядная схема"><div className="mt-5 overflow-x-auto rounded-lg border border-[#2d383d] bg-[#151b1e] p-5"><div className="flex min-w-max items-center gap-2">{nodes.map((node, index) => <div key={node} className="flex items-center gap-2">{index > 0 && <ChevronRight size={17} className="text-lime-300" />}<div className="rounded-md border border-[#394348] bg-[#1c2428] px-3 py-3 font-mono text-sm text-slate-100">{node}</div></div>)}</div></div></Section> }

function CommandBreakdown({ lesson }: { lesson: StudyLesson }) {
  const [selected, setSelected] = useState(0)
  const part = lesson.command.parts[selected]
  return <Section title="Разберём команду"><div className="mt-5 rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><code className="block overflow-x-auto rounded-md border border-[#394348] bg-[#0a0e10] p-4 text-base text-lime-200">{lesson.command.code}</code><div className="mt-4 flex flex-wrap gap-2">{lesson.command.parts.map((item, index) => <button key={`${item.token}-${index}`} onClick={() => setSelected(index)} className={`rounded border px-3 py-2 font-mono text-sm ${selected === index ? 'border-lime-300 bg-lime-300/10 text-lime-200' : 'border-[#465158] text-slate-300 hover:border-[#718087]'}`}>{item.token}</button>)}</div><p className="mt-4 text-sm leading-6 text-slate-200"><span className="font-mono text-lime-300">{part.token}</span> — {part.detail}</p><p className="mt-4 border-t border-[#2c373b] pt-4 text-sm leading-6 text-slate-400">Результат: {lesson.command.result}</p></div></Section>
}

function TerminalReading({ lesson }: { lesson: StudyLesson }) { return <Section title="Что ты увидишь в терминале"><div className="mt-5 rounded-lg border border-[#394348] bg-[#0a0e10] p-5"><p className="font-mono text-sm text-lime-300">student@trainer:~$ {lesson.terminal.command}</p><pre className="mt-4 overflow-x-auto font-mono text-sm leading-6 text-slate-200">{lesson.terminal.output}</pre></div><div className="mt-3 flex gap-3 rounded-md border border-lime-300/20 bg-lime-300/5 p-4 text-sm leading-6 text-slate-200"><Lightbulb size={17} className="mt-0.5 shrink-0 text-lime-300" />{lesson.terminal.focus}</div></Section> }

function KnowledgeChecks({ lesson }: { lesson: StudyLesson }) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  return <Section title="Проверь логику"><div className="mt-5 space-y-4">{lesson.checks.map((check, index) => { const answer = answers[index]; const done = answer !== undefined; return <div key={check.prompt} className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><p className="font-medium leading-6 text-white">{index + 1}. {check.prompt}</p><div className="mt-4 grid gap-2">{check.options.map((option, optionIndex) => <button key={option} onClick={() => setAnswers((current) => ({ ...current, [index]: optionIndex }))} className={`rounded-md border px-3 py-3 text-left text-sm transition ${answer === optionIndex ? optionIndex === check.correct ? 'border-lime-300 bg-lime-300/10 text-lime-100' : 'border-red-300/70 bg-red-300/10 text-red-100' : 'border-[#394348] text-slate-300 hover:border-[#566369]'}`}>{option}</button>)}</div>{done && <p className={`mt-4 text-sm leading-6 ${answer === check.correct ? 'text-lime-200' : 'text-slate-300'}`}>{check.explanation}</p>}</div> })}</div></Section>
}

function GuidedPractice({ lesson }: { lesson: StudyLesson }) {
  const [step, setStep] = useState(0); const [choice, setChoice] = useState<number | undefined>(); const [command, setCommand] = useState(''); const [ran, setRan] = useState(false)
  const current = lesson.guided[step]; const choiceCorrect = choice === current.correct; const commandCorrect = matchesAcceptedCommand(command, current.accepted)
  const resetStep = () => { setChoice(undefined); setCommand(''); setRan(false) }
  return <Section title="Учебная лаборатория"><div id="guided" className="mt-5 rounded-lg border border-[#2d383d] bg-[#171d20] p-5 sm:p-6"><div className="flex items-center justify-between"><p className="font-mono text-xs uppercase tracking-wide text-lime-300">Шаг {step + 1} из {lesson.guided.length}</p><button onClick={() => { setStep(0); resetStep() }} className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white"><RotateCcw size={14} />начать заново</button></div><p className="mt-4 font-semibold leading-6 text-white">{current.question}</p><div className="mt-4 grid gap-2">{current.options.map((option, index) => <button key={option} disabled={choice !== undefined} onClick={() => setChoice(index)} className={`rounded-md border px-3 py-3 text-left text-sm disabled:cursor-default ${choice === index ? index === current.correct ? 'border-lime-300 bg-lime-300/10 text-lime-100' : 'border-red-300/70 bg-red-300/10 text-red-100' : 'border-[#394348] text-slate-300 hover:border-[#566369]'}`}>{option}</button>)}</div>{choice !== undefined && !choiceCorrect && <p className="mt-3 text-sm text-red-200">Эта проверка не сужает гипотезу. Попробуй шаг ещё раз.</p>}{choiceCorrect && <div className="mt-5 border-t border-[#2c373b] pt-5"><p className="text-sm leading-6 text-slate-200">{current.commandQuestion}</p><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input value={command} onChange={(event) => { setCommand(event.target.value); setRan(false) }} placeholder="Введи команду в безопасном симуляторе" className="h-11 min-w-0 flex-1 rounded-md border border-[#465158] bg-[#0a0e10] px-3 font-mono text-sm text-lime-100 outline-none placeholder:text-slate-600 focus:border-lime-300" /><Button disabled={!command.trim()} onClick={() => setRan(true)}>Выполнить</Button></div>{ran && <div className="mt-4">{commandCorrect ? <SuccessNotice><div><pre className="whitespace-pre-wrap font-mono text-sm text-lime-100">{current.output}</pre><p className="mt-3 leading-6 text-slate-200">{current.explanation}</p></div></SuccessNotice> : <p className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">Команда пока не даёт нужный ответ. Вернись к вопросу: что именно нужно выяснить сейчас?</p>}</div>}{ran && commandCorrect && <div className="mt-5">{step < lesson.guided.length - 1 ? <Button onClick={() => { setStep((value) => value + 1); resetStep() }}>Следующий шаг</Button> : <SuccessNotice><p>Практика завершена: ты прошёл путь от симптома к безопасному действию.</p></SuccessNotice>}</div>}</div>}</div></Section>
}

function IndependentChallenge({ lesson }: { lesson: StudyLesson }) { return <Section title="Самостоятельная задача"><div className="mt-5 rounded-lg border border-[#394348] bg-[#151b1e] p-5"><p className="font-semibold text-white">{lesson.challenge.title}</p><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{lesson.challenge.briefing}</p><Link to={lesson.challenge.route} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-lime-300 hover:text-lime-200"><TerminalSquare size={16} />Открыть независимую лабораторию</Link></div></Section> }

function InterviewPreview({ lesson }: { lesson: StudyLesson }) { return <Section title="Вопросы с собеседования"><div className="mt-5 rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><ol className="space-y-3">{lesson.interview.map((item, index) => <li key={item.id} className="flex gap-3 text-sm leading-6 text-slate-200"><span className="font-mono text-lime-300">0{index + 1}</span>{item.question}</li>)}</ol><Link to={`/interview?lesson=${lesson.id}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-lime-300 hover:text-lime-200"><MessageSquare size={16} />Перейти к режиму собеседования</Link></div></Section> }

function Flashcards({ lesson }: { lesson: StudyLesson }) {
  const [index, setIndex] = useState(0); const [shown, setShown] = useState(false); const card = lesson.cards[index]
  const recordReview = useProgressStore((state) => state.recordReview)
  const grade = (confidence: 'missed' | 'partial' | 'confident') => { recordReview(card.id, confidence); setIndex((value) => (value + 1) % lesson.cards.length); setShown(false) }
  return <Section title="Памятка и карточки ошибок"><div id="review" className="mt-5 rounded-lg border border-[#394348] bg-[#151b1e] p-5"><p className="font-mono text-xs uppercase tracking-wide text-lime-300">Карточка {index + 1}/{lesson.cards.length}</p><p className="mt-4 text-lg font-semibold text-white">{shown ? card.back : card.front}</p><div className="mt-5 flex flex-wrap gap-3"><SecondaryButton onClick={() => setShown((value) => !value)}>{shown ? 'Скрыть ответ' : 'Показать ответ'}</SecondaryButton>{shown && <><button onClick={() => grade('missed')} className="rounded-md border border-red-300/60 px-3 py-2 text-sm text-red-100 hover:bg-red-300/10">Не помню</button><button onClick={() => grade('partial')} className="rounded-md border border-amber-300/60 px-3 py-2 text-sm text-amber-100 hover:bg-amber-300/10">Частично</button><Button onClick={() => grade('confident')}>Уверенно</Button></>}</div><p className="mt-4 text-xs leading-5 text-slate-500">Не помню → завтра · Частично → через 3 дня · Уверенно → через 10 дней.</p></div></Section>
}
