import { requestJson } from './client'

export interface StepPlan {
  step: string
  needs_run: boolean
  reasons: string[]
}

export interface PipelinePlan {
  steps: StepPlan[]
}

export interface StepRunResult {
  step: string
  status: string
  error: string | null
  messages: string[]
}

export interface StepStatus {
  status: string
  error: string | null
  fingerprint: string
}

export interface StepConfig {
  step: string
  config_sections: Record<string, unknown>
  active_options: Record<string, string>
}

export function fetchPipelinePlan(
  projectId: number,
  signal?: AbortSignal,
): Promise<PipelinePlan> {
  return requestJson<PipelinePlan>(
    `/project/${projectId}/pipeline/plan`,
    { signal },
  )
}

export function runPipelineStep(
  projectId: number,
  stepName: string,
): Promise<StepRunResult> {
  return requestJson<StepRunResult>(
    `/project/${projectId}/pipeline/run/${stepName}`,
    { method: 'POST' },
  )
}

export interface StepProgress {
  running: boolean
  fraction: number
  message: string
  messages: string[]
  done: boolean
  result: { status: string; error: string | null } | null
}

export function fetchStepProgress(
  projectId: number,
  stepName: string,
  signal?: AbortSignal,
): Promise<StepProgress> {
  return requestJson<StepProgress>(
    `/project/${projectId}/pipeline/progress/${stepName}`,
    { signal },
  )
}

export function fetchPipelineStatus(
  projectId: number,
  signal?: AbortSignal,
): Promise<Record<string, StepStatus>> {
  return requestJson<Record<string, StepStatus>>(
    `/project/${projectId}/pipeline/status`,
    { signal },
  )
}

export function fetchStepConfig(
  projectId: number,
  stepName: string,
  signal?: AbortSignal,
): Promise<StepConfig> {
  return requestJson<StepConfig>(
    `/project/${projectId}/pipeline/step-config/${stepName}`,
    { signal },
  )
}

export interface OptionSetInfo {
  key: string
  is_active: boolean
  summary: Record<string, unknown>
}

export interface ProjectOptions {
  active_options: Record<string, string>
  survey: OptionSetInfo[]
  grid: OptionSetInfo[]
  offsetters: OptionSetInfo[]
  crew: OptionSetInfo[]
  metadata: Record<string, string>
}

export function fetchProjectOptions(
  projectId: number,
  signal?: AbortSignal,
): Promise<ProjectOptions> {
  return requestJson<ProjectOptions>(
    `/project/${projectId}/pipeline/options`,
    { signal },
  )
}

export function resetPipeline(
  projectId: number,
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(
    `/project/${projectId}/pipeline/reset`,
    { method: 'POST' },
  )
}

export function resetPipelineStep(
  projectId: number,
  stepName: string,
): Promise<{ status: string; step: string }> {
  return requestJson<{ status: string; step: string }>(
    `/project/${projectId}/pipeline/reset/${stepName}`,
    { method: 'POST' },
  )
}

export type ClosureStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface ClosureStepProgress {
  step: string
  status: ClosureStepStatus
  fraction: number
  message: string
  messages: string[]
  error: string | null
}

export interface ClosureProgress {
  target: string
  steps: ClosureStepProgress[]
  current_index: number
  done: boolean
  error: string | null
  running: boolean
}

export function runPipelineStepClosure(
  projectId: number,
  stepName: string,
): Promise<ClosureProgress> {
  return requestJson<ClosureProgress>(
    `/project/${projectId}/pipeline/run-closure/${stepName}`,
    { method: 'POST' },
  )
}

export function fetchClosureProgress(
  projectId: number,
  stepName: string,
  signal?: AbortSignal,
): Promise<ClosureProgress> {
  return requestJson<ClosureProgress>(
    `/project/${projectId}/pipeline/progress-closure/${stepName}`,
    { signal },
  )
}

export function setActiveOption(
  projectId: number,
  section: string,
  key: string,
): Promise<{ section: string; key: string }> {
  return requestJson<{ section: string; key: string }>(
    `/project/${projectId}/pipeline/options/active`,
    { method: 'PUT', body: { section, key } },
  )
}
