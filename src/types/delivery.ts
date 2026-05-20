export type PackageStatus = 'building' | 'complete' | 'pending' | 'archived'

export interface DeliveryPackage {
  id: string
  package_number: string
  filename: string
  storage_path: string
  status: PackageStatus
  duration_seconds: number
  duration_minutes: number
  billable_hours: number
  session_count: number
  utterance_count: number
  size_bytes?: number | null
  created_at: string
  completed_at?: string | null
  delivered_at?: string | null
  delivered_to_client_id?: string | null
  metadata?: Record<string, unknown>
}

export type ExportJobStatus = 'queued' | 'processing' | 'complete' | 'failed'

export interface ExportJobV2 {
  id: string
  type: 'single_session' | 'batch_session' | 'delivery_package'
  status: ExportJobStatus
  session_ids?: string[] | null
  package_id?: string | null
  storage_path?: string | null
  user_id?: string | null
  progress: number
  total?: number | null
  error_message?: string | null
  created_at: string
  completed_at?: string | null
  expires_at?: string | null
  download_url?: string | null
}
