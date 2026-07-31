export type ModuleId =
  | 'linux-permissions'
  | 'linux-processes'
  | 'linux-systemd'
  | 'linux-storage'
  | 'linux-network'
  | 'linux-troubleshooting'
  | 'kubernetes-core'
  | 'kubernetes-network'
  | 'kubernetes-config'
  | 'kubernetes-troubleshooting'

export type QuestionKind = 'single' | 'multiple' | 'command' | 'open'
export type LabDomain = 'linux' | 'kubernetes'
export type ScenarioActionType = 'symptom' | 'diagnostic' | 'change' | 'verification' | 'dangerous' | 'noop' | 'unknown'

export interface QuizOption { id: string; label: string }

export interface QuizQuestion {
  id: string
  lessonId: ModuleId
  kind: QuestionKind
  prompt: string
  options?: QuizOption[]
  correctOptionIds?: string[]
  acceptedAnswers?: string[]
  referenceAnswer?: string
  explanation: string
}

export interface LabScenario {
  id: string
  lessonIds: ModuleId[]
  domain: LabDomain
  title: string
  shortTitle: string
  briefing: string
  hiddenCause: string
  symptomChecks: string[]
  requiredDiagnostics: string[]
  requiredVerifications: string[]
  acceptedResolutions: string[]
  optionalSteps: string[]
  dangerousActions: string[]
  hints: [string, string, string]
  successSummary: string
}

export interface ParsedCommand {
  raw: string
  command: string
  args: string[]
  flags: string[]
}

export interface ScenarioAction {
  type: ScenarioActionType
  object?: string
  arguments?: string[]
  diagnosticTags?: string[]
  changedState?: boolean
  dangerous?: boolean
  blocksResolution?: boolean
  meaningful?: boolean
}

export interface CommandResult {
  output: string
  tags: string[]
  action?: ScenarioAction
  isError?: boolean
}

export interface ScenarioActionLog {
  sequence: number
  at: number
  rawCommand: string
  parsed: ParsedCommand
  type: ScenarioActionType
  object?: string
  arguments: string[]
  diagnosticTags: string[]
  changedState: boolean
  dangerous: boolean
  blocksResolution: boolean
}

export interface ScenarioScore {
  score: number
  foundCause: boolean
  verified: boolean
  usedHints: number
  dangerousActions: number
  completedDiagnostics: string[]
  isResolved: boolean
}
