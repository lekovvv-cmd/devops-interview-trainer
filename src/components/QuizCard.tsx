import { useState } from 'react'
import type { QuizQuestion } from '../types/domain'
import { Button, SecondaryButton, SuccessNotice } from './ui'

export function QuizCard({ question, onResult, compact = false }: { question: QuizQuestion; onResult: (correct: boolean) => void; compact?: boolean }) {
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')
  const [checked, setChecked] = useState(false)
  const multiple = question.kind === 'multiple'
  const optionCorrect = selected.length === (question.correctOptionIds?.length ?? 0) && selected.every((id) => question.correctOptionIds?.includes(id))
  const commandCorrect = question.acceptedAnswers?.some((answer) => answer.trim().toLowerCase() === text.trim().toLowerCase()) ?? false
  const correct = question.kind === 'open' ? false : question.kind === 'command' ? commandCorrect : optionCorrect
  const toggleOption = (id: string) => setSelected((previous) => multiple ? previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id] : [id])
  const submit = () => { setChecked(true); if (question.kind !== 'open') onResult(correct) }
  const reset = () => { setChecked(false); setSelected([]); setText('') }

  return <section className={`rounded-lg border border-[#2d383d] bg-[#171d20] ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
    <div className="mb-4 flex items-center justify-between gap-3"><p className="font-mono text-xs uppercase tracking-wide text-lime-300">{question.kind === 'multiple' ? 'Несколько ответов' : question.kind === 'command' ? 'Команда' : question.kind === 'open' ? 'Открытый ответ' : 'Один ответ'}</p>{checked && question.kind !== 'open' && <span className={correct ? 'text-sm text-lime-300' : 'text-sm text-red-300'}>{correct ? 'Верно' : 'Попробуйте ещё'}</span>}</div>
    <h2 className={`${compact ? 'text-base' : 'text-lg'} font-semibold leading-7 text-slate-50`}>{question.prompt}</h2>
    {(question.kind === 'single' || question.kind === 'multiple') && <div className="mt-5 grid gap-2">{question.options?.map((option) => <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm transition ${selected.includes(option.id) ? 'border-lime-300/70 bg-lime-300/10 text-white' : 'border-[#334045] text-slate-300 hover:border-[#566369]'}`}><input className="mt-0.5 accent-lime-300" type={multiple ? 'checkbox' : 'radio'} name={question.id} checked={selected.includes(option.id)} onChange={() => { setChecked(false); toggleOption(option.id) }} />{option.label}</label>)}</div>}
    {question.kind === 'command' && <input value={text} onChange={(event) => { setChecked(false); setText(event.target.value) }} placeholder="Введите команду" className="mt-5 h-11 w-full rounded-md border border-[#394348] bg-[#0d1214] px-3 font-mono text-sm text-lime-100 outline-none placeholder:text-slate-600 focus:border-lime-300" />}
    {question.kind === 'open' && <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Сформулируйте ответ своими словами" className="mt-5 min-h-28 w-full rounded-md border border-[#394348] bg-[#0d1214] p-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-lime-300" />}
    <div className="mt-5 flex flex-wrap gap-3"><Button onClick={submit} disabled={question.kind === 'open' ? text.trim().length < 8 : question.kind === 'command' ? !text.trim() : !selected.length}>{question.kind === 'open' ? 'Показать эталон' : 'Проверить ответ'}</Button>{checked && <SecondaryButton onClick={reset}>Повторить</SecondaryButton>}</div>
    {checked && <div className="mt-5 space-y-3"><SuccessNotice><div><p className="font-semibold">{question.kind === 'open' ? 'Эталонный ответ' : correct ? 'Хорошая логика.' : 'Разбор ответа'}</p><p className="mt-1 leading-6 text-slate-200">{question.kind === 'open' ? question.referenceAnswer : question.explanation}</p></div></SuccessNotice></div>}
  </section>
}
