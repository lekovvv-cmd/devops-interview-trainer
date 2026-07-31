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
    else if (/\s/.test(char) && quote === null) {
      if (current) tokens.push(current)
      current = ''
    } else current += char
  }
  if (current) tokens.push(current)

  const [command = '', ...args] = tokens
  return { raw: source, command: command.toLowerCase(), args, flags: args.filter((item) => item.startsWith('-')) }
}

const resourceAliases: Record<string, string> = {
  po: 'pod', pods: 'pod', pod: 'pod',
  deploy: 'deployment', deployments: 'deployment', deployment: 'deployment',
  svc: 'service', service: 'service', services: 'service',
  ep: 'endpoints', endpoints: 'endpoints',
}

const signalAliases: Record<string, string> = {
  '15': 'TERM', term: 'TERM', sigterm: 'TERM',
  '9': 'KILL', kill: 'KILL', sigkill: 'KILL',
  stop: 'STOP', sigstop: 'STOP', cont: 'CONT', sigcont: 'CONT',
}

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

type NamespaceExtraction = { args: string[]; namespace?: string }

/** Removes kubectl global namespace flags no matter where they were written. */
export function extractKubectlNamespace(args: string[]): NamespaceExtraction {
  const remaining: string[] = []
  let namespace: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    const lower = token.toLowerCase()
    if (lower === '-n' || lower === '--namespace') {
      namespace = args[index + 1]?.toLowerCase()
      index += 1
    } else if (lower.startsWith('--namespace=')) namespace = lower.slice('--namespace='.length)
    else remaining.push(token)
  }
  return { args: remaining, namespace }
}

/** Converts accepted spelling variants into a comparable command model. */
export function commandSemantics(input: string): CommandSemantics {
  const parsed = parseCommand(input)
  if (parsed.command === 'kubectl') return kubectlSemantics(parsed)

  const flags: string[] = []
  const operands: string[] = []
  let signal: string | undefined
  const valueFlags = new Set(['-u', '--unit', '-n', '--lines', '-p', '-o', '-c', '--container'])

  for (let index = 0; index < parsed.args.length; index += 1) {
    const token = parsed.args[index]
    const lower = token.toLowerCase()
    if (parsed.command === 'kill' && lower.startsWith('-') && lower !== '--') {
      signal = signalAliases[lower.replace(/^-+/, '')] ?? lower.replace(/^-+/, '').toUpperCase()
    } else if (valueFlags.has(lower)) {
      flags.push(`${lower}=${parsed.args[index + 1]?.toLowerCase() ?? ''}`)
      index += 1
    } else if (lower.startsWith('-')) flags.push(lower)
    else operands.push(lower)
  }

  return { program: parsed.command, signal, flags: flags.sort(), operands }
}

function kubectlSemantics(parsed: ParsedCommand): CommandSemantics {
  const extracted = extractKubectlNamespace(parsed.args)
  const args = extracted.args
  const [verbRaw = '', ...tail] = args
  const verb = verbRaw.toLowerCase()
  const flags: string[] = []
  const positionals: string[] = []
  const valueFlags = new Set(['-c', '--container', '--containers'])

  for (let index = 0; index < tail.length; index += 1) {
    const token = tail[index]
    const lower = token.toLowerCase()
    if (valueFlags.has(lower)) {
      flags.push(`${lower}=${tail[index + 1]?.toLowerCase() ?? ''}`)
      index += 1
    } else if (lower.startsWith('-')) flags.push(lower)
    else positionals.push(lower)
  }

  const subjectToken = positionals.shift() ?? ''
  const [resourceRaw, inlineName] = subjectToken.split('/', 2)
  const resource = resourceAliases[resourceRaw] ?? resourceRaw
  const takesName = ['get', 'describe', 'logs'].includes(verb)
  const name = inlineName ?? (takesName ? positionals.shift() : undefined)
  return {
    program: 'kubectl', verb, subject: resource || undefined, name,
    namespace: extracted.namespace, flags: flags.sort(), operands: positionals,
  }
}

/** Compares commands semantically: whitespace, aliases, signal spelling and kubectl flag position do not matter. */
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
  return JSON.stringify(commandSemantics(input))
}
