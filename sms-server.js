// SMS-only API (Twilio)
// Usage: node sms-server.js
// NOTE: Move TWILIO_* secrets into environment variables in production.

import "dotenv/config";
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import twilio from "twilio";

// Phone normalization logic
function normalizePhone(raw) {
  if (!raw) return { ok: false, reason: "Empty phone" };
  const cleaned = String(raw)
    .replace(/[^0-9+]/g, "")
    .trim();
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (/^[0-9]{10,15}$/.test(digits)) return { ok: true, value: cleaned };
    return { ok: false, reason: "Invalid E.164 format" };
  }
  const digitsOnly = cleaned.replace(/^0+/, "");
  if (/^[6-9][0-9]{9}$/.test(digitsOnly)) {
    return { ok: true, value: "+91" + digitsOnly }; // Heuristic for India mobile numbers
  }
  if (/^[0-9]{10,15}$/.test(digitsOnly)) {
    return {
      ok: false,
      reason: "Ambiguous country code; include +<country_code>",
    };
  }
  return { ok: false, reason: "Unrecognized phone pattern" };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "500kb" }));
app.use((req, _res, next) => {
  console.log(`[sms-api] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// JSON body parse errors -> JSON response instead of HTML
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, error: "Invalid JSON body" });
  }
  return next(err);
});

// Twilio SMS endpoint
app.post("/send-sms", async (req, res) => {
  const { accountSid, authToken, from, to, body } = req.body;
  const statusCallback =
    req.body.statusCallback || process.env.TWILIO_STATUS_CALLBACK_URL || null;
  if (!accountSid || !authToken || !from || !to || !body) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields.",
      fields: {
        accountSid: !!accountSid,
        authToken: !!authToken,
        from: !!from,
        to: !!to,
        body: !!body,
      },
    });
  }

  const normFrom = normalizePhone(from);
  const normTo = normalizePhone(to);
  if (!normFrom.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'from' number: ${normFrom.reason}`,
      original: from,
    });
  }
  if (!normTo.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'to' number: ${normTo.reason}`,
      original: to,
    });
  }

  try {
    const client = twilio(accountSid, authToken);
    const createParams = {
      body,
      from: normFrom.value,
      to: normTo.value,
      ...(statusCallback ? { statusCallback } : {}),
    };
    const message = await client.messages.create(createParams);
    res.json({ success: true, sid: message.sid, to: normTo.value });
  } catch (err) {
    const twilioCode = err.code;
    let hint;
    if (twilioCode === 21211) {
      hint =
        "Check destination number formatting (must be in E.164 and enabled for SMS).";
    } else if (twilioCode === 21608) {
      hint = "Trial account: destination number not verified.";
    }
    res
      .status(500)
      .json({ success: false, error: err.message, code: twilioCode, hint });
  }
});

// Twilio WhatsApp endpoint
// Body: { accountSid, authToken, fromWa, to, body, statusCallback? }
// fromWa and to must be phone numbers in E.164; server will prefix whatsapp:
app.post("/send-twilio-whatsapp", async (req, res) => {
  const { accountSid, authToken, fromWa, to, body } = req.body || {};
  const statusCallback =
    req.body?.statusCallback || process.env.TWILIO_STATUS_CALLBACK_URL || null;
  if (!accountSid || !authToken || !fromWa || !to || !body) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields.",
      fields: {
        accountSid: !!accountSid,
        authToken: !!authToken,
        fromWa: !!fromWa,
        to: !!to,
        body: !!body,
      },
    });
  }

  const normFrom = normalizePhone(fromWa);
  const normTo = normalizePhone(to);
  if (!normFrom.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'fromWa' number: ${normFrom.reason}`,
      original: fromWa,
    });
  }
  if (!normTo.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'to' number: ${normTo.reason}`,
      original: to,
    });
  }

  try {
    const client = twilio(accountSid, authToken);
    const params = {
      from: `whatsapp:${normFrom.value}`,
      to: `whatsapp:${normTo.value}`,
      body,
      ...(statusCallback ? { statusCallback } : {}),
    };
    const message = await client.messages.create(params);
    return res.json({ success: true, sid: message.sid, to: normTo.value });
  } catch (err) {
    const code = err?.code;
    let hint;
    if (code === 21606) {
      hint =
        "The From WhatsApp number is not a valid WhatsApp-enabled Twilio number.";
    } else if (code === 63016 || code === 63018) {
      hint =
        "WhatsApp sender is not approved to message this recipient or message template/permissions missing.";
    } else if (code === 63015) {
      hint =
        "Message failed by WhatsApp; verify content, compliance, and that the recipient has opted-in.";
    } else if (code === 21608) {
      hint = "Trial account restriction: destination number not verified.";
    } else if (code === 21211) {
      hint =
        "Check E.164 formatting and ensure the destination supports WhatsApp.";
    }
    return res
      .status(500)
      .json({ success: false, error: err.message || String(err), code, hint });
  }
});

// Twilio delivery status webhook (configure 'statusCallback' to point here)
// Twilio posts application/x-www-form-urlencoded
app.post(
  "/twilio-status",
  express.urlencoded({ extended: false }),
  (req, res) => {
    // Example fields: MessageSid, MessageStatus (queued|sent|delivered|undelivered|failed), ErrorCode
    console.log("[twilio-status]", req.body);
    // Always 200 OK so Twilio doesn't retry unnecessarily
    res.json({ success: true });
  }
);

// Fetch a Twilio message status by SID (for ad-hoc checks)
// GET /twilio-message/:sid?accountSid=...&authToken=...
app.get("/twilio-message/:sid", async (req, res) => {
  const accountSid = req.query.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = req.query.authToken || process.env.TWILIO_AUTH_TOKEN;
  const { sid } = req.params;
  if (!accountSid || !authToken) {
    return res.status(400).json({
      success: false,
      error: "Missing Twilio credentials (query or env).",
    });
  }
  try {
    const client = twilio(String(accountSid), String(authToken));
    const msg = await client.messages(String(sid)).fetch();
    return res.json({
      success: true,
      status: msg.status,
      errorCode: msg.errorCode,
      msg,
    });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, error: e.message || String(e) });
  }
});

// WhatsApp Cloud API endpoint (Meta Graph API)
// Requires: accessToken (Bearer), phoneNumberId (WABA phone number ID), to (E.164), body (text)
app.post("/send-whatsapp", async (req, res) => {
  const { to, body } = req.body;
  const accessToken = req.body.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    req.body.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const debug = req.body.debug === true || req.query?.debug === "1";
  if (!accessToken || !phoneNumberId || !to || !body) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields.",
      fields: {
        accessToken: !!accessToken,
        phoneNumberId: !!phoneNumberId,
        to: !!to,
        body: !!body,
      },
    });
  }

  const normTo = normalizePhone(to);
  if (!normTo.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'to' number: ${normTo.reason}`,
      original: to,
    });
  }

  // WhatsApp Cloud API expects numbers without the leading '+'
  const waTo = normTo.value.replace(/^\+/, "");

  try {
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
      phoneNumberId
    )}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waTo,
        type: "text",
        text: { body },
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      // Cloud API error schema
      const err = data?.error || {};
      const details = err?.error_data?.details || err?.message || "";
      let hint;
      if (resp.status === 404) {
        hint =
          "Phone Number ID not found or token lacks permission. Confirm Phone Number ID in Meta > WhatsApp > Getting Started and use a token from the same Business Account.";
      } else if (err.code === 190) {
        const sub = err.error_subcode;
        if (sub === 463) {
          hint =
            "Access token expired. Create a System User permanent token in Business Settings and update your server env.";
        } else if (sub === 467) {
          hint =
            "Invalid access token. Ensure you're using a valid token from the same Business Account with whatsapp_business_messaging scope.";
        } else {
          hint =
            "Invalid or expired access token. Regenerate and use a long‑lived System User token.";
        }
      } else if (err.code === 100) {
        hint =
          "Invalid parameter. Ensure 'to' is a valid E.164 phone and this business has user opt-in.";
      } else if (err.code === 131026) {
        hint =
          "Recipient is not a valid WhatsApp user for this API or may have blocked messages. Verify the phone has WhatsApp, is not blocked, and is added as a tester if using a test business phone.";
      } else if (
        typeof details === "string" &&
        /24\s*hour|customer care window|outside the 24/i.test(details)
      ) {
        hint =
          "Free-form text can only be sent within 24h of user's last message. Use an approved template for initial outreach or outside the 24h window.";
      } else if (
        typeof details === "string" &&
        /Unsupported message type|type is invalid/i.test(details)
      ) {
        hint =
          "Message payload invalid. For simple text, ensure type='text' and text.body is a non-empty string.";
      }
      console.error("[wa-api] Error:", {
        status: resp.status,
        message: err.message,
        code: err.code,
        subcode: err.error_subcode,
        details: err,
        error_data: err?.error_data,
        api_response: data,
      });
      return res.status(resp.status).json({
        success: false,
        error: err.message || "WhatsApp API error",
        code: err.code,
        subcode: err.error_subcode,
        details: err,
        hint,
        ...(debug ? { raw: data } : {}),
      });
    }

    const messageId = data?.messages?.[0]?.id;
    res.json({
      success: true,
      id: messageId,
      to: waTo,
      ...(debug ? { raw: data } : {}),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// WhatsApp Cloud API - send TEMPLATE message
// Body: { accessToken, phoneNumberId, to, template: { name, languageCode, components? } }
app.post("/send-whatsapp-template", async (req, res) => {
  const accessToken = req.body.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    req.body.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const { to, template } = req.body;
  const debug = req.body.debug === true || req.query?.debug === "1";
  if (
    !accessToken ||
    !phoneNumberId ||
    !to ||
    !template?.name ||
    !template?.languageCode
  ) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields.",
      fields: {
        accessToken: !!accessToken,
        phoneNumberId: !!phoneNumberId,
        to: !!to,
        templateName: !!template?.name,
        languageCode: !!template?.languageCode,
      },
    });
  }

  const normTo = normalizePhone(to);
  if (!normTo.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'to' number: ${normTo.reason}`,
      original: to,
    });
  }
  const waTo = normTo.value.replace(/^\+/, "");

  try {
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
      phoneNumberId
    )}/messages`;
    const body = {
      messaging_product: "whatsapp",
      to: waTo,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.languageCode },
        // Optional: components must match your template structure if provided
        ...(template.components ? { components: template.components } : {}),
      },
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = data?.error || {};
      let hint;
      if (resp.status === 404)
        hint = "Phone Number ID not found or token lacks permission.";
      if (err.code === 190) {
        const sub = err.error_subcode;
        if (sub === 463)
          hint =
            "Access token expired. Use a System User permanent token and rotate before expiry.";
        else if (sub === 467)
          hint =
            "Invalid token. Ensure token belongs to the same business and has WhatsApp scopes.";
        else hint = "Invalid or expired access token.";
      }
      if (err.code === 100)
        hint =
          "Invalid parameter. Check template name, language code, and opt-in.";
      return res.status(resp.status).json({
        success: false,
        error: err.message,
        code: err.code,
        subcode: err.error_subcode,
        details: err,
        hint,
        ...(debug ? { raw: data } : {}),
      });
    }
    const messageId = data?.messages?.[0]?.id;
    return res.json({
      success: true,
      id: messageId,
      to: waTo,
      ...(debug ? { raw: data } : {}),
    });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, error: e.message || String(e) });
  }
});

