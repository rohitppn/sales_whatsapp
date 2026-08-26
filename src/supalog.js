// Optional: log WhatsApp conversations to Supabase (same chat_sessions /
// chat_messages tables as the website). Only runs if SUPABASE_URL + KEY are set.
const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_ANON_KEY || ''
const on = () => URL && KEY
const H = () => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' })

export function startSession(id, phone) {
  if (!on() || !id) return
  fetch(`${URL}/rest/v1/chat_sessions`, {
    method: 'POST', headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify({ id, phone: phone || null }),
  }).catch(() => {}) // 409 if it already exists — fine
}
export function logMsg(id, role, content) {
  if (!on() || !id || !content) return
  fetch(`${URL}/rest/v1/chat_messages`, {
    method: 'POST', headers: { ...H(), Prefer: 'return=minimal' },
    body: JSON.stringify({ session_id: id, role, content: String(content).slice(0, 4000) }),
  }).catch(() => {})
}
