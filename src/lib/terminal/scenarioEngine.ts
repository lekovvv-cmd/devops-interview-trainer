import type { CommandResult, LabScenario, ParsedCommand, ScenarioActionLog, ScenarioScore } from '../../types/domain'

/** Scores reasoning, not a magic sequence of tags. Every submitted command is retained for the debrief. */
export class ScenarioEngine {
  private symptoms = new Set<string>()
  private diagnostics = new Set<string>()
  private verifications = new Set<string>()
  private hintCount = 0
  private dangerousCount = 0
  private resolutionBlocked = false
  private uselessCount = 0
  private resolutionAfterCause = false
  private prematureResolutionCount = 0
  private readonly actions: ScenarioActionLog[] = []

  constructor(private readonly scenario: LabScenario) {}

  record(rawCommand: string, parsed: ParsedCommand, result: CommandResult): ScenarioScore {
    const action = result.action ?? { type: result.isError ? 'unknown' as const : 'noop' as const, meaningful: false }
    const causeKnownBeforeAction = this.causeConfirmed()
    const diagnosticTags = result.tags.filter((tag) => tag.startsWith('symptom:') || tag.startsWith('diag:') || tag.startsWith('verify:'))

    for (const tag of result.tags) {
      if (this.scenario.symptomChecks.includes(tag)) this.symptoms.add(tag)
      if (this.scenario.requiredDiagnostics.includes(tag)) this.diagnostics.add(tag)
      if (this.scenario.requiredVerifications.includes(tag) && this.resolutionAfterCause) this.verifications.add(tag)
    }
    const resolves = result.tags.some((tag) => this.scenario.acceptedResolutions.includes(tag))
    if (resolves) {
      if (causeKnownBeforeAction) this.resolutionAfterCause = true
      else this.prematureResolutionCount += 1
    }
    if (action.dangerous || action.type === 'dangerous') this.dangerousCount += 1
    if (action.blocksResolution) this.resolutionBlocked = true
    if (!result.isError && action.meaningful === false && action.type !== 'verification') this.uselessCount += 1
    this.actions.push({ sequence: this.actions.length + 1, at: Date.now(), rawCommand, parsed, type: action.type, object: action.object, arguments: action.arguments ?? parsed.args, diagnosticTags, changedState: Boolean(action.changedState), dangerous: Boolean(action.dangerous || action.type === 'dangerous'), blocksResolution: Boolean(action.blocksResolution) })
    return this.getScore()
  }

  useHint(): ScenarioScore { this.hintCount = Math.min(3, this.hintCount + 1); return this.getScore() }
  getActions(): readonly ScenarioActionLog[] { return this.actions }

  getScore(): ScenarioScore {
    const symptomRatio = ratio(this.symptoms.size, this.scenario.symptomChecks.length)
    const diagnosticRatio = ratio(this.diagnostics.size, this.scenario.requiredDiagnostics.length)
    const verificationRatio = ratio(this.verifications.size, this.scenario.requiredVerifications.length)
    const foundCause = symptomRatio === 1 && diagnosticRatio === 1
    const verified = this.resolutionAfterCause && verificationRatio === 1
    const score = clamp(Math.round(symptomRatio * 15 + diagnosticRatio * 35 + (this.resolutionAfterCause ? 30 : 0) + verificationRatio * 20 - this.hintCount * 5 - this.dangerousCount * 20 - this.prematureResolutionCount * 10 - Math.min(this.uselessCount, 5) * 2))
    return { score, foundCause, verified, usedHints: this.hintCount, dangerousActions: this.dangerousCount, resolutionBlocked: this.resolutionBlocked, completedDiagnostics: [...this.symptoms, ...this.diagnostics], isResolved: foundCause && this.resolutionAfterCause && verified && !this.resolutionBlocked }
  }

  reset(): void { this.symptoms.clear(); this.diagnostics.clear(); this.verifications.clear(); this.hintCount = 0; this.dangerousCount = 0; this.uselessCount = 0; this.resolutionBlocked = false; this.resolutionAfterCause = false; this.prematureResolutionCount = 0; this.actions.splice(0) }
  private causeConfirmed(): boolean { return ratio(this.symptoms.size, this.scenario.symptomChecks.length) === 1 && ratio(this.diagnostics.size, this.scenario.requiredDiagnostics.length) === 1 }
}

const ratio = (value: number, total: number) => total ? Math.min(1, value / total) : 1
const clamp = (value: number) => Math.max(0, Math.min(100, value))
