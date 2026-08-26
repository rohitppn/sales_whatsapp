import * as baileys from 'baileys'
const makeWASocket =
  baileys.makeWASocket ||
  baileys.default?.makeWASocket ||
  (typeof baileys.default === 'function' ? baileys.default : null) ||
  (typeof baileys === 'function' ? baileys : null)
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = baileys.default && baileys.default.useMultiFileAuthState ? baileys.default : baileys
import { Boom } from '@hapi/boom'
import express from 'express'
import QRCode from 'qrcode'
import qrcodeTerminal from 'qrcode-terminal'
import pino from 'pino'
import fs from 'fs'
import path from 'path'
import { salesReply, aiConfigured } from './ai.js'
import { startSession, logMsg } from './supalog.js'

const AUTH_DIR = process.env.AUTH_DIR || './auth'
const PORT = process.env.PORT || 3000
const QR_TOKEN = process.env.QR_ACCESS_TOKEN || null
const MIN_DELAY = parseInt(process.env.MIN_REPLY_DELAY_MS || '1200', 10)
const MAX_DELAY = parseInt(process.env.MAX_REPLY_DELAY_MS || '2600', 10)
const logger = pino({ level: 'warn' })

let sock = null
let latestQR = null
let latestQRAt = 0
let connecting = false
let reconnectTimer = null
let recentLogouts = []
const histories = new Map() // jid -> [{role, content}]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const randDelay = () => MIN_DELAY + Math.floor(Math.random() * Math.max(1, MAX_DELAY - MIN_DELAY))
const phoneFromJid = (jid) => (jid || '').split('@')[0].split(':')[0]

function scheduleReconnect(ms) {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => { reconnectTimer = null; startBot().catch((e) => console.error('Reconnect failed:', e.message)) }, ms)
}
// Empty AUTH_DIR contents (not the dir — it's the Railway volume mount) so the
// next connect makes a fresh QR.
function clearAuth() {
  try {
    if (fs.existsSync(AUTH_DIR)) for (const f of fs.readdirSync(AUTH_DIR)) fs.rmSync(path.join(AUTH_DIR, f), { recursive: true, force: true })
    latestQR = null
    console.log('🧹 Cleared stale auth — a fresh QR will appear on reconnect.')
  } catch (e) { console.error('clearAuth failed:', e.message) }
}
function logoutStorm() {
  const now = Date.now()
  recentLogouts = recentLogouts.filter((t) => now - t < 5 * 60 * 1000)
  recentLogouts.push(now)
  return recentLogouts.length > 4
}

async function handle(msg) {
  if (msg.key.fromMe) return
  const jid = msg.key.remoteJid || ''
  if (jid === 'status@broadcast' || jid.endsWith('@g.us') || jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) return

  const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
  if (!text.trim()) {
    if (msg.message?.imageMessage || msg.message?.audioMessage || msg.message?.documentMessage) {
      await sock.sendMessage(jid, { text: "Thanks! Best to type your question here and I'll help you right away 🙂" })
    }
    return
  }

  const phone = phoneFromJid(jid)
  const sid = 'wa_' + phone
  try { await sock.readMessages([msg.key]) } catch {}
  startSession(sid, phone)
  logMsg(sid, 'user', text)

  const hist = histories.get(jid) || []
  await sock.sendPresenceUpdate('composing', jid)
  const reply = await salesReply(hist.slice(-10), text)
  await sleep(randDelay())
  await sock.sendMessage(jid, { text: reply })
  await sock.sendPresenceUpdate('paused', jid)

  hist.push({ role: 'user', content: text }, { role: 'assistant', content: reply })
  histories.set(jid, hist.slice(-16))
  logMsg(sid, 'assistant', reply)
  console.log(`💬 [${phone}] ${text.slice(0, 40)} → ${reply.slice(0, 40)}`)
}

export async function startBot() {
  if (connecting) { console.log('⏳ startBot already running — skipping.'); return sock }
  connecting = true
  if (sock) { try { sock.ev.removeAllListeners(); sock.end(undefined) } catch {}; sock = null }
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`📦 Baileys WA version ${version.join('.')} (latest: ${isLatest})`)
    sock = makeWASocket({
      version, logger,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      browser: ['TheBroThing Sales', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false,
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (u) => {
      const { connection, lastDisconnect, qr } = u
      if (qr) {
        latestQR = qr; latestQRAt = Date.now()
        console.log('\n📱 Scan this QR with the bot\'s WhatsApp (Settings → Linked Devices → Link a device),')
        console.log('   or open the /qr link to scan an image in your browser / dashboard.\n')
        qrcodeTerminal.generate(qr, { small: true })
      }
      if (connection === 'close') {
        const code = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0
        if (code === DisconnectReason.loggedOut) {
          if (logoutStorm()) { console.error('🛑 Repeated logouts — ensure only ONE copy of this bot runs, then redeploy.'); return }
          console.log('🚪 Logged out / device removed. Clearing auth and re-pairing...')
          clearAuth(); scheduleReconnect(3000)
        } else { console.log(`❌ Connection closed (code ${code}). Reconnecting in 3s...`); scheduleReconnect(3000) }
      } else if (connection === 'open') {
        latestQR = null; recentLogouts = []
        console.log('✅ WhatsApp connected as', sock.user?.id)
      }
    })
    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const m of messages) { try { await handle(m) } catch (e) { console.error('Message handler error:', e) } }
    })
    return sock
  } finally { connecting = false }
}

// ── HTTP server: health + QR page (for the dashboard iframe / browser) ──────
const app = express()
app.get('/', (req, res) => res.send('ok'))
app.get('/qr', async (req, res) => {
  if (QR_TOKEN && req.query.t !== QR_TOKEN) return res.status(403).send('forbidden — append ?t=YOUR_QR_ACCESS_TOKEN')
  if (!latestQR) {
    return res.status(200).send('<!doctype html><meta http-equiv="refresh" content="8"><body style="font-family:sans-serif;text-align:center;padding:34px"><h2>No QR right now</h2><p>The bot is already linked, or still starting. This page refreshes automatically.</p></body>')
  }
  try {
    const url = await QRCode.toDataURL(latestQR, { width: 320, margin: 2 })
    const age = Math.round((Date.now() - latestQRAt) / 1000)
    res.send(`<!doctype html><meta http-equiv="refresh" content="20"><body style="font-family:sans-serif;text-align:center;padding:30px"><h2>Scan with the bot's WhatsApp</h2><img src="${url}" width="320" height="320" alt="WhatsApp QR"/><p style="color:#888">WhatsApp → Linked Devices → Link a device · QR age ${age}s · refreshes every 20s</p></body>`)
  } catch (e) { res.status(500).send('failed to render QR: ' + e.message) }
})
app.listen(PORT, () => {
  console.log(`🌐 HTTP on :${PORT} — open /qr to scan`)
  if (!aiConfigured()) console.warn('⚠️  ANTHROPIC_API_KEY not set — replies will be a fallback message until you set it.')
})

startBot().catch((e) => console.error('startBot failed:', e.message))