// Health endpoints
const healthHandler = (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    sms: "enabled",
    whatsapp: "enabled",
  });
};
app.get("/health", healthHandler);

// DEBUG: list registered routes (temporary)
app.get("/__routes", (req, res) => {
  try {
    const routes = [];
    const stack = app._router && app._router.stack ? app._router.stack : [];
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {})
          .filter((m) => layer.route.methods[m])
          .map((m) => m.toUpperCase());
        routes.push({ path: layer.route.path, methods });
      } else if (
        layer.name === "router" &&
        layer.handle &&
        layer.handle.stack
      ) {
        for (const s of layer.handle.stack) {
          if (s.route && s.route.path) {
            const methods = Object.keys(s.route.methods || {})
              .filter((m) => s.route.methods[m])
              .map((m) => m.toUpperCase());
            routes.push({ path: s.route.path, methods });
          }
        }
      }
    }
    res.json({ ok: true, routes });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Verify WhatsApp Cloud API configuration
// GET /wa-verify?accessToken=...&phoneNumberId=...
app.get("/wa-verify", async (req, res) => {
  const accessToken =
    req.query.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    req.query.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    return res.status(400).json({
      success: false,
      error: "Missing accessToken or phoneNumberId",
    });
  }
  try {
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
      String(phoneNumberId)
    )}?fields=id,display_phone_number,verified_name`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = data?.error || {};
      let hint;
      if (resp.status === 404) {
        hint =
          "Phone Number ID not found for this token. Ensure the ID is correct and the token belongs to the same WhatsApp Business Account.";
      } else if (err.code === 190) {
        const sub = err.error_subcode;
        if (sub === 463) hint = "Access token expired.";
        else if (sub === 467) hint = "Invalid access token.";
        else hint = "Invalid or expired access token.";
      } else if (err.code === 10) {
        hint =
          "Permission denied: token missing required scopes or app not authorized.";
      }
      return res.status(resp.status).json({
        success: false,
        error: err.message,
        code: err.code,
        subcode: err.error_subcode,
        hint,
        details: err,
      });
    }
    return res.json({ success: true, info: data });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, error: e.message || String(e) });
  }
});

// List phone numbers under a WhatsApp Business Account
// GET /wa-list-numbers?accessToken=...&businessAccountId=...
app.get("/wa-list-numbers", async (req, res) => {
  const accessToken =
    req.query.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const businessAccountId = req.query.businessAccountId;
  if (!accessToken || !businessAccountId) {
    return res.status(400).json({
      success: false,
      error: "Missing accessToken or businessAccountId",
    });
  }
  try {
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
      String(businessAccountId)
    )}/phone_numbers?fields=id,display_phone_number,verified_name`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = data?.error || {};
      let hint;
      if (resp.status === 404) {
        hint =
          "Business Account ID not found or token lacks permission to this WABA. Ensure the token is from the same business and app has WhatsApp product access.";
      } else if (err.code === 190) {
        const sub = err.error_subcode;
        if (sub === 463) hint = "Access token expired.";
        else if (sub === 467) hint = "Invalid access token.";
        else hint = "Invalid/expired access token.";
      } else if (err.code === 10) {
        hint =
          "Permission denied. Grant whatsapp_business_management on this business.";
      }
      return res.status(resp.status).json({
        success: false,
        error: err.message,
        code: err.code,
        subcode: err.error_subcode,
        hint,
        details: err,
      });
    }
    return res.json({ success: true, numbers: data?.data || [] });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, error: e.message || String(e) });
  }
});

