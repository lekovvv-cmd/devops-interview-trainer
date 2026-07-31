import { ArrowRight, CheckCircle2, Clock3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { studyLessons } from '../data/learning'
import { useProgressStore } from '../store/progressStore'

export function ModulesPage() {
  const completed = useProgressStore((state) => state.completedModules)
  return <div><header className="max-w-3xl border-b border-[#263035] pb-7"><h1 className="text-3xl font-semibold tracking-tight text-white">Учебные модули</h1><p className="mt-3 text-base leading-7 text-slate-400">Каждый урок проходит один цикл: объяснение, схема, команда, разбор вывода, практика с подсказками, самостоятельная задача, интервью и повторение.</p></header><div className="mt-6 divide-y divide-[#263035] overflow-hidden rounded-lg border border-[#2d383d] bg-[#151b1e]">{studyLessons.map((module, index) => <Link key={module.id} to={`/modules/${module.id}`} className="group flex flex-col gap-4 px-5 py-5 transition hover:bg-[#1c2428] sm:flex-row sm:items-center"><span className="font-mono text-xl text-lime-300">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><h2 className="font-semibold text-white">{module.title}</h2>{completed[module.id] && <span className="inline-flex items-center gap-1 text-xs text-lime-300"><CheckCircle2 size={14} />Пройден</span>}</div><p className="mt-2 text-sm leading-6 text-slate-400">{module.goal}</p></div><div className="flex shrink-0 items-center gap-4 text-sm text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={15} />{module.duration}</span><ArrowRight className="text-lime-300 transition group-hover:translate-x-1" size={18} /></div></Link>)}</div></div>
}
