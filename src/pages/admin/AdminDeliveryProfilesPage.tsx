import { useState, useEffect } from 'react'
import { type Client, type DeliveryProfile, type DeliveryFormat } from '../../types/admin'
import { loadClients, loadDeliveryProfiles, saveDeliveryProfile, deleteDeliveryProfile } from '../../lib/adminStore'

const FORMAT_OPTIONS: { value: DeliveryFormat; label: string }[] = [
  { value: 'jsonl', label: 'JSONL' },
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'audio_manifest', label: 'Audio Manifest' },
  { value: 'wav_bundle', label: 'WAV Bundle' },
]

const CHANNEL_OPTIONS = ['직접 전달', 'API', '클라우드 공유']

type FormData = {
  clientId: string
  name: string
  format: DeliveryFormat
  channelKo: string
  requiresPiiCleaned: boolean
  requiresConsentVerified: boolean
  minQualityGrade: 'A' | 'B' | 'C' | ''
  notes: string
}

const EMPTY_FORM: FormData = {
  clientId: '', name: '', format: 'jsonl', channelKo: '직접 전달',
  requiresPiiCleaned: false, requiresConsentVerified: true, minQualityGrade: '', notes: '',
}

export default function AdminDeliveryProfilesPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [profiles, setProfiles] = useState<DeliveryProfile[]>([])
  const [filterClientId, setFilterClientId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([loadClients(), loadDeliveryProfiles()]).then(([c, p]) => {
      setClients(c)
      setProfiles(p)
      setLoading(false)
    })
  }, [])

  async function refresh() {
    const p = await loadDeliveryProfiles(filterClientId || undefined)
    setProfiles(p)
  }

  useEffect(() => {
    if (!loading) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClientId])

  function openNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, clientId: filterClientId || (clients[0]?.id ?? '') })
    setShowForm(true)
  }

  function openEdit(dp: DeliveryProfile) {
    setEditingId(dp.id)
    setForm({
      clientId: dp.clientId,
      name: dp.name,
      format: dp.format,
      channelKo: dp.channelKo,
      requiresPiiCleaned: dp.requiresPiiCleaned,
      requiresConsentVerified: dp.requiresConsentVerified,
      minQualityGrade: dp.minQualityGrade ?? '',
      notes: dp.notes ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.clientId) return
    setSaving(true)
    const now = new Date().toISOString()
    const existing = editingId ? profiles.find(p => p.id === editingId) : null
    const dp: DeliveryProfile = {
      id: editingId ?? `dp_${Date.now()}`,
      clientId: form.clientId,
      name: form.name.trim(),
      format: form.format,
      fieldset: existing?.fieldset ?? [],
      channelKo: form.channelKo,
      requiresPiiCleaned: form.requiresPiiCleaned,
      requiresConsentVerified: form.requiresConsentVerified,
      minQualityGrade: (form.minQualityGrade as 'A' | 'B' | 'C') || null,
      notes: form.notes.trim() || null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await saveDeliveryProfile(dp)
    setSaving(false)
    setShowForm(false)
    await refresh()
  }

  async function handleDelete(id: string) {
    await deleteDeliveryProfile(id)
    await refresh()
  }

  function clientName(id: string) {
    return clients.find(c => c.id === id)?.name ?? id
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
          납품 프로필 ({profiles.length}건)
        </h2>
        <button
          onClick={openNew}
          disabled={clients.length === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: '#1337ec' }}
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새 프로필
        </button>
      </div>

      {/* Client filter */}
      {clients.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterClientId('')}
            className="text-xs px-3 py-1 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: !filterClientId ? 'rgba(19,55,236,0.2)' : 'rgba(255,255,255,0.06)',
              color: !filterClientId ? '#1337ec' : 'rgba(255,255,255,0.5)',
            }}
          >
            전체
          </button>
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => setFilterClientId(c.id)}
              className="text-xs px-3 py-1 rounded-full whitespace-nowrap"
              style={{
                backgroundColor: filterClientId === c.id ? 'rgba(19,55,236,0.2)' : 'rgba(255,255,255,0.06)',
                color: filterClientId === c.id ? '#1337ec' : 'rgba(255,255,255,0.5)',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(19,55,236,0.3)' }}>
          <h3 className="text-sm font-semibold text-white">
            {editingId ? '프로필 수정' : '새 프로필'}
          </h3>
          <div className="space-y-2">
            {/* Client select */}
            <select
              value={form.clientId}
              onChange={e => setForm({ ...form, clientId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="">납품처 선택 *</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="프로필 이름 *"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.format}
                onChange={e => setForm({ ...form, format: e.target.value as DeliveryFormat })}
                className="px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {FORMAT_OPTIONS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select
                value={form.channelKo}
                onChange={e => setForm({ ...form, channelKo: e.target.value })}
                className="px-3 py-2 rounded-lg text-sm text-white outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {CHANNEL_OPTIONS.map(ch => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            </div>
            <select
              value={form.minQualityGrade}
              onChange={e => setForm({ ...form, minQualityGrade: e.target.value as FormData['minQualityGrade'] })}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <option value="">최소 등급 제한 없음</option>
              <option value="A">A등급 이상</option>
              <option value="B">B등급 이상</option>
              <option value="C">C등급 이상</option>
            </select>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <input
                  type="checkbox"
                  checked={form.requiresConsentVerified}
                  onChange={e => setForm({ ...form, requiresConsentVerified: e.target.checked })}
                  className="accent-blue-600"
                />
                동의 검증 필수
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <input
                  type="checkbox"
                  checked={form.requiresPiiCleaned}
                  onChange={e => setForm({ ...form, requiresPiiCleaned: e.target.checked })}
                  className="accent-blue-600"
                />
                PII 정제 필수
              </label>
            </div>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="메모"
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none resize-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.clientId}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: '#1337ec' }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* Profile list */}
      {clients.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span className="material-symbols-outlined text-4xl">business</span>
          <p className="text-sm mt-2">먼저 납품처를 등록하세요</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span className="material-symbols-outlined text-4xl">local_shipping</span>
          <p className="text-sm mt-2">등록된 프로필이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(dp => (
            <div key={dp.id} className="rounded-xl p-4" style={{ backgroundColor: '#1b1e2e' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-medium text-white">{dp.name}</h3>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {clientName(dp.clientId)}
                  </p>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: 'rgba(19,55,236,0.15)', color: '#1337ec' }}
                >
                  {dp.format.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                  {dp.channelKo}
                </span>
                {dp.minQualityGrade && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                    최소 {dp.minQualityGrade}등급
                  </span>
                )}
                {dp.requiresConsentVerified && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    동의 필수
                  </span>
                )}
                {dp.requiresPiiCleaned && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#eab308' }}>
                    PII 정제
                  </span>
                )}
              </div>

              {dp.notes && (
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{dp.notes}</p>
              )}

              <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => openEdit(dp)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: '#1337ec' }}
                >
                  수정
                </button>
                <button
                  onClick={() => handleDelete(dp.id)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: '#ef4444' }}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
