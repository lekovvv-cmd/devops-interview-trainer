import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { Check, CircleAlert, RotateCcw } from 'lucide-react'

export function Button({ className = '', children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-lime-300 bg-lime-300 px-4 text-sm font-semibold text-[#111711] transition hover:bg-lime-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>{children}</button>
}

export function SecondaryButton({ className = '', children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#394348] bg-[#1a2023] px-4 text-sm font-medium text-slate-100 transition hover:border-[#5a676d] hover:bg-[#222a2e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 ${className}`} {...props}>{children}</button>
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return <div className={`h-2 overflow-hidden rounded-full bg-[#2a3338] ${className}`} aria-label={`Прогресс ${value}%`}><div className="h-full rounded-full bg-lime-300 transition-all" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} /></div>
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-[#394348] bg-[#151b1e] p-8 text-center"><CircleAlert className="mx-auto mb-3 text-slate-400" size={24} /><h2 className="text-base font-semibold text-slate-100">{title}</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">{body}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function SuccessNotice({ children }: PropsWithChildren) {
  return <div className="flex items-start gap-3 rounded-md border border-lime-300/30 bg-lime-300/10 p-4 text-sm text-lime-100"><Check size={18} className="mt-0.5 shrink-0 text-lime-300" />{children}</div>
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return <SecondaryButton onClick={onClick}><RotateCcw size={16} />Сбросить</SecondaryButton>
}
