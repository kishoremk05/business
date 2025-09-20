<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1q5uLXJQ784jzf7xtncXGoA9RlYyT11k2

## Run Locally

Prerequisites: Node.js 18+

1. Install dependencies

```powershell
npm install
```

2. Configure environment variables

Copy `.env.example` to `.env` and set your values:

```powershell
Copy-Item .env.example .env
# then edit .env with your WhatsApp token and phone number ID
```

Required for WhatsApp Cloud API:

- `WHATSAPP_ACCESS_TOKEN` — Prefer a long‑lived System User token with scopes: `whatsapp_business_messaging` and `whatsapp_business_management`
- `WHATSAPP_PHONE_NUMBER_ID` — From Meta > WhatsApp > Getting Started

Optional for token check endpoint:

- `FB_APP_ID` and `FB_APP_SECRET` — enables `/wa-token-check` to use Graph `debug_token`

3. Start the backend API (WhatsApp/SMS)

```powershell
npm run server
# API will listen on http://localhost:3002
```

4. Start the frontend (Vite dev server)

```powershell
npm run dev
# Frontend will proxy /send-whatsapp etc to http://localhost:3002
```

## WhatsApp API Endpoints

- `POST /send-whatsapp` — Send a free-form text message
  Body: `{ to: "+15551234567", body: "Hello", accessToken?, phoneNumberId? }`
  If `accessToken`/`phoneNumberId` omitted, server uses `.env` values.

- `POST /send-whatsapp-template` — Send a template message
  Body: `{ to, template: { name, languageCode, components? }, accessToken?, phoneNumberId? }`

- `GET /wa-verify` — Verifies `phoneNumberId` with the token.

- `GET /wa-list-numbers?businessAccountId=...` — Lists WABA numbers.

- `GET /wa-token-check` — Checks token validity. If `FB_APP_ID`+`FB_APP_SECRET` are set, uses `debug_token` for expiry info.

All endpoints return JSON, including errors.

## Troubleshooting

- Error: `Error validating access token: Session has expired` (code 190, subcode 463)

  - Cause: Token is expired. Solution: create a long‑lived System User token in Business Settings and update `.env`.
  - You can confirm with: `GET /wa-token-check`

- Error: `Invalid OAuth access token` (code 190, subcode 467)

  - Cause: Wrong/invalid token or wrong business. Ensure the token belongs to the same Business Account as your `phoneNumberId` and has required scopes.

- `Non-JSON response` in UI
  - This server now consistently returns JSON for all errors, including JSON parse errors and 500s. If you still see this, ensure the request `Content-Type` is `application/json` and check the browser/devtools response body.

## Notes

- Phone numbers must be in E.164. The server normalizes common India mobile numbers to `+91` automatically.
- Vite dev server proxies API routes to the backend on port 3002.
