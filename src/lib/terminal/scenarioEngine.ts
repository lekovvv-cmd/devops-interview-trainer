import type { CommandResult, LabScenario, ScenarioScore } from '../../types/domain'

export class ScenarioEngine {
  private diagnostics = new Set<string>()
  private resolution = ''
  private hintCount = 0

  constructor(private readonly scenario: LabScenario) {}

  record(result: CommandResult): ScenarioScore {
    for (const tag of result.tags) {
      if (this.scenario.requiredDiagnostics.includes(tag)) this.diagnostics.add(tag)
      if (this.scenario.acceptedResolutions.includes(tag)) this.resolution = tag
    }
    return this.getScore()
  }

  useHint(): ScenarioScore {
    this.hintCount = Math.min(3, this.hintCount + 1)
    return this.getScore()
  }

  getScore(): ScenarioScore {
    const foundCause = this.scenario.requiredDiagnostics.every((tag) => this.diagnostics.has(tag))
    const isResolved = foundCause && Boolean(this.resolution)
    const diagnosticPoints = Math.round((this.diagnostics.size / this.scenario.requiredDiagnostics.length) * 60)
    const resolutionPoints = this.resolution ? 40 : 0
    const penalty = this.hintCount * 5
    return {
      score: Math.max(0, Math.min(100, diagnosticPoints + resolutionPoints - penalty)),
      foundCause,
      usedHints: this.hintCount,
      completedDiagnostics: [...this.diagnostics],
      isResolved,
    }
  }

  reset(): void {
    this.diagnostics.clear()
    this.resolution = ''
    this.hintCount = 0
  }
}
