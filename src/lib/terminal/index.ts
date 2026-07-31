import { KubernetesSimulator } from './kubernetesSimulator'
import { LinuxSimulator } from './linuxSimulator'
import { ScenarioEngine } from './scenarioEngine'
import type { CommandResult, LabScenario, ScenarioScore } from '../../types/domain'

export class SafeLabSession {
  readonly evaluator: ScenarioEngine
  private readonly simulator: LinuxSimulator | KubernetesSimulator

  constructor(readonly scenario: LabScenario) {
    this.evaluator = new ScenarioEngine(scenario)
    this.simulator = scenario.domain === 'linux' ? new LinuxSimulator(scenario.id) : new KubernetesSimulator(scenario.id)
  }

  execute(command: string): { result: CommandResult; score: ScenarioScore } {
    const result = this.simulator.execute(command)
    return { result, score: this.evaluator.record(result) }
  }

  useHint(): ScenarioScore {
    return this.evaluator.useHint()
  }
}
