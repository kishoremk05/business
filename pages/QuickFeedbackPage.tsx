import React, { useState } from "react";
import { Customer } from "../types";

interface QuickFeedbackPageProps {
  customers: Customer[];
  onAddCustomer: (name: string, phone: string) => string | void;
  onAddFeedback?: (customerId: string, text: string) => void;
}

const QuickFeedbackPage: React.FC<QuickFeedbackPageProps> = ({
  customers,
  onAddCustomer,
  onAddFeedback,
}) => {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = () => {
    setStatus(null);
    if (!name.trim() || !message.trim()) {
      setStatus("Please provide name and feedback.");
      return;
    }
    const existing = customers.find((c) => c.name === name.trim());
    if (existing) {
      if (onAddFeedback) onAddFeedback(existing.id, message.trim());
      setStatus("Feedback added to existing customer.");
    } else {
      const phonePlaceholder = "+0000000000";
      const createdId = onAddCustomer(name.trim(), phonePlaceholder);
      let targetId: string | undefined =
        (typeof createdId === "string" && createdId) || undefined;
      if (!targetId) {
        const found = customers.find((c) => c.name === name.trim());
        targetId = found?.id;
      }
      if (targetId && onAddFeedback) onAddFeedback(targetId, message.trim());
      setStatus("New customer created and feedback stored.");
    }
    setName("");
    setMessage("");
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Quick Feedback</h1>
      <p className="text-sm text-gray-500 mb-6">
        Provide immediate feedback; it will be auto classified in the dashboard.
      </p>
      <div className="space-y-4 bg-white border border-gray-200 rounded-lg p-6">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
        {/* Email field removed */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Feedback message"
          className="w-full px-3 py-2 border border-gray-300 rounded-md h-32 resize-vertical"
        />
        <button
          onClick={handleSubmit}
          className="px-4 py-2 bg-primary-600 text-white rounded-md"
        >
          Submit
        </button>
        {status && <p className="text-sm mt-2 text-gray-600">{status}</p>}
      </div>
    </div>
  );
};

export default QuickFeedbackPage;
