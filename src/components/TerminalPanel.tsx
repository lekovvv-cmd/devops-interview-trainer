import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { SafeLabSession } from '../lib/terminal'
import type { ScenarioScore } from '../types/domain'

const prompt = 'student@trainer:~$ '

export function TerminalPanel({ session, sessionKey, onScore }: { session: SafeLabSession; sessionKey: string; onScore: (score: ScenarioScore) => void }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return undefined
    const terminal = new Terminal({ cursorBlink: true, fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 14, lineHeight: 1.34, theme: { background: '#0a0e10', foreground: '#dce5e7', cursor: '#bef264', green: '#bef264', red: '#f87171' }, convertEol: true, allowProposedApi: false })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    terminal.writeln('\x1b[1;32mSafe terminal simulator\x1b[0m — commands change only virtual state.')
    terminal.writeln('Use the scenario briefing and enter a diagnostic command.')
    terminal.write(`\r\n\x1b[1;32m${prompt}\x1b[0m`)
    let command = ''
    const resize = () => { try { fit.fit() } catch { /* container can be hidden during resize */ } }
    const timer = window.setTimeout(resize, 40)
    window.addEventListener('resize', resize)
    const disposable = terminal.onData((data) => {
      if (data === '\r') {
        const submitted = command
        terminal.write('\r\n')
        if (submitted.trim()) {
          const { result, score } = session.execute(submitted)
          result.output.split('\n').forEach((line) => terminal.writeln(result.isError ? `\x1b[31m${line}\x1b[0m` : line))
          onScore(score)
        }
        command = ''
        terminal.write(`\r\n\x1b[1;32m${prompt}\x1b[0m`)
      } else if (data === '\u007f') {
        if (command.length > 0) { command = command.slice(0, -1); terminal.write('\b \b') }
      } else if (data >= ' ' && data <= '~') {
        command += data
        terminal.write(data)
      }
    })
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', resize); disposable.dispose(); terminal.dispose() }
  }, [session, sessionKey, onScore])
  return <div className="overflow-hidden rounded-lg border border-[#394348] bg-[#0a0e10] shadow-inner"><div className="flex h-10 items-center justify-between border-b border-[#293338] bg-[#111719] px-4"><span className="font-mono text-xs text-slate-300">Терминал · виртуальная среда</span><span className="text-xs text-slate-500">Enter — выполнить</span></div><div ref={host} className="h-[460px] p-3 sm:h-[520px]" aria-label="Интерактивный безопасный терминал" /></div>
}
