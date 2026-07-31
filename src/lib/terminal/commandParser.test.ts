import { describe, expect, it } from 'vitest'
import { parseCommand } from './commandParser'

describe('parseCommand', () => {
  it('extracts a command, flags and positional arguments', () => {
    expect(parseCommand('kubectl get pods -n production')).toEqual({ raw: 'kubectl get pods -n production', command: 'kubectl', args: ['get', 'pods', '-n', 'production'], flags: ['-n'] })
  })

  it('keeps quoted values together without evaluating input', () => {
    expect(parseCommand("grep 'access log' /var/log/app.log")).toEqual({ raw: "grep 'access log' /var/log/app.log", command: 'grep', args: ['access log', '/var/log/app.log'], flags: [] })
  })

  it('returns an empty command for whitespace', () => {
    expect(parseCommand('   ')).toEqual({ raw: '', command: '', args: [], flags: [] })
  })
})
