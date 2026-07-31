export interface ParsedCommand {
  raw: string
  command: string
  args: string[]
  flags: string[]
}

/** Parses a shell-like command line without ever evaluating it. */
export function parseCommand(input: string): ParsedCommand {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < input.trim().length; index += 1) {
    const char = input.trim()[index]
    if ((char === '"' || char === "'") && (quote === null || quote === char)) {
      quote = quote === char ? null : char
    } else if (/\s/.test(char) && quote === null) {
      if (current) tokens.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current) tokens.push(current)

  const [command = '', ...args] = tokens
  return { raw: input.trim(), command, args, flags: args.filter((item) => item.startsWith('-')) }
}

export function normalizedCommand(input: string): string {
  return parseCommand(input).raw.replace(/\s+/g, ' ').trim().toLowerCase()
}
