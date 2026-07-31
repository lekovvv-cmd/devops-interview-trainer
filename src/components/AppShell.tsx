import { BarChart3, BookOpen, ClipboardCheck, LayoutDashboard, Menu, TerminalSquare, Boxes, X, MessageSquare } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'

const navItems = [
  { to: '/', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/modules', label: 'Модули', icon: BookOpen },
  { to: '/quiz', label: 'Квиз', icon: ClipboardCheck },
  { to: '/interview', label: 'Собеседование', icon: MessageSquare },
  { to: '/labs/linux', label: 'Практика Linux', icon: TerminalSquare },
  { to: '/labs/kubernetes', label: 'Kubernetes', icon: Boxes },
  { to: '/progress', label: 'Прогресс', icon: BarChart3 },
]

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return <nav className="space-y-1" aria-label="Основная навигация">{navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition ${isActive ? 'border-l-2 border-lime-300 bg-[#20282c] font-medium text-lime-200' : 'text-slate-300 hover:bg-[#1b2225] hover:text-white'}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="min-h-screen bg-[#101416] text-slate-100">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-[#263035] bg-[#12181b] px-3 py-5 lg:block">
      <div className="mb-8 flex items-center gap-3 px-3"><span className="font-mono text-2xl font-bold text-lime-300">›_</span><div><p className="text-base font-semibold tracking-tight text-white">DevOps Interview</p><p className="text-base font-semibold tracking-tight text-lime-300">Trainer</p></div></div>
      <Navigation />
      <div className="absolute inset-x-3 bottom-5 border-t border-[#263035] pt-4 text-xs leading-5 text-slate-500">Локальный режим<br />Прогресс сохраняется в браузере</div>
    </aside>
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#263035] bg-[#101416]/95 px-4 backdrop-blur lg:ml-60 lg:px-8">
      <button className="inline-flex min-h-10 items-center gap-2 text-sm text-slate-200 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><Menu size={20} />Меню</button>
      <p className="hidden text-sm text-slate-400 sm:block">Локальный тренажёр · безопасная симуляция</p>
      <p className="font-mono text-xs text-lime-300">offline</p>
    </header>
    {menuOpen && <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setMenuOpen(false)}><aside className="h-full w-72 border-r border-[#263035] bg-[#12181b] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-6 flex items-center justify-between"><span className="font-semibold">DevOps Interview Trainer</span><button onClick={() => setMenuOpen(false)} className="rounded p-2 text-slate-300 hover:bg-[#20282c]" aria-label="Закрыть меню"><X size={20} /></button></div><Navigation onNavigate={() => setMenuOpen(false)} /></aside></div>}
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8"><Outlet /></main>
  </div>
}
