import { createServiceClient } from '@/lib/supabase/server'

export type StepStatus = 'idle' | 'running' | 'done' | 'error'

export type PipelineRunStep = {
  status:   StepStatus
  message?: string
  detail?:  string
}

export class PipelineRun {
  id: string
  private supabase: ReturnType<typeof createServiceClient>
  private steps: Record<string, PipelineRunStep> = {}

  private constructor(id: string, supabase: ReturnType<typeof createServiceClient>) {
    this.id = id
    this.supabase = supabase
  }

  static async create(): Promise<PipelineRun> {
    const supabase = createServiceClient()
    // Mark any stale running runs as error
    await supabase
      .from('pipeline_runs')
      .update({ status: 'error', error: 'Afbrudt — ny kørsel startet', finished_at: new Date().toISOString() })
      .eq('status', 'running')

    const { data } = await supabase
      .from('pipeline_runs')
      .insert({ status: 'running', steps: {}, started_at: new Date().toISOString() })
      .select('id')
      .single()

    return new PipelineRun(data!.id, supabase)
  }

  static async latest(): Promise<{ id: string; status: string; steps: Record<string, PipelineRunStep>; summary: Record<string, number> | null; error: string | null; started_at: string; finished_at: string | null } | null> {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('pipeline_runs')
      .select('id, status, steps, summary, error, started_at, finished_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()
    return data ?? null
  }

  async updateStep(stage: string, patch: Partial<PipelineRunStep>) {
    this.steps[stage] = { ...(this.steps[stage] ?? { status: 'idle' }), ...patch }
    await this.supabase
      .from('pipeline_runs')
      .update({ steps: this.steps, updated_at: new Date().toISOString() })
      .eq('id', this.id)
  }

  async finish(summary: Record<string, number>) {
    await this.supabase
      .from('pipeline_runs')
      .update({ status: 'done', summary, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', this.id)
  }

  async fail(error: string) {
    await this.supabase
      .from('pipeline_runs')
      .update({ status: 'error', error, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', this.id)
  }
}
