# TheBroThing — WhatsApp AI Sales Bot

A standalone WhatsApp bot that chats with people as an AI, answers their
questions about TheBroThing, and guides them to book a coaching call. Made to
run on **Railway**. This is the bot behind the website's floating WhatsApp
button.

---

## What it does

- Someone messages the bot's WhatsApp number → the bot replies as an AI (short,
  warm, English, sales-focused) and pushes them toward booking a call.
- Keeps a short memory of each chat so replies stay in context.
- Shows a QR page at `/qr` so you scan the login from your browser or the
  dashboard.
- Optionally logs every chat into your Supabase (the dashboard's WhatsApp Chat
  section can then show them).

---

## Deploy to Railway (step by step)

1. **Push this folder to a GitHub repo** (or use Railway's "Deploy from local").
2. In Railway: **New Project → Deploy from GitHub repo** → pick this repo.
3. **Add a Volume** (this is what keeps you logged in across redeploys):
   - Project → your service → **Variables/Settings → Volumes → New Volume**
   - Mount path: **`/data`**
4. **Add Variables** (Settings → Variables):

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Anthropic key (rotate the old one) |
   | `AUTH_DIR` | `/data/auth` |
   | `CALENDLY_URL` | your booking link |
   | `QR_ACCESS_TOKEN` | any secret word (protects the QR page) |
   | `SUPABASE_URL` | *(optional)* your Supabase URL |
   | `SUPABASE_ANON_KEY` | *(optional)* your Supabase anon key |

   Do **not** set `PORT` — Railway provides it.
5. **Deploy.** Open the deploy **Logs**. You'll see a QR in the logs, or open
   the public URL + `/qr`:
   `https://your-app.up.railway.app/qr?t=YOUR_QR_ACCESS_TOKEN`
6. On the phone that will BE the bot: **WhatsApp → Settings → Linked Devices →
   Link a device** → scan the QR. Done. It stays logged in through future
   redeploys because of the `/data` volume.

---

## Wire it to the website

- **Floating button number:** in the dashboard, set the WhatsApp number to this
  bot's number so the website button opens a chat with the bot.
- **Dashboard QR:** in the dashboard's **WhatsApp Chat** section, set the Bot QR
  URL to `https://your-app.up.railway.app/qr?t=YOUR_QR_ACCESS_TOKEN` so you can
  re-scan any time from the dashboard.

---

## Run locally (to test)

```bash
cp .env.example .env      # fill in ANTHROPIC_API_KEY at least
npm install
npm start
```

Then open http://localhost:3000/qr and scan with a spare WhatsApp number.

---

## ⚠️ Important: WhatsApp ban risk

This uses an **unofficial** WhatsApp connection (Baileys). Automated selling on a
personal number can get that number **banned** by WhatsApp. Use a **dedicated**
number you don't mind risking, keep replies human and low-volume, and never blast
unsolicited messages. For a fully safe setup, the official WhatsApp Business API
(via a provider) is the long-term option.
