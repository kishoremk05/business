import React, { useMemo, useState } from "react";
import { Customer } from "../types";

interface FeedbackPageProps {
  customers: Customer[];
  customer: Customer | null;
  feedbackType: "positive" | "negative" | null;
  addFeedback: (
    customerId: string,
    text: string,
    sentiment: "positive" | "negative",
    phone?: string,
    rating?: number
  ) => void;
  googleReviewLink: string;
  addCustomer?: (name: string, phone: string) => string | void; // optional for auto-create
  onBack?: () => void; // optional back handler when viewing filtered feedback
}

const FeedbackPage: React.FC<FeedbackPageProps> = ({
  customers,
  customer,
  feedbackType,
  addFeedback,
  googleReviewLink,
  addCustomer,
  onBack,
}) => {
  const [newFeedbackText, setNewFeedbackText] = useState("");

  // New public form state (star-only flow)
  const [rating, setRating] = useState<number | null>(null); // 1-5 stars
  const [negReasons, setNegReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  // New state for negative feedback name/email
  const [negName, setNegName] = useState("");
  const [negEmail, setNegEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Build entries for admin view when a sentiment filter is active
  type Entry = {
    id: string;
    text: string;
    sentiment: "positive" | "negative";
    date: Date | string;
    phone?: string;
    name: string;
    customerId: string;
  };

  const entries: Entry[] = useMemo(() => {
    return customers.flatMap((c) =>
      (c.feedback || []).map((f) => ({
        id: f.id,
        text: f.text,
        sentiment: f.sentiment,
        date: f.date,
        phone: c.phone,
        name: c.name,
        customerId: c.id,
      }))
    );
  }, [customers]);

  const filtered = useMemo(() => {
    if (!feedbackType) return entries;
    return entries.filter((e) => e.sentiment === feedbackType);
  }, [entries, feedbackType]);

  // Admin view filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">(
    "newest"
  );
  const [page, setPage] = useState(1);
  const pageSize = 9;

  // CSV export for filtered results (not paged)
  const exportCsv = () => {
    const rows = filteredWithControls.map((e) => ({
      Name: e.name,
      Phone: e.phone || "",
      Date: new Date(e.date).toLocaleString(),
      Sentiment: e.sentiment,
      Text: e.text,
    }));
    const headers = Object.keys(
      rows[0] || {
        Name: "",
        Phone: "",
        Date: "",
        Sentiment: "",
        Text: "",
      }
    );
    const esc = (v: any) => {
      const s = String(v ?? "");
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const csv = [headers.join(",")]
      .concat(rows.map((r) => headers.map((h) => esc((r as any)[h])).join(",")))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `negative-feedback-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Details modal state
  const [selected, setSelected] = useState<Entry | null>(null);

  const filteredWithControls = useMemo(() => {
    const s = searchQuery.trim().toLowerCase();
    const start = startDate ? new Date(startDate + "T00:00:00") : null;
    const end = endDate ? new Date(endDate + "T23:59:59") : null;

    let list = filtered.filter((e) => {
      const inSearch = !s
        ? true
        : e.name.toLowerCase().includes(s) ||
          (e.phone || "").toLowerCase().includes(s) ||
          e.text.toLowerCase().includes(s);
      if (!inSearch) return false;
      const d = new Date(e.date);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });

    list = list.slice().sort((a, b) => {
      if (sortOrder === "name") {
        return a.name.localeCompare(b.name);
      }
      const ad = +new Date(a.date);
      const bd = +new Date(b.date);
      return sortOrder === "newest" ? bd - ad : ad - bd;
    });
    return list;
  }, [filtered, searchQuery, startDate, endDate, sortOrder]);

  const totalCount = filtered.length;
  const filteredCount = filteredWithControls.length;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredWithControls.length / pageSize)
  );
  const paged = filteredWithControls.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, startDate, endDate, sortOrder]);

  // Derived sentiment computed on submit
  const [quickSentiment, setQuickSentiment] = useState<"positive" | "negative">(
    "positive"
  );
  const [quickStatus, setQuickStatus] = useState<string | null>(null);

  const handleQuickSubmit = () => {
    setQuickStatus(null);
    // Require star rating
    if (!rating) {
      setQuickStatus("Please choose a star rating.");
      return;
    }
    const sentiment: "positive" | "negative" =
      rating >= 4 ? "positive" : "negative";
    setQuickSentiment(sentiment);
    // If negative, verify reasons, required comment, name, and email
    if (sentiment === "negative") {
      if (negReasons.length === 0) {
        setQuickStatus("Please select at least one reason.");
        return;
      }
      if (!comment.trim()) {
        setQuickStatus("Please share a few details to help us improve.");
        return;
      }
      if (!negName.trim()) {
        setQuickStatus("Please enter your name.");
        return;
      }
      if (!negEmail.trim()) {
        setQuickStatus("Please enter your email.");
        return;
      }
      // Optionally, add basic email format validation
      if (!/^\S+@\S+\.\S+$/.test(negEmail.trim())) {
        setQuickStatus("Please enter a valid email address.");
        return;
      }
      // Persist the negative feedback so it shows on Dashboard
      const composed = `Name: ${negName}\nEmail: ${negEmail}\nReasons: ${negReasons.join(
        ", "
      )}\nComment: ${comment.trim()}`;
      // If a specific customer context exists, use it; otherwise pass empty id and rely on phone match or bucket
      const targetCustomerId = customer?.id || "";
      const phone = customer?.phone || undefined;
  addFeedback(targetCustomerId, composed, "negative", phone, rating || undefined);

      setSubmitted(true);
      setQuickStatus(null);
      // Clear selections after showing thank-you
      setNegReasons([]);
      setComment("");
      setNegName("");
      setNegEmail("");
      return;
    }

    // Positive sentiment: open Google Reviews; do not ask negative questions
    if (googleReviewLink) {
      window.open(googleReviewLink, "_blank");
    }
    // Persist positive rating internally (even if we don't display 4-5) for potential future use
    const targetCustomerId = customer?.id || "";
    const phone = customer?.phone || undefined;
    addFeedback(
      targetCustomerId,
      `Public positive rating: ${rating} star${rating && rating > 1 ? "s" : ""}`,
      "positive",
      phone,
      rating || undefined
    );
    setQuickStatus(null);
  };

  const handleSubmit = (custId: string) => {
    if (!newFeedbackText.trim()) return alert("Please enter feedback text.");
    addFeedback(custId, newFeedbackText.trim(), feedbackType, undefined);
    // If positive, redirect to Google review link to encourage leaving an official review
    if (feedbackType === "positive" && googleReviewLink) {
      // open in new tab
      window.open(googleReviewLink, "_blank");
    }
    setNewFeedbackText("");
  };

  // Dedicated form-first layout when no specific sentiment filter is chosen (public feedback entry page)
  if (!feedbackType) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4 py-12">
        <div className="w-full max-w-2xl">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-8">
            {!submitted && (
              <>
                <h1 className="text-2xl font-bold text-gray-900 text-center">
                  Share your experience
                </h1>
                <p className="text-center text-gray-600 mt-2">
                  How would you rate our service?
                </p>

                {/* Stars */}
                <div className="mt-6 flex items-center justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setRating(n);
                        setSubmitted(false);
                        setQuickStatus(null);
                      }}
                      className={`text-3xl transition-transform ${
                        rating && n <= rating
                          ? "text-yellow-400"
                          : "text-gray-300"
                      } hover:scale-110`}
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Positive CTA */}
            {rating !== null && rating >= 4 && (
              <div className="mt-8 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-xl p-5 text-center">
                <h2 className="text-lg font-semibold text-emerald-800">
                  We'd love your review on Google
                </h2>
                <p className="mt-1 text-emerald-700">
                  Please share your experience on Google Reviews — it helps us a
                  lot!
                </p>
                <a
                  href={googleReviewLink || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center mt-4 px-5 py-3 rounded-md bg-emerald-600 text-white font-medium shadow hover:bg-emerald-700"
                >
                  Write a Google review
                </a>
              </div>
            )}

            {/* Negative follow-up */}
            {rating !== null && rating <= 3 && !submitted && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleQuickSubmit();
                }}
                className="mt-8"
              >
                <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-100 rounded-xl p-6 shadow-sm">
                  <div className="text-center mb-4">
                    <div className="text-3xl mb-2">😔</div>
                    <h2 className="text-xl font-bold text-red-900">
                      We're sorry to hear that
                    </h2>
                    <p className="text-red-700 mt-2">
                      Your feedback is incredibly valuable to us. Please help us
                      understand what went wrong so we can improve.
                    </p>
                  </div>
                  {/* Name and Email fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="text-sm font-semibold text-red-900 mb-2 flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        Name <span className="text-red-600 ml-1">*</span>
                      </label>
                      <input
                        type="text"
                        value={negName}
                        onChange={(e) => setNegName(e.target.value)}
                        className="w-full border-2 border-red-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white/90 placeholder-red-400"
                        placeholder="Your name"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-red-900 mb-2 flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        Email <span className="text-red-600 ml-1">*</span>
                      </label>
                      <input
                        type="email"
                        value={negEmail}
                        onChange={(e) => setNegEmail(e.target.value)}
                        className="w-full border-2 border-red-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white/90 placeholder-red-400"
                        placeholder="you@email.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-red-900 mb-3 flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        What specific issues did you encounter?
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          "Didn't meet expectations",
                          "Too expensive",
                          "Slow or buggy",
                          "Poor support",
                          "Hard to use",
                          "Missing features",
                        ].map((label) => (
                          <label
                            key={label}
                            className="group flex items-center gap-3 p-3 bg-white/70 rounded-lg border border-red-100 hover:bg-white hover:border-red-200 transition-all cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={negReasons.includes(label)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNegReasons((prev) =>
                                  checked
                                    ? [...prev, label]
                                    : prev.filter((x) => x !== label)
                                );
                              }}
                              className="h-4 w-4 text-red-600 border-red-300 rounded focus:ring-red-500"
                            />
                            <span className="text-red-800 group-hover:text-red-900 font-medium">
                              {label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-red-900 mb-2 flex items-center">
                        <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                        Tell us more about your experience{" "}
                        <span className="text-red-600 ml-1">*</span>
                      </label>
                      <textarea
                        rows={4}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full border-2 border-red-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white/90 placeholder-red-400"
                        placeholder="Please share specific details about what didn't work well. Your insights help us serve you better in the future."
                      />
                      <div className="text-xs text-red-600 mt-1">
                        {comment.length}/500 characters
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="text-xs text-red-600">
                        <span className="font-medium">Privacy note:</span> Your
                        feedback goes directly to our improvement team
                      </div>
                      <button
                        type="submit"
                        className="px-6 py-3 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold shadow-lg hover:from-red-700 hover:to-red-800 transform hover:scale-105 transition-all duration-200 flex items-center gap-2"
                      >
                        <span>Send Feedback</span>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                          />
                        </svg>
                      </button>
                    </div>

                    {quickStatus && (
                      <div className="bg-red-100 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-700 font-medium">
                          {quickStatus}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </form>
            )}

            {/* Thank-you card for negative submissions */}
            {submitted && (
              <div className="mt-8 text-center bg-white">
                <div className="mx-auto w-full rounded-xl border border-amber-100 bg-amber-50 p-6">
                  <div className="text-4xl">🙏</div>
                  <h3 className="mt-2 text-xl font-semibold text-amber-900">
                    Thank you so much!
                  </h3>
                  <p className="mt-1 text-amber-800">
                    We truly appreciate your feedback. Our team will review it
                    and use it to improve.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Sentiment-filtered (internal/admin) view layout
  return (
    <div className="p-6 lg:p-10">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 bg-white text-gray-700 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 transition"
              >
                {/* Simple left arrow */}
                <span className="mr-2">←</span>
                Back
              </button>
            )}
            <h2 className="text-2xl font-bold">
              {feedbackType === "positive"
                ? "Positive Reviews"
                : "Negative Reviews"}
            </h2>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <p className="text-sm text-gray-600">
              Showing {filteredCount} of {totalCount} {feedbackType} review(s).
            </p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
              {feedbackType === "negative" ? "Negative" : "Positive"}
            </span>
          </div>
        </div>
      </div>
      {/* Controls */}
      <div className="mb-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 bg-white border border-gray-200 rounded-lg p-3">
        <div className="col-span-1">
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            placeholder="Search name, phone, or text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Sort</label>
          <select
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 col-span-1 lg:col-span-2">
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setStartDate("");
              setEndDate("");
              setSortOrder("newest");
            }}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-md bg-primary-600 text-white font-semibold hover:bg-primary-700"
          >
            Export CSV
          </button>
        </div>
      </div>
      {filteredCount === 0 ? (
        <p className="text-gray-600">No reviews found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paged.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{r.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.phone}</div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    r.sentiment === "positive"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {r.sentiment}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                {new Date(r.date).toLocaleString()}
              </div>
              <div className="mt-3 text-gray-800 whitespace-pre-line">
                {r.text && r.text.length > 180
                  ? r.text.slice(0, 180) + "…"
                  : r.text}
              </div>
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Show details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            className="px-3 py-1 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={`px-3 py-1 rounded font-semibold ${
                n === page
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            className="px-3 py-1 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {/* Details Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelected(null)}
          ></div>
          <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  {selected.name}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {selected.phone}
                </div>
              </div>
              <button
                type="button"
                className="p-2 rounded-md hover:bg-gray-100"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{new Date(selected.date).toLocaleString()}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    selected.sentiment === "positive"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {selected.sentiment}
                </span>
              </div>
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-80 overflow-auto whitespace-pre-line text-gray-800">
                {selected.text}
              </div>
            </div>
            <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackPage;
