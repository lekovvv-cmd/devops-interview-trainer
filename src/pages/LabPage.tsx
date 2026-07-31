import { CheckCircle2, Lightbulb, LockKeyhole, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { TerminalPanel } from '../components/TerminalPanel'
import { Button, SecondaryButton, SuccessNotice } from '../components/ui'
import { scenarios } from '../data/scenarios'
import { SafeLabSession } from '../lib/terminal'
import { useProgressStore } from '../store/progressStore'
import type { LabDomain, LabScenario, ScenarioScore } from '../types/domain'

const emptyScore: ScenarioScore = { score: 0, foundCause: false, verified: false, usedHints: 0, dangerousActions: 0, resolutionBlocked: false, completedDiagnostics: [], isResolved: false }

export function LabPage() {
  const { domain = 'linux' } = useParams()
  const [searchParams] = useSearchParams()
  const selectedDomain: LabDomain = domain === 'kubernetes' ? 'kubernetes' : 'linux'
  const available = useMemo(() => scenarios.filter((scenario) => scenario.domain === selectedDomain), [selectedDomain])
  const requestedScenario = searchParams.get('scenario')
  const independent = searchParams.get('mode') === 'independent'
  const initialId = requestedScenario && available.some((scenario) => scenario.id === requestedScenario) ? requestedScenario : available[0].id
  const [activeId, setActiveId] = useState(initialId)
  const [version, setVersion] = useState(0)
  const [score, setScore] = useState<ScenarioScore>(emptyScore)
  const recordLab = useProgressStore((state) => state.recordLab)
  const recordedSessions = useRef(new Set<string>())

  useEffect(() => { setActiveId(initialId); setVersion(0); setScore(emptyScore) }, [initialId])

  const active = available.find((scenario) => scenario.id === activeId) ?? available[0]
  const session = useMemo(() => new SafeLabSession(active, version), [active, version])
  const onScore = useCallback((next: ScenarioScore) => {
    setScore(next)
    const sessionId = `${active.id}-${version}`
    if (next.isResolved && next.verified && !next.resolutionBlocked && !recordedSessions.current.has(sessionId)) {
      recordedSessions.current.add(sessionId)
      recordLab(active.id, next.score, next.usedHints, next.dangerousActions)
    }
  }, [active.id, recordLab, version])
  const chooseScenario = (scenario: LabScenario) => { setActiveId(scenario.id); setVersion(0); setScore(emptyScore) }
  const reset = () => { setVersion((current) => current + 1); setScore(emptyScore) }
  const routeName = selectedDomain === 'linux' ? 'Практика Linux' : 'Практика Kubernetes'

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-[#263035] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-lime-300">{routeName} · безопасная виртуальная среда</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{active.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{active.briefing}</p>
      </div>
      <div className="flex items-center gap-3"><span className="font-mono text-sm text-lime-300">{score.score} баллов</span><SecondaryButton onClick={reset}><RotateCcw size={16} />Сбросить среду</SecondaryButton></div>
    </header>

    <div className={`grid gap-6 ${independent ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : '2xl:grid-cols-[220px_minmax(0,1fr)_330px]'}`}>
      {!independent && <aside className="h-fit rounded-lg border border-[#2d383d] bg-[#151b1e] p-3 2xl:sticky 2xl:top-20">
        <p className="px-2 pb-3 font-mono text-xs uppercase tracking-wide text-slate-500">Сценарии</p>
        <div className="space-y-1">{available.map((scenario, index) => <button key={scenario.id} onClick={() => chooseScenario(scenario)} className={`w-full rounded-md px-3 py-3 text-left text-sm transition ${scenario.id === active.id ? 'border-l-2 border-lime-300 bg-[#20282c] text-lime-200' : 'text-slate-300 hover:bg-[#1c2428]'}`}><span className="mr-2 font-mono text-xs text-slate-500">{String(index + 1).padStart(2, '0')}</span>{scenario.shortTitle}</button>)}</div>
      </aside>}

      <section className="min-w-0">
        <div className="mb-4 grid gap-4 rounded-lg border border-[#2d383d] bg-[#171d20] p-4 sm:grid-cols-2">
          <div><p className="text-xs uppercase tracking-wide text-slate-500">{independent ? 'Самостоятельный режим' : 'Цель'}</p><p className="mt-2 text-sm leading-6 text-slate-200">{independent ? 'Выбери собственный порядок проверок. Подсказки, ожидаемый путь и причина откроются только после решения.' : 'Выявить причину через диагностику и применить безопасное решение.'}</p></div>
          <div><p className="text-xs uppercase tracking-wide text-slate-500">Принцип оценки</p><p className="mt-2 text-sm leading-6 text-slate-400">Порядок команд не важен. Засчитываются логика, уместные команды, найденная причина и безопасное исправление.</p></div>
        </div>
        <TerminalPanel session={session} sessionKey={`${active.id}-${version}`} onScore={onScore} />
        {score.isResolved && <div className="mt-4"><SuccessNotice><div><p className="font-semibold">Сценарий решён · {score.score}/100</p><p className="mt-1 leading-6 text-slate-200">{active.successSummary} Результат сохранён локально.</p></div></SuccessNotice></div>}
      </section>

      <aside className="space-y-4">
        {independent ? <IndependentDebrief scenario={active} score={score} /> : <><ScenarioSteps scenario={active} score={score} /><Hints scenario={active} used={score.usedHints} onUse={() => setScore(session.useHint())} /></>}
        <div className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><p className="font-semibold text-white">Не делайте</p><ul className="mt-3 space-y-2">{active.dangerousActions.map((item) => <li key={item} className="flex gap-2 text-sm leading-5 text-red-200"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-red-300" />{item}</li>)}</ul></div>
      </aside>
    </div>
  </div>
}

function IndependentDebrief({ scenario, score }: { scenario: LabScenario; score: ScenarioScore }) {
  if (!score.isResolved) return <div className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><p className="font-semibold text-white">Твоя задача</p><p className="mt-2 text-sm leading-6 text-slate-400">Наблюдай симптомы, проверяй гипотезы и исправь причину. Не стремись угадать единственную команду: в тренажёре засчитываются разные безопасные пути.</p><p className="mt-4 font-mono text-xs text-slate-500">Подсказки отключены до завершения.</p></div>
  return <div className="rounded-lg border border-lime-300/30 bg-lime-300/5 p-5"><p className="font-semibold text-lime-100">Разбор решения</p><p className="mt-3 text-sm leading-6 text-slate-300"><span className="text-slate-500">Причина: </span>{scenario.hiddenCause}</p><p className="mt-4 text-xs uppercase tracking-wide text-slate-500">Полезные проверки</p><ol className="mt-3 space-y-2">{scenario.requiredDiagnostics.map((tag, index) => <li key={tag} className="flex gap-3 text-sm text-slate-300"><span className="font-mono text-lime-300">0{index + 1}</span>{labelForDiagnostic(tag)}</li>)}</ol><p className="mt-4 text-sm leading-6 text-slate-400">Твой путь: {score.completedDiagnostics.length} диагностических проверок, {score.usedHints} подсказок. Хороший следующий шаг после любого исправления — подтвердить, что симптом исчез.</p></div>
}

function ScenarioSteps({ scenario, score }: { scenario: LabScenario; score: ScenarioScore }) {
  return <div className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-white">Диагностический путь</h2><span className="font-mono text-xs text-lime-300">{score.completedDiagnostics.length}/{scenario.requiredDiagnostics.length}</span></div><ol className="mt-4 space-y-3">{scenario.requiredDiagnostics.map((tag, index) => { const done = score.completedDiagnostics.includes(tag); return <li key={tag} className="flex items-center gap-3 text-sm"><span className={`grid size-6 place-items-center rounded-full border font-mono text-xs ${done ? 'border-lime-300 bg-lime-300 text-[#101416]' : 'border-[#4b575d] text-slate-400'}`}>{done ? <CheckCircle2 size={15} /> : index + 1}</span><span className={done ? 'text-lime-100' : 'text-slate-400'}>{labelForDiagnostic(tag)}</span></li> })}<li className="flex items-center gap-3 text-sm"><span className={`grid size-6 place-items-center rounded-full border ${score.isResolved ? 'border-lime-300 bg-lime-300 text-[#101416]' : 'border-[#4b575d] text-slate-400'}`}>{score.isResolved ? <CheckCircle2 size={15} /> : scenario.requiredDiagnostics.length + 1}</span><span className={score.isResolved ? 'text-lime-100' : 'text-slate-400'}>Применить безопасное решение</span></li></ol></div>
}

function Hints({ scenario, used, onUse }: { scenario: LabScenario; used: number; onUse: () => void }) {
  return <div className="rounded-lg border border-[#2d383d] bg-[#171d20] p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-white">Подсказки</h2><Lightbulb size={18} className="text-amber-300" /></div><div className="mt-3 divide-y divide-[#2d383d]">{scenario.hints.map((hint, index) => <div key={hint} className="py-3"><div className="flex items-start justify-between gap-3"><p className="text-sm leading-6 text-slate-300"><span className="mr-2 font-mono text-xs text-amber-300">{index + 1}</span>{index < used ? hint : 'Уровень подсказки закрыт'}</p>{index >= used && <LockKeyhole size={14} className="mt-1 shrink-0 text-slate-600" />}</div></div>)}</div>{used < 3 ? <Button className="mt-4 w-full" onClick={onUse}>Открыть подсказку ({used + 1}/3)</Button> : <p className="mt-4 text-xs text-slate-500">Все подсказки открыты. Каждая снижает итоговую оценку на 5 баллов.</p>}</div>
}

function labelForDiagnostic(tag: string): string {
  const labels: Record<string, string> = {
    'diag:service': 'Проверить сервис или Service', 'diag:permissions': 'Проверить владельца и права', 'diag:disk': 'Проверить заполнение диска', 'diag:disk-usage': 'Найти видимое потребление', 'diag:open-file': 'Найти открытый удалённый файл', 'diag:pods': 'Проверить состояние Pod', 'diag:logs': 'Посмотреть логи контейнера', 'diag:pod-describe': 'Изучить Events Pod', 'diag:endpoints': 'Проверить endpoints', 'diag:cpu': 'Найти процесс с высокой нагрузкой', 'diag:processes': 'Проверить PID, PPID и состояние процесса', 'diag:network': 'Проверить сетевой путь', 'diag:ports': 'Проверить слушающий порт', 'diag:dns': 'Проверить DNS-резолвинг', 'diag:memory': 'Проверить память и OOM'
  }
  return labels[tag] ?? tag
}
