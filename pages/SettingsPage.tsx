import React, { useState, useMemo } from "react";
import { LinkIcon, ExclamationTriangleIcon } from "../components/icons";

import { Customer } from "../types";

// Central API base resolution (env override -> localhost dev -> hosted fallback)
let API_BASE: string = (import.meta as any).env?.VITE_SMS_API_BASE || "";
if (!API_BASE) {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    API_BASE = "http://localhost:3002";
  } else {
    API_BASE = "https://api-sms-server.onrender.com";
  }
}

interface SettingsPageProps {
  customers: Customer[];
  messageTemplate: string;
  setMessageTemplate: (template: string) => void;
  businessName: string;
  googleReviewLink: string;
  setGoogleReviewLink: (link: string) => void;
  twilioAccountSid: string;
  setTwilioAccountSid: (sid: string) => void;
  twilioAuthToken: string;
  setTwilioAuthToken: (token: string) => void;
  twilioPhoneNumber: string;
  setTwilioPhoneNumber: (phone: string) => void;
  onMarkCustomerSent?: (customerId: string, context?: string) => void;
  onMarkCustomerFailed?: (customerId: string, reason?: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  customers,
  messageTemplate,
  setMessageTemplate,
  businessName,
  googleReviewLink,
  setGoogleReviewLink,
  twilioAccountSid,
  setTwilioAccountSid,
  twilioAuthToken,
  setTwilioAuthToken,
  twilioPhoneNumber,
  setTwilioPhoneNumber,
  onMarkCustomerSent,
  onMarkCustomerFailed,
}) => {
  // Helper to personalize strings with placeholders used in both preview and send flows
  const personalize = (
    template: string,
    customer: Customer | null,
    opts?: { fallbackName?: string }
  ) => {
    if (!template) return template;
    const name = customer?.name || opts?.fallbackName || "Customer";
    const phone = customer?.phone || "";
    return template
      .replace(/\[Customer Name\]/g, name)
      .replace(/\[Business Name\]/g, businessName)
      .replace(
        /\[Review Link\]/g,
        googleReviewLink || "https://yourapp.com/funnel/xyz123"
      )
      .replace(/\[Phone\]/g, phone)
      .replace(/\{\{\s*name\s*\}\}/gi, name)
      .replace(/\{\{\s*business\s*\}\}/gi, businessName)
      .replace(/\{\{\s*review(_link)?\s*\}\}/gi, googleReviewLink)
      .replace(/\{\{\s*phone\s*\}\}/gi, phone);
  };
  const [localSmsTemplate, setLocalSmsTemplate] = useState(messageTemplate);
  const [localGoogleLink, setLocalGoogleLink] = useState(googleReviewLink);
  const [localTwilioSid, setLocalTwilioSid] = useState(twilioAccountSid);
  const [localTwilioToken, setLocalTwilioToken] = useState(twilioAuthToken);
  const [localTwilioPhone, setLocalTwilioPhone] = useState(twilioPhoneNumber);
  // Meta (WhatsApp Cloud API) credentials (kept local for now)
  const [waAccessToken, setWaAccessToken] = useState(
    localStorage.getItem("waAccessToken") || ""
  );
  const [waPhoneNumberId, setWaPhoneNumberId] = useState(
    localStorage.getItem("waPhoneNumberId") || ""
  );
  const [showSuccess, setShowSuccess] = useState(false);
  // Multi-recipient selection
  const [selectedRecipients, setSelectedRecipients] = useState<Customer[]>([]);
  const [showRecipientSearch, setShowRecipientSearch] = useState(true);
  const [smsSearch, setSmsSearch] = useState("");
  const [smsSendStatus, setSmsSendStatus] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [waSendStatus, setWaSendStatus] = useState("");
  const [waSending, setWaSending] = useState(false);
  const [waVerifyStatus, setWaVerifyStatus] = useState<string>("");
  const [waContactStatus, setWaContactStatus] = useState<string>("");
  const [waDebug, setWaDebug] = useState<boolean>(false);
  // Simple template sending (name + language only)
  const [waTemplateName, setWaTemplateName] = useState<string>("");
  const [waTemplateLang, setWaTemplateLang] = useState<string>("en_US");
  const [waTemplateStatus, setWaTemplateStatus] = useState<string>("");

  const handleSave = () => {
    setMessageTemplate(localSmsTemplate);
    setGoogleReviewLink(localGoogleLink);
    setTwilioAccountSid(localTwilioSid);
    setTwilioAuthToken(localTwilioToken);
    setTwilioPhoneNumber(localTwilioPhone);
    // Persist Meta WA creds locally (not in props to keep scope limited)
    if (waAccessToken) localStorage.setItem("waAccessToken", waAccessToken);
    if (waPhoneNumberId)
      localStorage.setItem("waPhoneNumberId", waPhoneNumberId);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  // Representative customer for preview (first selected)
  const selectedCustomer = selectedRecipients[0] || null;
  const dynamicPreviewName = selectedCustomer?.name || "Jane Doe";
  const dynamicPreviewLink =
    googleReviewLink || "https://yourapp.com/funnel/xyz123";

  const previewSmsMessage = useMemo(() => {
    return personalize(localSmsTemplate, selectedCustomer, {
      fallbackName: "Jane Doe",
    });
  }, [localSmsTemplate, selectedCustomer]);

  // Helper component (inside to keep file localized)
  const SmsLengthInfo: React.FC<{ personalizedSample: string }> = ({
    personalizedSample,
  }) => {
    const GSM_BASIC =
      /[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæÉ!"#¤%&'()*+,\-./0-9:;<=>\?A-ZÄÖÑÜ§¿a-zäöñüà \^{}\\\[~\]|€]*$/;
    const isGsm = GSM_BASIC.test(personalizedSample);
    const length = personalizedSample.length;
    const singleLimit = isGsm ? 160 : 70;
    const multiLimit = isGsm ? 153 : 67;
    const segments = length > singleLimit ? Math.ceil(length / multiLimit) : 1;
    return (
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
        <span>Length: {length}</span>
        <span>Encoding: {isGsm ? "GSM-7" : "Unicode"}</span>
        <span>Segments: {segments}</span>
        {segments > 1 && (
          <span className="text-orange-600">
            (Concatenated SMS increases cost)
          </span>
        )}
      </div>
    );
  };

  const buildPersonalizedMessage = (customer: Customer) => {
    const base = localSmsTemplate
      .replace(/\[Customer Name\]/g, customer.name || "Customer")
      .replace(/\[Business Name\]/g, businessName)
      .replace(/\[Review Link\]/g, googleReviewLink || dynamicPreviewLink)
      .replace(/\[Phone\]/g, customer.phone || "");
    return base
      .replace(/\{\{\s*name\s*\}\}/gi, customer.name || "Customer")
      .replace(/\{\{\s*business\s*\}\}/gi, businessName)
      .replace(
        /\{\{\s*review(_link)?\s*\}\}/gi,
        googleReviewLink || dynamicPreviewLink
      )
      .replace(/\{\{\s*phone\s*\}\}/gi, customer.phone || "");
  };

  const handleSendSms = async () => {
    setSmsSendStatus("");
    if (
      !localTwilioSid ||
      !localTwilioToken ||
      !localTwilioPhone ||
      selectedRecipients.length === 0 ||
      !localSmsTemplate
    ) {
      setSmsSendStatus(
        "Please fill all Twilio fields, select at least one recipient, and enter a message."
      );
      return;
    }
    try {
      setSmsSending(true);
      const endpoint = `${API_BASE}/send-sms`;
      const total = selectedRecipients.length;
      let success = 0;
      const failures: {
        name: string;
        phone: string;
        error: string;
        code?: any;
      }[] = [];
      for (let i = 0; i < selectedRecipients.length; i++) {
        const cust = selectedRecipients[i];
        const personalized = buildPersonalizedMessage(cust);
        setSmsSendStatus(
          `Sending ${i + 1}/${total} → ${cust.name} (${cust.phone})...`
        );
        try {
          let res: Response | null = null;
          const payload = {
            accountSid: localTwilioSid,
            authToken: localTwilioToken,
            from: localTwilioPhone,
            to: cust.phone,
            body: personalized,
          };
          res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          let data: any = null;
          let rawText = "";
          try {
            data = await res!.json();
          } catch {
            try {
              rawText = await res!.text();
            } catch {}
          }
          if (!res.ok) {
            const errMsg = data?.error || rawText || `HTTP ${res.status}`;
            failures.push({
              name: cust.name,
              phone: cust.phone,
              error: errMsg,
              code: data?.code,
            });
            onMarkCustomerFailed?.(cust.id, errMsg);
          } else if (data && data.success) {
            success++;
            onMarkCustomerSent?.(cust.id, "settings");
          } else {
            const errMsg = data.hint
              ? `${data.error} — ${data.hint}`
              : data.error || "Unknown error";
            failures.push({
              name: cust.name,
              phone: cust.phone,
              error: errMsg,
              code: data.code,
            });
            onMarkCustomerFailed?.(cust.id, errMsg);
          }
        } catch (err: any) {
          const rawMsg = err?.message || "Network error";
          let guidance = rawMsg;
          if (
            rawMsg.includes("Failed to fetch") ||
            rawMsg === "Network error"
          ) {
            guidance =
              "Failed to reach SMS API. Check: (1) Server running and reachable at /send-sms, (2) Vite dev proxy configured to backend, (3) Correct port (default 3002), (4) No firewall/ad-block.";
          }
          failures.push({
            name: cust.name,
            phone: cust.phone,
            error: guidance,
          });
          onMarkCustomerFailed?.(cust.id, guidance);
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (failures.length === 0)
        setSmsSendStatus(`All ${success} SMS sent successfully.`);
      else {
        const code21608 = failures.filter((f) => f.code === 21608);
        if (code21608.length === failures.length && failures.length > 0) {
          setSmsSendStatus(
            `Sent ${success}/${total}. ${failures.length} failed because numbers are not verified for a Twilio trial. Verify them or upgrade to remove this restriction.`
          );
        } else {
          setSmsSendStatus(
            `Sent ${success}/${total}. Failed: ${failures.length}. First error: ${failures[0].name} - ${failures[0].error}`
          );
        }
      }
    } catch (err: any) {
      setSmsSendStatus("Error sending SMS: " + err.message);
    } finally {
      setSmsSending(false);
    }
  };

  // New: Send WhatsApp via Meta Cloud API (text only for now)
  const handleSendMetaWhatsapp = async () => {
    setWaSendStatus("");
    if (
      !waAccessToken ||
      !waPhoneNumberId ||
      selectedRecipients.length === 0 ||
      !localSmsTemplate
    ) {
      setWaSendStatus(
        "Enter WhatsApp Access Token, Phone Number ID, select recipients, and enter a message."
      );
      return;
    }
    try {
      setWaSending(true);
      const endpoint = `${API_BASE}/send-whatsapp`;
      const total = selectedRecipients.length;
      let success = 0;
      const failures: { name: string; phone: string; error: string }[] = [];
      for (let i = 0; i < selectedRecipients.length; i++) {
        const cust = selectedRecipients[i];
        const personalized = buildPersonalizedMessage(cust);
        setWaSendStatus(
          `Sending ${i + 1}/${total} → ${cust.name} (${cust.phone})...`
        );
        try {
          const payload = {
            accessToken: waAccessToken,
            phoneNumberId: waPhoneNumberId,
            to: cust.phone,
            body: personalized,
            ...(waDebug ? { debug: true } : {}),
          };
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) {
            const errMsg = data?.error || `HTTP ${res.status}`;
            failures.push({
              name: cust.name,
              phone: cust.phone,
              error: errMsg,
            });
            onMarkCustomerFailed?.(cust.id, errMsg);
          } else {
            success++;
            onMarkCustomerSent?.(cust.id, "wa-meta");
          }
        } catch (e: any) {
          const errMsg = e?.message || "Network error";
          failures.push({ name: cust.name, phone: cust.phone, error: errMsg });
          onMarkCustomerFailed?.(cust.id, errMsg);
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (failures.length === 0)
        setWaSendStatus(
          `All ${success} WhatsApp messages sent successfully via Meta. (Note: 'success' = accepted by API, not guaranteed delivered. Use a template if user hasn't replied in 24h.)`
        );
      else
        setWaSendStatus(
          `Sent ${success}/${total}. Failed: ${failures.length}. First error: ${failures[0].name} - ${failures[0].error}`
        );
    } catch (err: any) {
      setWaSendStatus("Error sending WhatsApp (Meta): " + err.message);
    } finally {
      setWaSending(false);
    }
  };

  const handleVerifyWaConfig = async () => {
    setWaVerifyStatus("");
    if (!waAccessToken || !waPhoneNumberId) {
      setWaVerifyStatus("Enter Access Token and Phone Number ID first.");
      return;
    }
    try {
      const url = `${API_BASE}/wa-verify?accessToken=${encodeURIComponent(
        waAccessToken
      )}&phoneNumberId=${encodeURIComponent(waPhoneNumberId)}${
        waDebug ? "&debug=1" : ""
      }`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setWaVerifyStatus(
          `Verify failed: ${data.error || resp.status}. ${data.hint || ""}`
        );
      } else {
        setWaVerifyStatus(
          `Verified: ${data.info?.display_phone_number || waPhoneNumberId} (${
            data.info?.verified_name || "unverified name"
          })`
        );
      }
    } catch (e: any) {
      setWaVerifyStatus(`Verify error: ${e.message}`);
    }
  };

  const handleCheckWaContact = async () => {
    setWaContactStatus("");
    if (!waAccessToken || !waPhoneNumberId || selectedRecipients.length === 0) {
      setWaContactStatus(
        "Provide Access Token, Phone Number ID, and select at least one recipient."
      );
      return;
    }
    const cust = selectedRecipients[0];
    try {
      const resp = await fetch(`${API_BASE}/wa-check-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: waAccessToken,
          phoneNumberId: waPhoneNumberId,
          to: cust.phone,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        setWaContactStatus(
          `Contact check failed: ${data.error || resp.status}. ${
            data.hint || ""
          }`
        );
      } else {
        const c = data.result?.contacts?.[0];
        if (c?.status === "valid") {
          setWaContactStatus(
            `WhatsApp contact valid (wa_id=${c.wa_id || "n/a"}).`
          );
        } else {
          setWaContactStatus(
            `Not valid / not opted-in. Status=${c?.status || "unknown"}`
          );
        }
      }
    } catch (e: any) {
      setWaContactStatus(`Contact check error: ${e.message}`);
    }
  };

  const handleSendWaTemplate = async () => {
    setWaTemplateStatus("");
    if (
      !waAccessToken ||
      !waPhoneNumberId ||
      selectedRecipients.length === 0 ||
      !waTemplateName ||
      !waTemplateLang
    ) {
      setWaTemplateStatus(
        "Enter token, phone number ID, select recipients, template name & language."
      );
      return;
    }
    try {
      const total = selectedRecipients.length;
      let success = 0;
      const failures: { name: string; phone: string; error: string }[] = [];
      for (let i = 0; i < selectedRecipients.length; i++) {
        const cust = selectedRecipients[i];
        setWaTemplateStatus(
          `Sending template ${i + 1}/${total} → ${cust.name} (${cust.phone})...`
        );
        try {
          const payload = {
            accessToken: waAccessToken,
            phoneNumberId: waPhoneNumberId,
            to: cust.phone,
            template: {
              name: waTemplateName,
              languageCode: waTemplateLang,
            },
            ...(waDebug ? { debug: true } : {}),
          };
          const resp = await fetch(`${API_BASE}/send-whatsapp-template`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || !data.success) {
            const errMsg = data.error || resp.status;
            failures.push({
              name: cust.name,
              phone: cust.phone,
              error: String(errMsg),
            });
            onMarkCustomerFailed?.(cust.id, String(errMsg));
          } else {
            success++;
            onMarkCustomerSent?.(cust.id, "wa-template");
          }
        } catch (e: any) {
          failures.push({
            name: cust.name,
            phone: cust.phone,
            error: e.message || "Error",
          });
          onMarkCustomerFailed?.(cust.id, e.message || "Error");
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (failures.length === 0) {
        setWaTemplateStatus(
          `All ${success} template messages accepted by API.`
        );
      } else {
        setWaTemplateStatus(
          `Sent ${success}/${total}. Failed: ${failures.length}. First error: ${failures[0].name} - ${failures[0].error}`
        );
      }
    } catch (e: any) {
      setWaTemplateStatus(`Template send error: ${e.message}`);
    }
  };

  return (
    <div className="p-6 lg:p-10">
      <h2 className="text-3xl font-bold text-gray-800 tracking-tight mb-2">
        Settings
      </h2>
      <p className="text-gray-500 mb-8">
        Customize messages and configure the review funnel.
      </p>

      {/* Message Template Editor */}
      <div className="bg-white p-8 rounded-lg border border-gray-200 mb-8">
        <div className="max-w-2xl">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            Message Template
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Choose a predefined template and edit it. You can use placeholders
            like{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">
              {"{{name}}"}
            </code>
            ,{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">
              {"{{business}}"}
            </code>
            ,{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">
              {"{{review_link}}"}
            </code>
            ,{" "}
            <code className="px-1 py-0.5 bg-gray-100 rounded">
              {"{{phone}}"}
            </code>
            .
          </p>
          <div className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Predefined Templates
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
                onChange={(e) => {
                  const v = e.target.value;
                  let tmpl = localSmsTemplate;
                  if (v === "thank-you")
                    tmpl =
                      "Hi {{name}}, thanks for visiting {{business}}. Please share your feedback! {{review_link}}";
                  else if (v === "review-request")
                    tmpl =
                      "Hello {{name}}, this is {{business}}. Could you leave us a quick review? {{review_link}}";
                  else if (v === "post-service")
                    tmpl =
                      "Hi {{name}}, your experience matters to {{business}}. Share your thoughts: {{review_link}}";
                  else if (v === "friendly-reminder")
                    tmpl =
                      "Hey {{name}} — friendly nudge from {{business}} to drop a review when you can: {{review_link}}";
                  setLocalSmsTemplate(tmpl);
                }}
                defaultValue="custom"
              >
                <option value="custom">Custom (edit below)</option>
                <option value="thank-you">Thank You + Feedback</option>
                <option value="review-request">Simple Review Request</option>
                <option value="post-service">Post-Service Feedback</option>
                <option value="friendly-reminder">Friendly Reminder</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Template Text
              </label>
              <textarea
                rows={4}
                value={localSmsTemplate}
                onChange={(e) => setLocalSmsTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
                placeholder="Hi {{name}}, thanks for visiting {{business}}. Please share your feedback! {{review_link}}"
              />
              <p className="mt-2 text-xs text-gray-500">
                Legacy placeholders like [Customer Name] and [Business Name] are
                npm run dev also supported.
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
              <div className="text-xs font-semibold text-gray-600 mb-1">
                Live Preview
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-line">
                {previewSmsMessage}
              </div>
              <SmsLengthInfo personalizedSample={previewSmsMessage} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg border border-gray-200 mb-8">
        <div className="max-w-2xl">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            Messaging Configuration (SMS via Twilio & WhatsApp via Meta)
          </h3>
          <p className="text-sm text-gray-500 mb-4 space-y-1">
            <span className="block">Configure outgoing channels:</span>
            <span className="block">• SMS uses your Twilio credentials.</span>
            <span className="block">
              • WhatsApp now uses Meta's Cloud API (no Twilio for WhatsApp).
            </span>
            <span className="block text-xs text-orange-600">
              Note: Free-form WhatsApp text can only be sent within 24h of the
              user's last reply. For outside the 24h window you must use an
              approved template (add later).
            </span>
          </p>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Recipients
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs px-3 py-1 rounded bg-primary-50 text-primary-700 font-semibold hover:bg-primary-100 border border-primary-200"
                    onClick={() => {
                      setSelectedRecipients(customers);
                      setShowRecipientSearch(false);
                    }}
                    disabled={selectedRecipients.length === customers.length}
                  >
                    Select All
                  </button>
                  {selectedRecipients.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedRecipients([])}
                      className="text-xs px-3 py-1 rounded bg-red-50 text-red-700 font-semibold hover:bg-red-100 border border-red-200"
                    >
                      Clear All
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedRecipients.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center bg-primary-100 text-primary-800 px-2 py-1 rounded-full text-xs"
                  >
                    {r.name}
                    <button
                      type="button"
                      className="ml-1 text-primary-600 hover:text-primary-800"
                      onClick={() =>
                        setSelectedRecipients((prev) =>
                          prev.filter((c) => c.id !== r.id)
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedRecipients.length === 0 && (
                  <span className="text-xs text-gray-500">
                    No recipients selected.
                  </span>
                )}
              </div>
              {showRecipientSearch && (
                <>
                  <input
                    type="text"
                    value={smsSearch}
                    onChange={(e) => setSmsSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2"
                    placeholder="Search by name or phone..."
                  />
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md bg-white">
                    {customers
                      .filter((c) => {
                        const q = smsSearch.toLowerCase();
                        return (
                          c.name.toLowerCase().includes(q) ||
                          c.phone.includes(smsSearch)
                        );
                      })
                      .slice(0, 50)
                      .map((c) => {
                        const already = selectedRecipients.some(
                          (s) => s.id === c.id
                        );
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={already}
                            className={`w-full text-left px-3 py-2 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed ${
                              already ? "bg-gray-50" : ""
                            }`}
                            onClick={() => {
                              setSelectedRecipients((prev) => {
                                const next = [...prev, c];
                                if (prev.length === 0)
                                  setShowRecipientSearch(false);
                                return next;
                              });
                              setSmsSearch("");
                            }}
                          >
                            <span className="font-semibold text-gray-900">
                              {c.name}
                            </span>
                            <span className="ml-2 text-xs text-gray-500">
                              {c.phone}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button
                  type="button"
                  onClick={() => setShowRecipientSearch((v) => !v)}
                  className="text-xs text-primary-600 hover:underline"
                >
                  {showRecipientSearch
                    ? "Hide search"
                    : selectedRecipients.length === 0
                    ? "Select recipients"
                    : "Add more recipients"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={smsSending}
                  onClick={handleSendSms}
                  className={`px-4 py-2 rounded-md font-semibold mt-2 text-white ${
                    smsSending
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-primary-600 hover:bg-primary-700"
                  }`}
                >
                  {smsSending
                    ? "Sending..."
                    : selectedRecipients.length > 1
                    ? `Send ${selectedRecipients.length} SMS`
                    : "Send SMS"}
                </button>
                <button
                  type="button"
                  disabled={waSending}
                  onClick={handleSendMetaWhatsapp}
                  className={`px-4 py-2 rounded-md font-semibold mt-2 text-white ${
                    waSending
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {waSending
                    ? "Sending..."
                    : selectedRecipients.length > 1
                    ? `Send ${selectedRecipients.length} WhatsApp`
                    : "Send WhatsApp"}
                </button>
                <button
                  type="button"
                  onClick={handleSendWaTemplate}
                  className="px-4 py-2 rounded-md font-semibold mt-2 text-white bg-emerald-600 hover:bg-emerald-700"
                  disabled={waSending}
                >
                  {selectedRecipients.length > 1
                    ? `Send ${selectedRecipients.length} Template`
                    : "Send Template"}
                </button>
              </div>
              {smsSendStatus && (
                <p className="text-sm text-gray-700">{smsSendStatus}</p>
              )}
              {waSendStatus && (
                <p className="text-sm text-gray-700">{waSendStatus}</p>
              )}
              {waTemplateStatus && (
                <p className="text-sm text-gray-700">{waTemplateStatus}</p>
              )}
            </div>

            {/* Twilio credentials */}
            <div>
              <label
                htmlFor="twilio-sid"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Account SID
              </label>
              <input
                id="twilio-sid"
                type="text"
                value={localTwilioSid}
                onChange={(e) => setLocalTwilioSid(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
            <div>
              <label
                htmlFor="twilio-token"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Auth Token
              </label>
              <input
                id="twilio-token"
                type="password"
                value={localTwilioToken}
                onChange={(e) => setLocalTwilioToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
                placeholder="••••••••••••••••••••••••••••"
              />
            </div>
            <div>
              <label
                htmlFor="twilio-phone"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Twilio Phone Number (SMS)
              </label>
              <input
                id="twilio-phone"
                type="tel"
                value={localTwilioPhone}
                onChange={(e) => setLocalTwilioPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
                placeholder="+15551234567"
              />
            </div>
            {/* Meta WhatsApp Credentials */}
            <div className="pt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                WhatsApp (Meta Cloud API)
              </h4>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Access Token
              </label>
              <input
                type="password"
                value={waAccessToken}
                onChange={(e) => setWaAccessToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900 mb-3"
                placeholder="EAAG... (System User token)"
              />
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number ID
              </label>
              <input
                type="text"
                value={waPhoneNumberId}
                onChange={(e) => setWaPhoneNumberId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
                placeholder="123456789012345"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in Meta Business Manager &gt; WhatsApp &gt; Getting
                Started.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Template Name (optional)
                  </label>
                  <input
                    type="text"
                    value={waTemplateName}
                    onChange={(e) => setWaTemplateName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="review_request"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Template Language
                  </label>
                  <input
                    type="text"
                    value={waTemplateLang}
                    onChange={(e) => setWaTemplateLang(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    placeholder="en_US"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 items-center">
                <button
                  type="button"
                  onClick={handleVerifyWaConfig}
                  className="px-3 py-1.5 text-xs rounded bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 border border-blue-200"
                >
                  Verify Config
                </button>
                <button
                  type="button"
                  onClick={handleCheckWaContact}
                  className="px-3 py-1.5 text-xs rounded bg-indigo-50 text-indigo-700 font-semibold hover:bg-indigo-100 border border-indigo-200"
                  disabled={selectedRecipients.length === 0}
                >
                  Check First Recipient
                </button>
                <label className="flex items-center gap-1 text-xs text-gray-600 select-none">
                  <input
                    type="checkbox"
                    checked={waDebug}
                    onChange={(e) => setWaDebug(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Debug
                </label>
              </div>
              {waVerifyStatus && (
                <p className="mt-2 text-xs text-gray-700">{waVerifyStatus}</p>
              )}
              {waContactStatus && (
                <p className="mt-1 text-xs text-gray-700">{waContactStatus}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg border border-gray-200 mb-8">
        <div className="max-w-2xl">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            Google Review Link
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Enter the direct link to your Google Business review page. Customers
            who rate 4 or 5 stars will be sent here.
          </p>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <LinkIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="url"
              value={localGoogleLink}
              onChange={(e) => setLocalGoogleLink(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
              placeholder="https://g.page/r/your-business-id/review"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end items-center">
        {showSuccess && (
          <p className="text-sm text-green-600 mr-4 transition-opacity duration-300">
            Changes saved successfully!
          </p>
        )}
        <button
          onClick={handleSave}
          className="px-5 py-2.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 font-semibold transition-colors"
        >
          Save All Changes
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
