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
    phone?: string
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
  const [submitted, setSubmitted] = useState(false);

  // Feedback storage/display removed per requirement
  const entries: any[] = [];
  const filtered: any[] = [];

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
    // If negative, verify reasons and required comment
    if (sentiment === "negative") {
      if (negReasons.length === 0) {
        setQuickStatus("Please select at least one reason.");
        return;
      }
      if (!comment.trim()) {
        setQuickStatus("Please share a few details to help us improve.");
        return;
      }
      setSubmitted(true);
      setQuickStatus(null);
      // Clear selections after showing thank-you
      setNegReasons([]);
      setComment("");
      return;
    }

    // Positive sentiment: open Google Reviews; do not ask negative questions
    if (googleReviewLink) {
      window.open(googleReviewLink, "_blank");
    }
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
                      <label className="block text-sm font-semibold text-red-900 mb-2 flex items-center">
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
          <p className="text-sm text-gray-600 mt-1">
            Showing {filtered.length} {feedbackType} review(s).
          </p>
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-gray-600">No reviews found.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((r) => (
            <li
              key={r.id}
              className={`p-4 rounded-lg border ${
                customer && customer.id === r.customerId
                  ? "border-primary-600 bg-primary-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{r.name}</div>
                  <div className="text-sm text-gray-600 mt-1">{r.text}</div>
                  <div className="text-xs text-gray-500 mt-1">{r.phone}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(r.date).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      r.sentiment === "positive"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {r.sentiment}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {customer && feedbackType && (
        <div className="mt-6 bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="font-semibold">Add feedback for {customer.name}</h3>
          <textarea
            rows={3}
            value={newFeedbackText}
            onChange={(e) => setNewFeedbackText(e.target.value)}
            placeholder={`Write a ${feedbackType} feedback...`}
            className="w-full mt-2 p-2 border border-gray-300 rounded-md"
          />
          <div className="mt-3 flex items-center space-x-2">
            <button
              onClick={() => handleSubmit(customer.id)}
              className={`px-4 py-2 rounded-md text-white font-semibold ${
                feedbackType === "positive" ? "bg-green-600" : "bg-red-600"
              }`}
            >
              Submit {feedbackType} Feedback
            </button>
            {feedbackType === "positive" && googleReviewLink && (
              <a
                href={googleReviewLink}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-sm text-primary-600 underline"
              >
                Share on Google Reviews
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackPage;
