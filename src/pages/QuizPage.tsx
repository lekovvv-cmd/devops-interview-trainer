import { useMemo, useState } from 'react'
import { questions } from '../data/modules'
import { modules } from '../data/modules'
import { QuizCard } from '../components/QuizCard'
import { Button } from '../components/ui'
import { useProgressStore } from '../store/progressStore'
import type { ModuleId } from '../types/domain'

export function QuizPage() {
  const [filter, setFilter] = useState<ModuleId | 'all'>('all')
  const [index, setIndex] = useState(0)
  const recordQuiz = useProgressStore((state) => state.recordQuiz)
  const filtered = useMemo(() => filter === 'all' ? questions : questions.filter((question) => question.moduleId === filter), [filter])
  const active = filtered[index % filtered.length]
  const changeFilter = (next: ModuleId | 'all') => { setFilter(next); setIndex(0) }
  return <div className="mx-auto max-w-4xl"><header className="border-b border-[#263035] pb-7"><h1 className="text-3xl font-semibold tracking-tight text-white">Квиз</h1><p className="mt-3 text-base leading-7 text-slate-400">24 вопроса разных типов. После ответа сразу доступен разбор, а попытка сохраняется локально.</p></header><div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Фильтр по модулю"><FilterButton active={filter === 'all'} onClick={() => changeFilter('all')}>Все вопросы</FilterButton>{modules.map((module) => <FilterButton key={module.id} active={filter === module.id} onClick={() => changeFilter(module.id)}>{module.title.replace('Linux: ', '').replace('Kubernetes: ', '')}</FilterButton>)}</div><div className="mt-6"><p className="mb-3 font-mono text-xs text-slate-500">Вопрос {(index % filtered.length) + 1} из {filtered.length}</p><QuizCard key={active.id} question={active} onResult={(correct) => recordQuiz(active.id, correct)} /></div><div className="mt-5 flex justify-end"><Button onClick={() => setIndex((current) => (current + 1) % filtered.length)}>Следующий вопрос</Button></div></div>
}

function FilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className={`min-h-9 rounded-md border px-3 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 ${active ? 'border-lime-300/60 bg-lime-300/10 text-lime-200' : 'border-[#394348] bg-[#171d20] text-slate-300 hover:border-[#5b676d]'}`}>{children}</button>
}