// Check if a phone number is a valid WhatsApp user via Contacts API
// POST /wa-check-contact { accessToken, phoneNumberId, to }
app.post("/wa-check-contact", async (req, res) => {
  const accessToken = req.body.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    req.body.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const { to } = req.body;
  if (!accessToken || !phoneNumberId || !to) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields.",
      fields: {
        accessToken: !!accessToken,
        phoneNumberId: !!phoneNumberId,
        to: !!to,
      },
    });
  }
  const normTo = normalizePhone(to);
  if (!normTo.ok) {
    return res.status(400).json({
      success: false,
      error: `Invalid 'to' number: ${normTo.reason}`,
      original: to,
    });
  }
  const waTo = normTo.value.replace(/^\+/, "");
  try {
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
      String(phoneNumberId)
    )}/contacts`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        blocking: "wait",
        contacts: [waTo],
        force_check: true,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = data?.error || {};
      let hint;
      if (err.code === 190) hint = "Invalid or expired access token.";
      else if (err.code === 10)
        hint = "Permission denied: ensure proper scopes and app access.";
      return res.status(resp.status).json({
        success: false,
        error: err.message || "Contacts API error",
        code: err.code,
        subcode: err.error_subcode,
        details: err,
        hint,
      });
    }
    // Expected shape: { contacts: [{ input, status: "valid"|"invalid"|..., wa_id? }], ... }
    return res.json({ success: true, result: data });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, error: e.message || String(e) });
  }
});

// WhatsApp Cloud API webhook to receive message statuses and inbound messages
// Configure in Meta App: webhook verify token must match WA_VERIFY_TOKEN
app.get("/wa-webhook", (req, res) => {
  const verifyToken = process.env.WA_VERIFY_TOKEN || "dev-verify-token";
  const mode = req.query["hub.mode"]; // subscribe
  const token = req.query["hub.verify_token"]; // should equal verifyToken
  const challenge = req.query["hub.challenge"]; // echo back
  if (mode === "subscribe" && token === verifyToken) {
    console.log("[wa-webhook] Verified webhook");
    return res.status(200).send(String(challenge || ""));
  }
  return res.status(403).send("Forbidden");
});

app.post("/wa-webhook", async (req, res) => {
  // Meta posts JSON with entry -> changes -> value -> statuses/messages
  try {
    console.log("[wa-webhook] payload", JSON.stringify(req.body, null, 2));
  } catch {}
  // Always 200 OK quickly
  res.sendStatus(200);
});

// WhatsApp token health check
// GET /wa-token-check?accessToken=... [optional: phoneNumberId=...]
// If FB_APP_ID and FB_APP_SECRET are provided, uses Graph debug_token for detailed expiry info.
app.get("/wa-token-check", async (req, res) => {
  const token = req.query.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    req.query.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token) {
    return res.status(400).json({
      success: false,
      error: "Missing access token (query or WHATSAPP_ACCESS_TOKEN env)",
    });
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  try {
    if (appId && appSecret) {
      const appAccessToken = `${appId}|${appSecret}`;
      const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(
        String(token)
      )}&access_token=${encodeURIComponent(appAccessToken)}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data?.data) {
        const err = data?.error || {};
        return res.status(resp.status || 500).json({
          success: false,
          error: err.message || "debug_token failed",
          details: data,
        });
      }
      const d = data.data;
      return res.json({
        success: true,
        source: "debug_token",
        is_valid: d.is_valid,
        expires_at: d.expires_at
          ? new Date(d.expires_at * 1000).toISOString()
          : null,
        issued_at: d.issued_at
          ? new Date(d.issued_at * 1000).toISOString()
          : null,
        scopes: d.scopes,
        user_id: d.user_id,
        type: d.type,
        application: d.application,
      });
    }

    // Fallback: attempt a lightweight WA verify call
    if (!phoneNumberId) {
      return res.status(400).json({
        success: false,
        error:
          "Missing phoneNumberId (query or WHATSAPP_PHONE_NUMBER_ID env) for fallback check.",
      });
    }
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(
      String(phoneNumberId)
    )}?fields=id`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = data?.error || {};
      return res.status(resp.status).json({
        success: false,
        error: err.message,
        code: err.code,
        subcode: err.error_subcode,
        details: err,
      });
    }
    return res.json({ success: true, source: "wa-verify", is_valid: true });
  } catch (e) {
    return res
      .status(500)
      .json({ success: false, error: e.message || String(e) });
  }
});

// 404 JSON fallback
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Not Found", path: req.url });
});

// Final error handler: always JSON
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[server-error]", err);
  res
    .status(500)
    .json({ success: false, error: err?.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`SMS API listening on http://localhost:${PORT}`);
});
