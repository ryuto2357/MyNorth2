'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type SupervisorLink = {
  id: string
  supervisor_role: string
  consent_level: string
  supervisor_name: string | null
  supervisor_email: string | null
}

type InviteModalState = {
  isOpen: boolean
  role: 'PARENT' | 'COUNSELOR'
  inviteUrl: string | null
  loading: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [user, setUser] = useState<{ name: string | null; email: string | null; tier: string | null; role: string | null } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [supervisorLinks, setSupervisorLinks] = useState<SupervisorLink[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [inviteModal, setInviteModal] = useState<InviteModalState>({
    isOpen: false,
    role: 'PARENT',
    inviteUrl: null,
    loading: false,
  })
  const [copied, setCopied] = useState(false)
  const [removingLinkId, setRemovingLinkId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      const { data } = await supabase.from('users').select('name, email, tier, role').eq('id', session.user.id).single()
      setUser(data)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (userId && user?.role === 'STUDENT') {
      loadSupervisorLinks()
    }
  }, [userId, user?.role])

  async function loadSupervisorLinks() {
    if (!userId) return
    setLinksLoading(true)
    const { data } = await supabase
      .from('supervisor_links')
      .select('id, supervisor_role, consent_level')
      .eq('student_id', userId)

    if (data) {
      const linksWithDetails: SupervisorLink[] = await Promise.all(
        data.map(async (link) => {
          const { data: supervisor } = await supabase
            .from('users')
            .select('name, email')
            .eq('id', (link as unknown as { supervisor_id: string }).supervisor_id)
            .single()
          return {
            id: link.id,
            supervisor_role: link.supervisor_role,
            consent_level: link.consent_level,
            supervisor_name: supervisor?.name || null,
            supervisor_email: supervisor?.email || null,
          }
        })
      )
      setSupervisorLinks(linksWithDetails)
    }
    setLinksLoading(false)
  }

  async function handleDelete() {
    if (deleteConfirm !== 'DELETE' || !userId) return
    setDeleting(true)

    await fetch('/api/account/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })

    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  async function handleInvite(role: 'PARENT' | 'COUNSELOR') {
    setInviteModal({ isOpen: true, role, inviteUrl: null, loading: true })

    const res = await fetch('/api/supervisor/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisorRole: role }),
    })

    const data = await res.json()

    if (res.ok) {
      setInviteModal({ isOpen: true, role, inviteUrl: data.inviteUrl, loading: false })
    } else {
      setInviteModal({ isOpen: true, role, inviteUrl: null, loading: false })
      alert(data.error || 'Failed to generate invite link')
    }
  }

  function closeInviteModal() {
    setInviteModal({ isOpen: false, role: 'PARENT', inviteUrl: null, loading: false })
    setCopied(false)
  }

  async function copyInviteUrl() {
    if (inviteModal.inviteUrl) {
      await navigator.clipboard.writeText(inviteModal.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleRemoveLink(linkId: string) {
    if (!confirm('Remove this supervisor connection?')) return
    setRemovingLinkId(linkId)

    const res = await fetch('/api/supervisor/consent', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId }),
    })

    if (res.ok) {
      setSupervisorLinks((prev) => prev.filter((l) => l.id !== linkId))
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to remove link')
    }

    setRemovingLinkId(null)
  }

  if (loading) return <div className="p-8 animate-pulse">Loading...</div>

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/app" className="text-gray-700 hover:text-gray-800 text-sm mb-6 inline-block">← Dashboard</Link>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="space-y-6">
        {/* Profile */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-3">Profile</h2>
          <p className="text-sm text-gray-600">Name: {user?.name || 'Not set'}</p>
          <p className="text-sm text-gray-600">Email: {user?.email || 'Not set'}</p>
          <p className="text-sm text-gray-600">Role: {user?.role || 'STUDENT'}</p>
          <p className="text-sm text-gray-600">Tier: {user?.tier || 'TIER_1'}</p>
        </div>

        {/* Supervisors */}
        {user?.role === 'STUDENT' && (
          <div className="card">
            <h2 className="font-bold text-gray-900 mb-3">Supervisors</h2>
            <p className="text-sm text-gray-500 mb-4">
              Invite a parent or counselor to support your progress. Share the invite link with them directly.
            </p>

            <div className="flex gap-3 mb-4">
              <button
                onClick={() => handleInvite('PARENT')}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Invite Parent
              </button>
              <button
                onClick={() => handleInvite('COUNSELOR')}
                className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
              >
                Invite Counselor
              </button>
            </div>

            {linksLoading ? (
              <div className="text-sm text-gray-400">Loading supervisors...</div>
            ) : supervisorLinks.length === 0 ? (
              <div className="text-sm text-gray-400">No supervisors connected yet.</div>
            ) : (
              <div className="space-y-2">
                {supervisorLinks.map((link) => (
                  <div
                    key={link.id}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {link.supervisor_name || link.supervisor_email || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {link.supervisor_role} ·{' '}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          {link.consent_level}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveLink(link.id)}
                      disabled={removingLinkId === link.id}
                      className="text-red-600 hover:text-red-700 text-sm disabled:opacity-50"
                    >
                      {removingLinkId === link.id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Links */}
        <div className="card">
          <h2 className="font-bold text-gray-900 mb-3">Quick Links</h2>
          <div className="space-y-2">
            <Link href="/app/settings/consent" className="block text-gray-700 hover:text-gray-800 text-sm">Privacy & Consent Settings →</Link>
            <Link href="/app/settings/subscription" className="block text-gray-700 hover:text-gray-800 text-sm">Subscription & Billing →</Link>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card border-red-200 bg-red-50">
          <h2 className="font-bold text-red-700 mb-3">Danger Zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="input-base mb-3"
          />
          <button
            onClick={handleDelete}
            disabled={deleteConfirm !== 'DELETE' || deleting}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete My Account'}
          </button>
        </div>
      </div>

      {/* Invite Modal */}
      {inviteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              Invite {inviteModal.role === 'PARENT' ? 'Parent' : 'Counselor'}
            </h3>

            {inviteModal.loading ? (
              <p className="text-sm text-gray-500">Generating invite link...</p>
            ) : inviteModal.inviteUrl ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Share this link with your {inviteModal.role.toLowerCase()}. They'll use it to connect their account to yours.
                </p>
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <code className="text-xs text-gray-700 flex-1 truncate">{inviteModal.inviteUrl}</code>
                  <button
                    onClick={copyInviteUrl}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-600">Failed to generate invite link. Please try again.</p>
            )}

            <button
              onClick={closeInviteModal}
              className="mt-6 w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
