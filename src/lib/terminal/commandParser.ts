import type { ParsedCommand } from '../../types/domain'

/** Parses a shell-like command line without evaluating it. */
export function parseCommand(input: string): ParsedCommand {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  const source = input.trim()
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if ((char === '"' || char === "'") && (quote === null || quote === char)) quote = quote === char ? null : char
    else if (/\s/.test(char) && quote === null) { if (current) tokens.push(current); current = '' }
    else current += char
  }
  if (current) tokens.push(current)
  const [command = '', ...args] = tokens
  return { raw: source, command: command.toLowerCase(), args, flags: args.filter((item) => item.startsWith('-')) }
}

const resourceAliases: Record<string, string> = {
  po: 'pod', pods: 'pod', pod: 'pod',
  deploy: 'deployment', deployment: 'deployment', deployments: 'deployment',
  svc: 'service', service: 'service', services: 'service',
  ep: 'endpoints', endpoints: 'endpoints',
}

const signalAliases: Record<string, string> = { '15': 'TERM', term: 'TERM', sigterm: 'TERM', '9': 'KILL', kill: 'KILL', sigkill: 'KILL', stop: 'STOP', sigstop: 'STOP', cont: 'CONT', sigcont: 'CONT' }

export interface CommandSemantics {
  program: string
  verb?: string
  subject?: string
  name?: string
  namespace?: string
  signal?: string
  flags: string[]
  operands: string[]
}

/** Converts accepted spelling variants into a comparable command model. */
export function commandSemantics(input: string): CommandSemantics {
  const parsed = parseCommand(input)
  const args = [...parsed.args]
  const flags: string[] = []
  let namespace: string | undefined
  let signal: string | undefined
  const positionals: string[] = []
  const valueFlags = new Set(['-u', '--unit', '-n', '--lines', '-p', '-o', '-c', '--container'])

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    const lower = token.toLowerCase()
    if (lower === '-n' || lower === '--namespace') { namespace = args[index + 1]?.toLowerCase(); index += 1; continue }
    if (lower.startsWith('--namespace=')) { namespace = lower.slice('--namespace='.length); continue }
    if (parsed.command === 'kill' && lower.startsWith('-') && lower !== '--') { signal = signalAliases[lower.replace(/^-+/, '')] ?? lower.replace(/^-+/, '').toUpperCase(); continue }
    if (valueFlags.has(lower)) { flags.push(`${lower}=${args[index + 1]?.toLowerCase() ?? ''}`); index += 1; continue }
    if (lower.startsWith('-')) { flags.push(lower); continue }
    positionals.push(token)
  }

  const program = parsed.command
  if (program !== 'kubectl') return { program, signal, flags: flags.sort(), operands: positionals.map((item) => item.toLowerCase()) }

  const [verbRaw = '', subjectRaw = '', ...rest] = positionals
  const verb = verbRaw.toLowerCase()
  const [subjectName, inlineName] = subjectRaw.toLowerCase().split('/', 2)
  const subject = resourceAliases[subjectName] ?? subjectName
  const name = inlineName ?? (['get', 'describe', 'logs'].includes(verb) ? rest.shift()?.toLowerCase() : undefined)
  return { program, verb, subject, name, namespace, flags: flags.sort(), operands: rest.map((item) => item.toLowerCase()) }
}

/** Compares commands semantically: whitespace, resource aliases, signal spelling and namespace flags do not matter. */
export function commandsEquivalent(input: string, expected: string): boolean {
  const actual = commandSemantics(input)
  const target = commandSemantics(expected)
  if (actual.program !== target.program || actual.verb !== target.verb || actual.subject !== target.subject || actual.name !== target.name || actual.namespace !== target.namespace || actual.signal !== target.signal) return false
  if (actual.flags.join('|') !== target.flags.join('|')) return false
  return actual.operands.join('|') === target.operands.join('|')
}

export function matchesAcceptedCommand(input: string, accepted: string[]): boolean {
  return accepted.some((candidate) => commandsEquivalent(input, candidate))
}

export function normalizedCommand(input: string): string {
  const semantic = commandSemantics(input)
  return JSON.stringify(semantic)
}
