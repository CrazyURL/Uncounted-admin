import { useState, useEffect, useRef } from 'react'
import { type Client } from '../../types/admin'
import { loadClients, saveClient, deleteClient } from '../../lib/adminStore'

type FormData = {
  name: string
  contactName: string
  contactEmail: string
  notes: string
}

const EMPTY_FORM: FormData = { name: '', contactName: '', contactEmail: '', notes: '' }

export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    // React 18 Strict Mode 중복 실행 방지
    if (loadedRef.current) return
    loadedRef.current = true
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const data = await loadClients()
      setClients(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(c: Client) {
    setEditingId(c.id)
    setForm({
      name: c.name,
      contactName: c.contactName ?? '',
      contactEmail: c.contactEmail ?? '',
      notes: c.notes ?? '',
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const client: Client = {
        id: editingId ?? `cli_${Date.now()}`,
        name: form.name.trim(),
        contactName: form.contactName.trim() || null,
        contactEmail: form.contactEmail.trim() || null,
        notes: form.notes.trim() || null,
        isActive: true,
        createdAt: editingId ? clients.find(c => c.id === editingId)?.createdAt ?? now : now,
        updatedAt: now,
      }
      await saveClient(client)
      setShowForm(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteClient(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function toggleActive(c: Client) {
    setError(null)
    try {
      await saveClient({ ...c, isActive: !c.isActive, updatedAt: new Date().toISOString() })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
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
          납품처 ({clients.length}건)
        </h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ backgroundColor: '#1337ec' }}
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새 납품처
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <span className="material-symbols-outlined text-sm flex-shrink-0 mt-0.5">error</span>
          <div>
            <p className="font-medium">저장 실패</p>
            <p className="mt-0.5 opacity-80">{error}</p>
            {error.includes('relation') && error.includes('does not exist') && (
              <p className="mt-1 opacity-60">Supabase에서 003_admin_vnext.sql 마이그레이션을 실행하세요</p>
            )}
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#1b1e2e', border: '1px solid rgba(19,55,236,0.3)' }}>
          <h3 className="text-sm font-semibold text-white">
            {editingId ? '납품처 수정' : '새 납품처'}
          </h3>
          <div className="space-y-2">
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="회사명 *"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <input
              value={form.contactName}
              onChange={e => setForm({ ...form, contactName: e.target.value })}
              placeholder="담당자 이름"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <input
              value={form.contactEmail}
              onChange={e => setForm({ ...form, contactEmail: e.target.value })}
              placeholder="담당자 이메일"
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
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
              disabled={saving || !form.name.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: '#1337ec' }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* Client list */}
      {clients.length === 0 ? (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span className="material-symbols-outlined text-4xl">business</span>
          <p className="text-sm mt-2">등록된 납품처가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map(c => (
            <div
              key={c.id}
              className="rounded-xl p-4"
              style={{ backgroundColor: '#1b1e2e', opacity: c.isActive ? 1 : 0.5 }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-medium text-white">{c.name}</h3>
                  {c.contactName && (
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {c.contactName}
                      {c.contactEmail && <span> &middot; {c.contactEmail}</span>}
                    </p>
                  )}
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: c.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                    color: c.isActive ? '#22c55e' : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {c.isActive ? '활성' : '비활성'}
                </span>
              </div>

              {c.notes && (
                <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>{c.notes}</p>
              )}

              <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => openEdit(c)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: '#1337ec' }}
                >
                  수정
                </button>
                <button
                  onClick={() => toggleActive(c)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                >
                  {c.isActive ? '비활성화' : '활성화'}
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
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
