// AI sales reply via Claude (Anthropic). Uses fetch (Node 18+) — no SDK needed.
const KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
const CALENDLY = process.env.CALENDLY_URL || 'https://calendly.com/thebrothing/dating-consultation-session'

const SYSTEM =
  'You are the WhatsApp assistant for TheBroThing, a premium dating and confidence coaching brand for Indian men, founded by Arunav Gupta. ' +
  'People message you after tapping the WhatsApp button on the website. Your job: warmly help them, answer questions, handle doubts honestly, and guide them toward booking a 1-on-1 dating coaching consultation call. ' +
  'Services: (1) 1-on-1 Dating Coaching with Arunav\'s method — the flagship, personalised coaching (push this first). (2) FLIRT Academy — a self-paced online course. (3) FlirtCoachAI — an AI texting coach on WhatsApp. ' +
  'Style: VERY SHORT, warm, human, WhatsApp-style. 1 to 2 short sentences max, never long paragraphs. One question at a time. Be helpful, not pushy. ' +
  'Reply in English only. Never make guarantees, medical claims, or fake statistics. Do not use em-dashes. ' +
  'Early in the chat, ask their first name and what they are struggling with in dating. ' +
  'When they show interest, share this booking link and encourage them to pick a slot: ' + CALENDLY + ' . Keep the momentum toward booking the call.'

export function aiConfigured() { return !!KEY }

export async function salesReply(history, userText) {
  if (!KEY) return "Thanks for reaching out! Our team will reply shortly. Meanwhile you can book a call: " + CALENDLY
  const messages = [
    ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) })),
    { role: 'user', content: String(userText).slice(0, 2000) },
  ]
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 200, system: SYSTEM, messages }),
    })
    if (!res.ok) { console.error('Claude error', res.status, (await res.text()).slice(0, 200)); return "Sorry, small glitch on my side. Please try again in a moment, or book a call: " + CALENDLY }
    const d = await res.json()
    let t = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
    t = t.replace(/\s*—\s*/g, ', ')
    return t || 'Happy to help! What would you like to know about the coaching?'
  } catch (e) {
    console.error('Claude exception', e.message)
    return "Sorry, small glitch. Please try again, or book a call: " + CALENDLY
  }
}
