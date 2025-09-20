import React, { useState, useMemo, useEffect } from "react";
import { Page, Customer, ActivityLog, CustomerStatus } from "./types";
import Sidebar from "./components/Sidebar";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import FunnelPage from "./pages/FunnelPage";
import FeedbackPage from "./pages/FeedbackPage";
import QuickFeedbackPage from "./pages/QuickFeedbackPage";
// import { EnvelopeIcon } from "./components/icons";

// Mock Data
const initialCustomers: Customer[] = [
  {
    id: "cust-1",
    name: "John Doe",
    phone: "+1234567890",
    // email removed
    status: CustomerStatus.Reviewed,
    addedAt: new Date(2023, 10, 1),
    rating: 5,
    feedback: [],
  },
  {
    id: "cust-2",
    name: "Jane Smith",
    phone: "+1987654321",
    // email removed
    status: CustomerStatus.Clicked,
    addedAt: new Date(2023, 10, 2),
    feedback: [],
  },
  // ...add other customers as needed...
];

const App: React.FC = () => {
  // Add all your state and logic here
  const path = window.location.pathname.toLowerCase();
  const initialPage: Page =
    path === "/messenger" || path === "/settings" // accept old /settings for backward compatibility
      ? Page.Settings
      : path === "/feedback" || path === "/feeback"
      ? Page.Feedback
      : path === "/quick-feedback" || path === "/feeback"
      ? Page.QuickFeedback
      : Page.Dashboard;
  const [currentPage, setCurrentPage] = useState<Page>(initialPage);
  // Load customers from localStorage if available to preserve state across hard reloads
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const stored = localStorage.getItem("customers");
      if (stored) {
        const parsed: any[] = JSON.parse(stored);
        // Rehydrate date objects & fallback if structure changed
        return parsed.map((c) => ({
          ...c,
          addedAt: c.addedAt ? new Date(c.addedAt) : new Date(),
          feedback: (c.feedback || []).map((f: any) => ({
            ...f,
            date: f.date ? new Date(f.date) : new Date(),
          })),
        })) as Customer[];
      }
    } catch (e) {
      console.warn("Failed to parse customers from storage", e);
    }
    return initialCustomers;
  });
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [selectedFeedbackCustomer, setSelectedFeedbackCustomer] =
    useState<Customer | null>(null);
  const [selectedFeedbackType, setSelectedFeedbackType] = useState<
    "positive" | "negative" | null
  >(null);

  // Settings state used by SettingsPage
  const [messageTemplate, setMessageTemplate] = useState<string>(
    "Hey [Customer Name], we'd love to hear your feedback about [Business Name]. Please leave a review at [Review Link]."
  );
  // Email subject/content removed per requirement
  const [businessName] = useState<string>("Acme Inc.");
  const [googleReviewLink, setGoogleReviewLink] = useState<string>(
    "https://g.page/r/your-business-id/review"
  );
  const [twilioAccountSid, setTwilioAccountSid] = useState<string>("");
  const [twilioAuthToken, setTwilioAuthToken] = useState<string>("");
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState<string>("");

  // --- SMS sending helpers ---
  const formatTemplate = (template: string, name: string, phone: string) => {
    // Support both legacy [Placeholders] and new {{placeholders}}
    return (template || "")
      .replace(/\[Customer Name\]/g, name)
      .replace(/\[Business Name\]/g, businessName)
      .replace(/\[Review Link\]/g, googleReviewLink)
      .replace(/\[Phone\]/g, phone)
      .replace(/\{\{\s*name\s*\}\}/gi, name)
      .replace(/\{\{\s*business\s*\}\}/gi, businessName)
      .replace(/\{\{\s*review(_link)?\s*\}\}/gi, googleReviewLink)
      .replace(/\{\{\s*phone\s*\}\}/gi, phone);
  };

  const sendSmsToCustomer = async (customer: Customer) => {
    if (
      !twilioAccountSid ||
      !twilioAuthToken ||
      !twilioPhoneNumber ||
      !customer.phone
    ) {
      // Mark failed if we don't have credentials
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id ? { ...c, status: CustomerStatus.Failed } : c
        )
      );
      logActivity("SMS failed (missing credentials)", customer.name);
      return { ok: false, reason: "Missing Twilio credentials or phone" };
    }
    const body = formatTemplate(messageTemplate, customer.name, customer.phone);
    try {
      const res = await fetch("/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountSid: twilioAccountSid,
          authToken: twilioAuthToken,
          from: twilioPhoneNumber,
          to: customer.phone,
          body,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customer.id ? { ...c, status: CustomerStatus.Sent } : c
          )
        );
        logActivity("Sent SMS", customer.name);
        return { ok: true };
      } else {
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === customer.id ? { ...c, status: CustomerStatus.Failed } : c
          )
        );
        logActivity(`SMS failed (${data.code || "error"})`, customer.name);
        return { ok: false, reason: data.error };
      }
    } catch (e: any) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === customer.id ? { ...c, status: CustomerStatus.Failed } : c
        )
      );
      logActivity("SMS network error", customer.name);
      return { ok: false, reason: e?.message || "network" };
    }
  };

  // Simple queue to process SMS in batches of 10
  const [smsQueue, setSmsQueue] = useState<string[]>([]);
  const [queueActive, setQueueActive] = useState(false);

  const enqueueSmsCustomers = (ids: string[]) => {
    setSmsQueue((prev) => [...prev, ...ids]);
  };

  useEffect(() => {
    if (queueActive) return;
    if (smsQueue.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setQueueActive(true);
      try {
        while (!cancelled && smsQueue.length > 0) {
          // Take up to 10
          const chunk = smsQueue.slice(0, 10);
          setSmsQueue((prev) => prev.slice(chunk.length));
          for (const id of chunk) {
            const cust = customers.find((c) => c.id === id);
            if (!cust) continue;
            if (cust.status !== CustomerStatus.Pending) continue; // skip if not pending
            await sendSmsToCustomer(cust);
            // Small pause to avoid hitting limits too fast
            await new Promise((r) => setTimeout(r, 150));
          }
          // Yield between chunks
          await new Promise((r) => setTimeout(r, 500));
        }
      } finally {
        setQueueActive(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    smsQueue,
    queueActive,
    customers,
    twilioAccountSid,
    twilioAuthToken,
    twilioPhoneNumber,
    messageTemplate,
    businessName,
    googleReviewLink,
  ]);

  // Persist customers whenever they change (debounced by microtask naturally)
  useEffect(() => {
    try {
      localStorage.setItem(
        "customers",
        JSON.stringify(
          customers.map((c) => ({
            ...c,
            // Ensure Dates serialized
            addedAt: c.addedAt?.toISOString?.() || c.addedAt,
            feedback: (c.feedback || []).map((f) => ({
              ...f,
              date: f.date?.toISOString?.() || f.date,
            })),
          }))
        )
      );
    } catch (e) {
      console.warn("Failed to persist customers", e);
    }
  }, [customers]);

  // Simple activity log helper
  const logActivity = (action: string, customerName: string) => {
    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      customerName,
      action,
      timestamp: new Date(),
    };
    setActivityLogs((prev) => [newLog, ...prev]);
  };

  // Minimal plan info used by PlanStatus
  const plan = useMemo(
    () => ({
      name: "Growth Plan",
      messageLimit: 500,
      renewalDate: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        15
      ),
    }),
    []
  );

  const messagesSentThisMonth = useMemo(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return activityLogs.filter(
      (log) =>
        (log.action.toLowerCase().includes("sent review request") ||
          log.action.toLowerCase().includes("sent sms") ||
          log.action.toLowerCase().includes("resend sms")) &&
        log.timestamp >= firstDay
    ).length;
  }, [activityLogs]);

  // Handlers expected by DashboardPage
  const handleAddCustomer = (name: string, phone: string) => {
    const newCustomer: Customer = {
      id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      phone,
      status: CustomerStatus.Pending,
      addedAt: new Date(),
    };
    setCustomers((prev) => [newCustomer, ...prev]);
    logActivity("Added to customer list", newCustomer.name);
    // Auto-send immediately for manual add
    enqueueSmsCustomers([newCustomer.id]);
    return newCustomer.id;
  };

  const handleSendMessage = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;
    // Queue a real send
    enqueueSmsCustomers([customerId]);
  };

  const handleDeleteCustomer = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;
    setCustomers((prev) => prev.filter((c) => c.id !== customerId));
    logActivity("Deleted customer", cust.name);
  };

  const handleBulkAddCustomers = (
    customersData: Omit<Customer, "id" | "status" | "addedAt" | "rating">[]
  ) => {
    const addedCustomers: Customer[] = customersData.map((d) => ({
      id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: d.name,
      phone: d.phone,
      status: CustomerStatus.Pending,
      addedAt: new Date(),
    }));
    setCustomers((prev) => [...addedCustomers, ...prev]);
    addedCustomers.forEach((c) => logActivity("Bulk uploaded", c.name));
    // Queue sending in batches of 10
    enqueueSmsCustomers(addedCustomers.map((c) => c.id));
    return { added: addedCustomers.length, duplicates: 0, invalid: 0 };
  };
  // Email send simulation removed

  const handleOpenFunnel = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId ? { ...c, status: CustomerStatus.Clicked } : c
      )
    );
    logActivity("Clicked review link (simulation)", cust.name);
  };

  // Example navigation handler for feedback
  const handleOpenFeedback = (
    customerId: string,
    feedbackType: "positive" | "negative"
  ) => {
    const customer = customers.find((c) => c.id === customerId) || null;
    setSelectedFeedbackCustomer(customer);
    setSelectedFeedbackType(feedbackType);
    setCurrentPage(Page.Feedback);
  };

  // Allow dashboard summary cards to open feedback without a specific customer
  React.useEffect(() => {
    (window as any).openFeedbackFromDashboard = (
      type: "positive" | "negative"
    ) => {
      setSelectedFeedbackCustomer(null);
      setSelectedFeedbackType(type);
      setCurrentPage(Page.Feedback);
    };
    return () => {
      try {
        delete (window as any).openFeedbackFromDashboard;
      } catch (e) {
        (window as any).openFeedbackFromDashboard = undefined;
      }
    };
  }, []);

  // Add a feedback entry for a customer (in-memory)
  const addFeedback = (
    _customerId: string,
    _text: string,
    _sentiment: "positive" | "negative",
    _phone?: string
  ) => {
    // No-op: feedback storage is disabled per requirement
    return;
  };

  // Exposed handler for dashboard rows: accept free-text feedback and auto-classify sentiment
  const onAddFeedback = (customerId: string, text: string) => {
    if (!text || !text.trim()) return;
    const lower = text.toLowerCase();
    // Very simple heuristic: words that usually indicate positive
    const positiveWords = [
      "good",
      "great",
      "excellent",
      "love",
      "loved",
      "amazing",
      "nice",
      "fast",
      "friendly",
      "recommended",
      "recommend",
    ];
    const negativeWords = [
      "bad",
      "poor",
      "late",
      "slow",
      "rude",
      "problem",
      "issue",
      "not",
      "disappointed",
      "hate",
    ];

    let sentiment: "positive" | "negative" = "negative";
    if (positiveWords.some((w) => lower.includes(w))) sentiment = "positive";
    else if (negativeWords.some((w) => lower.includes(w)))
      sentiment = "negative";
    else sentiment = lower.length > 60 ? "positive" : "negative"; // fallback heuristic

    addFeedback(customerId, text.trim(), sentiment);
  };

  // --- Client-side navigation & history management ---
  const mapPathToPage = (path: string): Page => {
    const p = path.toLowerCase();
    if (p === "/messenger" || p === "/settings") return Page.Settings; // new canonical /messenger
    if (p === "/feedback" || p === "/feeback") return Page.Feedback; // alias support
    if (p === "/quick-feedback" || p === "/feeback-quick")
      return Page.QuickFeedback; // legacy alias
    return Page.Dashboard;
  };

  const pageToPath = (page: Page): string => {
    switch (page) {
      case Page.Settings:
        return "/messenger"; // new canonical path
      case Page.Feedback:
        return "/feedback"; // canonical
      case Page.QuickFeedback:
        return "/quick-feedback";
      default:
        return "/";
    }
  };

  const navigate = (page: Page) => {
    const targetPath = pageToPath(page);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ page: targetPath }, "", targetPath);
    }
    setCurrentPage(page);
  };

  // Listen for browser back/forward
  useEffect(() => {
    const onPop = () => {
      const newPage = mapPathToPage(window.location.pathname);
      setCurrentPage(newPage);
      // Reset contextual selections when leaving feedback
      if (newPage !== Page.Feedback) {
        setSelectedFeedbackCustomer(null);
        setSelectedFeedbackType(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Wrap existing handlers that set pages so they also push history
  useEffect(() => {
    (window as any).openFeedbackFromDashboard = (
      type: "positive" | "negative"
    ) => {
      setSelectedFeedbackCustomer(null);
      setSelectedFeedbackType(type);
      navigate(Page.Feedback);
    };
    return () => {
      try {
        delete (window as any).openFeedbackFromDashboard;
      } catch (e) {
        (window as any).openFeedbackFromDashboard = undefined;
      }
    };
  }, [navigate]);

  const hideSidebar = currentPage === Page.Feedback; // hide only on feedback page per requirement
  return (
    <div
      className={`flex h-screen bg-gray-50 font-sans text-gray-800 ${
        hideSidebar ? "pl-0" : ""
      }`}
    >
      {!hideSidebar && (
        <Sidebar
          currentPage={currentPage}
          setCurrentPage={(p) => {
            // Reset feedback-specific selections when navigating away
            if (p !== Page.Feedback) {
              setSelectedFeedbackCustomer(null);
              setSelectedFeedbackType(null);
            }
            navigate(p);
          }}
        />
      )}
      <main className={`flex-1 overflow-y-auto ${hideSidebar ? "w-full" : ""}`}>
        {currentPage === Page.Dashboard && (
          <DashboardPage
            customers={customers}
            activityLogs={activityLogs}
            plan={plan}
            messagesSentThisMonth={messagesSentThisMonth}
            onAddCustomer={handleAddCustomer}
            onSendMessage={handleSendMessage}
            onDeleteCustomer={handleDeleteCustomer}
            onBulkAddCustomers={handleBulkAddCustomers}
            onOpenFunnel={handleOpenFunnel}
            onOpenFeedback={handleOpenFeedback}
            onAddFeedback={onAddFeedback}
          />
        )}
        {currentPage === Page.Settings && (
          <SettingsPage
            customers={customers}
            messageTemplate={messageTemplate}
            setMessageTemplate={setMessageTemplate}
            businessName={businessName}
            googleReviewLink={googleReviewLink}
            setGoogleReviewLink={setGoogleReviewLink}
            twilioAccountSid={twilioAccountSid}
            setTwilioAccountSid={setTwilioAccountSid}
            twilioAuthToken={twilioAuthToken}
            setTwilioAuthToken={setTwilioAuthToken}
            twilioPhoneNumber={twilioPhoneNumber}
            setTwilioPhoneNumber={setTwilioPhoneNumber}
          />
        )}
        {currentPage === Page.Feedback && (
          <FeedbackPage
            customers={customers}
            customer={selectedFeedbackCustomer}
            feedbackType={selectedFeedbackType}
            addFeedback={addFeedback}
            googleReviewLink={googleReviewLink}
            addCustomer={handleAddCustomer}
            onBack={() => {
              setSelectedFeedbackCustomer(null);
              setSelectedFeedbackType(null);
              navigate(Page.Dashboard);
            }}
          />
        )}
        {currentPage === Page.QuickFeedback && (
          <QuickFeedbackPage
            customers={customers}
            onAddCustomer={handleAddCustomer}
            onAddFeedback={onAddFeedback}
          />
        )}
      </main>
    </div>
  );
};

export default App;
