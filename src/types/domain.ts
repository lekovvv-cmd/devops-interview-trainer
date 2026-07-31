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

export interface CommandExample {
  command: string
  description: string
}

export interface QuizOption {
  id: string
  label: string
}

export interface QuizQuestion {
  id: string
  moduleId: ModuleId
  kind: QuestionKind
  prompt: string
  options?: QuizOption[]
  correctOptionIds?: string[]
  acceptedAnswers?: string[]
  referenceAnswer?: string
  explanation: string
}

export interface LessonModule {
  id: ModuleId
  title: string
  duration: string
  summary: string
  keyConcepts: string[]
  commands: CommandExample[]
  workExample: { title: string; context: string; code: string }
  mistakes: string[]
  interviewQuestions: string[]
  miniCheckId: string
  practicePrompt: string
}

export interface LabScenario {
  id: string
  domain: LabDomain
  title: string
  shortTitle: string
  briefing: string
  hiddenCause: string
  requiredDiagnostics: string[]
  acceptedResolutions: string[]
  optionalSteps: string[]
  dangerousActions: string[]
  hints: [string, string, string]
  successSummary: string
}

export interface CommandResult {
  output: string
  tags: string[]
  isError?: boolean
}

export interface ScenarioScore {
  score: number
  foundCause: boolean
  usedHints: number
  completedDiagnostics: string[]
  isResolved: boolean
}
