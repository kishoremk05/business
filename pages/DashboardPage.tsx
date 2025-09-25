import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Customer, ActivityLog, CustomerStatus } from "../types";
import {
  PlusIcon,
  MessageIcon,
  PaperAirplaneIcon,
  TrashIcon,
  UploadIcon,
  SearchIcon,
  CreditCardIcon,
  EllipsisVerticalIcon,
  ClickIcon,
  StarIcon,
  LinkIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "../components/icons";
import AddCustomerModal from "../components/AddCustomerModal";

// Dashboard Overview cards (top summary) – counts sent based on logs first, fallback to status.
const DashboardOverview: React.FC<{
  customers: Customer[];
  activityLogs: ActivityLog[];
}> = ({ customers, activityLogs }) => {
  // Count sends from logs (preferred accurate source)
  const sentLogCount = activityLogs.filter((log) => {
    const a = log.action.toLowerCase();
    return (
      a.includes("sent sms") ||
      a.includes("resend sms") ||
      a.includes("sent review request")
    );
  }).length;
  // Fallback to status derived
  const statusDerivedSent = customers.filter(
    (c) =>
      c.status === "Sent" || c.status === "Clicked" || c.status === "Reviewed"
  ).length;
  const messagesSent = sentLogCount > 0 ? sentLogCount : statusDerivedSent;

  const reviewRedirects = customers.filter(
    (c) => c.status === "Clicked" || c.status === "Reviewed"
  ).length;

  const conversionRate =
    messagesSent > 0 ? (reviewRedirects / messagesSent) * 100 : 0;

  const Card = ({ value, label }: { value: string; label: string }) => (
    <div className="flex flex-col items-center justify-center bg-gray-100 rounded-xl p-8 min-w-[220px] min-h-[120px]">
      <div className="text-4xl font-extrabold text-blue-600 mb-2">{value}</div>
      <div className="text-lg text-gray-700 font-medium text-center">
        {label}
      </div>
    </div>
  );

  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-purple-700 mb-2">
        Dashboard Overview
      </h2>
      <div className="h-1 w-full bg-gray-100 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card value={messagesSent.toLocaleString()} label="Messages Sent" />
        <Card
          value={reviewRedirects.toLocaleString()}
          label="Review Redirects"
        />
        <Card value={`${conversionRate.toFixed(1)}%`} label="Conversion Rate" />
      </div>
    </div>
  );
};
// Card-style section for negative comments, styled like Plan Status
const NegativeCommentsCard: React.FC<{
  comments: Array<{
    id: string;
    customerName: string;
    customerPhone: string;
    date: Date;
    text: string;
  }>;
}> = ({ comments }) => {
  const count = comments.length;
  const handleOpen = () => {
    if (typeof (window as any).openFeedbackFromDashboard === "function") {
      (window as any).openFeedbackFromDashboard("negative");
    }
  };
  return (
    <button
      type="button"
      onClick={handleOpen}
      className="text-left bg-white p-6 rounded-lg border border-red-200 h-full hover:shadow-md hover:border-red-300 transition"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-red-700 flex items-center gap-2">
          <XCircleIcon className="h-5 w-5 text-red-500" />
          Negative Comments
        </h3>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
          {count}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>View all negative feedback</span>
        <span aria-hidden>→</span>
      </div>
    </button>
  );
};
// Props for NegativeFeedbackSection
// Section to show only negative feedback comments
type NegativeFeedbackSectionProps = { customers: Customer[] };
const NegativeFeedbackSection: React.FC<NegativeFeedbackSectionProps> = ({
  customers,
}) => {
  // Gather all negative feedback entries from all customers
  const negativeFeedbacks = customers
    .flatMap((c) =>
      c.feedback
        ? c.feedback.map((f) => ({
            ...f,
            customerName: c.name,
            customerPhone: c.phone,
          }))
        : []
    )
    .filter((f) => f.sentiment === "negative");

  if (negativeFeedbacks.length === 0) return null;

  return (
    <div className="bg-white p-6 rounded-lg border border-red-200 mt-2">
      <h3 className="text-lg font-semibold text-red-700 mb-4 flex items-center gap-2">
        <XCircleIcon className="h-5 w-5 text-red-500" />
        Negative Feedback Comments
      </h3>
      <ul className="space-y-4">
        {negativeFeedbacks.map((fb) => (
          <li key={fb.id} className="border-b border-red-100 pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <span className="font-semibold text-gray-900">
                  {fb.customerName}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {fb.customerPhone}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1 md:mt-0">
                {new Date(fb.date).toLocaleString()}
              </div>
            </div>
            <div className="mt-2 text-gray-800">{fb.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
};
// (imports moved to top)

declare var XLSX: any;

const FunnelAnalytics: React.FC<{ customers: Customer[] }> = ({
  customers,
}) => {
  // Use original feedback data for all feedback-related analytics
  const stats = useMemo(() => {
    const total = customers.length;
    const sent = customers.filter(
      (c) =>
        c.status === "Sent" || c.status === "Clicked" || c.status === "Reviewed"
    ).length;
    const clicked = customers.filter(
      (c) => c.status === "Clicked" || c.status === "Reviewed"
    ).length;
    const reviewed = customers.filter((c) => c.status === "Reviewed").length;

    // Aggregate all feedback entries from all customers
    const allFeedback = customers.flatMap((c) => c.feedback || []);

    const positive = allFeedback.filter(
      (f) => f.sentiment === "positive"
    ).length;
    const negative = allFeedback.filter(
      (f) => f.sentiment === "negative"
    ).length;

    // Star ratings breakdown for Pie chart and sentiment graph
    const ratingCounts: Record<number, number> = {};
    allFeedback.forEach((f) => {
      if (typeof f.rating === "number") {
        ratingCounts[f.rating] = (ratingCounts[f.rating] || 0) + 1;
      }
    });

    return {
      total,
      sent: { count: sent, rate: total > 0 ? sent / total : 0 },
      clicked: { count: clicked, rate: sent > 0 ? clicked / sent : 0 },
      reviewed: { count: reviewed, rate: clicked > 0 ? reviewed / clicked : 0 },
      positive,
      negative,
      ratingCounts,
    };
  }, [customers]);

  const FunnelStage: React.FC<{
    icon: React.ReactNode;
    title: string;
    count: number;
    total: number;
    color: string;
    isFirst?: boolean;
  }> = ({ icon, title, count, total, color, isFirst = false }) => {
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
      <div className="flex items-center">
        {!isFirst && (
          <div className="w-12 text-center text-sm text-gray-500 self-stretch flex items-center justify-center">
            {Math.round(stats.clicked.rate * 100)}% →
          </div>
        )}
        <div
          className={`flex-1 bg-white p-4 rounded-lg border border-gray-200 flex items-center space-x-4 ${
            isFirst ? "w-full" : ""
          }`}
        >
          <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
          <div>
            <p className="text-sm text-gray-500 font-medium">{title}</p>
            <p className="text-xl font-bold text-gray-800">{count}</p>
          </div>
          {!isFirst && (
            <div className="ml-auto text-right">
              <p className="text-sm font-semibold text-gray-700">
                {percentage}%
              </p>
              <p className="text-xs text-gray-500">of previous</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Deterministic pie chart data for star ratings (only 1,2,3 – hide 4 & 5 per requirement)
  const rawCounts = stats.ratingCounts;
  const ordered = [1, 2, 3].map((r) => ({
    rating: r,
    value: rawCounts[r] || 0,
  }));
  const hasAnyRating = ordered.some((o) => o.value > 0);
  const pieData = hasAnyRating
    ? ordered.map((o) => ({
        name: `${o.rating} Star${o.rating > 1 ? "s" : ""}`,
        value: o.value,
      }))
    : [{ name: "No Ratings", value: 1 }];
  // Color mapping: 1=red, 2=amber, 3=yellow (darker progression for severity)
  const pieColors = hasAnyRating
    ? ["#dc2626", "#f59e0b", "#fbbf24"]
    : ["#E5E7EB"]; // neutral gray when empty

  // Donut chart data for feedback (fallback if empty)
  const donutDataRaw = [
    { name: "Positive", value: stats.positive },
    { name: "Negative", value: stats.negative },
  ];
  const hasDonut = donutDataRaw.some((d) => d.value !== 0);
  const donutData = hasDonut
    ? donutDataRaw
    : [{ name: "No Feedback", value: 1 }];
  const donutColors = ["#4CAF50", "#F44336", "#E5E7EB"];

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">
        Smart Funnel Analytics
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart: Total customers by star ratings */}
        <div>
          <h4 className="text-md font-semibold text-gray-700 mb-2">
            Customer Ratings
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label
              >
                {pieData.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={pieColors[idx % pieColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          {(!hasAnyRating ||
            (pieData.length === 1 && pieData[0].name === "No Ratings")) && (
            <div className="text-center text-gray-400 text-sm mt-2">
              No 1–3 star ratings yet
            </div>
          )}
        </div>
        {/* Donut Chart: Feedback summary */}
        <div>
          <h4 className="text-md font-semibold text-gray-700 mb-2">
            Feedback Summary
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                label
              >
                {donutData.map((entry, idx) => (
                  <Cell
                    key={`cell-donut-${idx}`}
                    fill={donutColors[idx % donutColors.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          {donutData.length === 1 && donutData[0].name === "No Feedback" && (
            <div className="text-center text-gray-400 text-sm mt-2">
              No feedback yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{
  status: CustomerStatus;
  onClick?: () => void;
}> = ({ status, onClick }) => {
  const baseClasses =
    "px-2.5 py-0.5 text-xs font-semibold rounded-full inline-flex items-center";
  const clickableClasses = onClick
    ? "cursor-pointer hover:opacity-80 transition-opacity"
    : "";

  // FIX: Explicitly type statusConfig to allow for optional icon and tooltip properties.
  const statusConfig: Record<
    CustomerStatus,
    {
      text: string;
      classes: string;
      icon?: React.ReactNode;
      tooltip?: string;
    }
  > = {
    [CustomerStatus.Pending]: {
      text: "Pending",
      classes: "bg-gray-100 text-gray-800",
    },
    [CustomerStatus.Sent]: {
      text: "Sent",
      classes: "bg-blue-100 text-blue-800",
      icon: <LinkIcon className="w-3 h-3 ml-1.5" />,
      tooltip: "Simulate Customer Click",
    },
    [CustomerStatus.Clicked]: {
      text: "Clicked",
      classes: "bg-indigo-100 text-indigo-800",
      icon: <LinkIcon className="w-3 h-3 ml-1.5" />,
      tooltip: "View Funnel as Customer",
    },
    [CustomerStatus.Reviewed]: {
      text: "Reviewed",
      classes: "bg-green-100 text-green-800",
      icon: <CheckCircleIcon className="w-3 h-3 ml-1.5" />,
    },
    [CustomerStatus.Failed]: {
      text: "Failed",
      classes: "bg-red-100 text-red-800",
      icon: <XCircleIcon className="w-3 h-3 ml-1.5" />,
    },
  };

  const config = statusConfig[status];

  return (
    <span
      title={config.tooltip}
      className={`${baseClasses} ${config.classes} ${clickableClasses}`}
      onClick={onClick}
    >
      {config.text}
      {onClick && config.icon}
    </span>
  );
};

interface RecentActivityProps {
  logs: ActivityLog[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ logs }) => (
  <div className="bg-white p-6 rounded-lg border border-gray-200 h-full">
    <h3 className="text-lg font-semibold text-gray-800 mb-4">
      Recent Activity
    </h3>
    <ul className="space-y-4">
      {logs.slice(0, 5).map((log) => (
        <li key={log.id} className="flex items-start">
          <div className="bg-gray-100 p-2 rounded-full mr-4 mt-1">
            <MessageIcon className="h-5 w-5 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">
              {log.action} for{" "}
              <span className="font-bold">{log.customerName}</span>
            </p>
            <p className="text-xs text-gray-500">
              {log.timestamp.toLocaleTimeString()}
            </p>
          </div>
        </li>
      ))}
    </ul>
  </div>
);

interface PlanStatusProps {
  plan: { name: string; messageLimit: number; renewalDate: Date };
  messagesSentThisMonth: number;
}

const PlanStatus: React.FC<PlanStatusProps> = ({
  plan,
  messagesSentThisMonth,
}) => {
  const usagePercentage = Math.min(
    (messagesSentThisMonth / plan.messageLimit) * 100,
    100
  );

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 h-full">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Plan Status</h3>
      <div className="flex items-center space-x-4 mb-5">
        <div className="bg-primary-50 p-3 rounded-lg">
          <CreditCardIcon className="h-6 w-6 text-primary-600" />
        </div>
        <div>
          <p className="font-bold text-gray-800">{plan.name}</p>
          <p className="text-sm text-gray-500">
            Renews on {plan.renewalDate.toLocaleDateString()}
          </p>
        </div>
      </div>
      <div>
        <div className="flex justify-between items-center mb-1">
          <p className="text-sm font-medium text-gray-700">
            Monthly Message Usage
          </p>
          <p className="text-sm font-semibold text-gray-800">
            {messagesSentThisMonth} / {plan.messageLimit}
          </p>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div
            className="bg-primary-600 h-2.5 rounded-full"
            style={{ width: `${usagePercentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

interface CustomerTableProps {
  customers: Customer[];
  onSendMessage: (customerId: string) => void;
  onDeleteCustomer: (customerId: string) => void;
  onOpenFunnel: (customerId: string) => void;
  onOpenFeedback: (
    customerId: string,
    feedbackType: "positive" | "negative"
  ) => void;
  onAddFeedback?: (customerId: string, text: string) => void;
  onClearCustomers: () => void;
}

const CustomerTable: React.FC<CustomerTableProps> = ({
  customers,
  onSendMessage,
  onDeleteCustomer,
  // onSendEmail,
  onOpenFunnel,
  onOpenFeedback,
  onAddFeedback,
  onClearCustomers,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 3;
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredCustomers = customers.filter((customer) => {
    const lowerCaseQuery = searchQuery.toLowerCase();
    const cleanedQueryPhone = searchQuery.replace(/\D/g, "");

    const nameMatch = customer.name.toLowerCase().includes(lowerCaseQuery);
    const phoneMatch =
      cleanedQueryPhone.length > 0 &&
      customer.phone.replace(/\D/g, "").includes(cleanedQueryPhone);

    return nameMatch || phoneMatch;
  });

  // Pagination logic
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / pageSize)
  );
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset to page 1 when search changes or customer list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, customers]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleToggleMenu = (customerId: string) => {
    setOpenMenuId((prevId) => (prevId === customerId ? null : customerId));
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          Customer List
        </h3>
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="relative w-full md:w-auto flex items-center gap-2">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <SearchIcon className="h-5 w-5 text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary-600 focus:border-primary-600 bg-white text-gray-900"
            />
            <button
              className="ml-2 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-semibold"
              onClick={onClearCustomers}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      {filteredCustomers.length === 0 ? (
        <div className="py-10 text-center text-gray-500 text-base font-medium">
          No customer data
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 font-medium">
                    Phone
                  </th>
                  {/* Feedback column removed */}
                  <th scope="col" className="px-6 py-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="bg-white border-b hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-normal text-gray-700">
                        {customer.phone}
                      </div>
                    </td>
                    {/* Feedback cell removed */}
                    <td className="px-6 py-4 text-right relative">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleToggleMenu(customer.id)}
                          className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                          aria-haspopup="true"
                          aria-expanded={openMenuId === customer.id}
                        >
                          <EllipsisVerticalIcon className="h-5 w-5" />
                        </button>
                      </div>
                      {openMenuId === customer.id && (
                        <div
                          ref={menuRef}
                          className="origin-top-right absolute right-0 mt-2 w-44 rounded-xl shadow-2xl bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10 border border-gray-100 flex flex-col py-2"
                          role="menu"
                          aria-orientation="vertical"
                          aria-labelledby="menu-button"
                        >
                          <button
                            onClick={() => {
                              onSendMessage(customer.id);
                              setOpenMenuId(null);
                            }}
                            disabled={customer.status === "Reviewed"}
                            className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
                            role="menuitem"
                          >
                            <PaperAirplaneIcon className="h-4 w-4 mr-3" />
                            {customer.status === "Pending"
                              ? "Send SMS"
                              : "Resend SMS"}
                          </button>
                          <div className="border-t my-2 border-gray-100"></div>
                          <button
                            onClick={() => {
                              onDeleteCustomer(customer.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full text-left flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                            role="menuitem"
                          >
                            <TrashIcon className="h-4 w-4 mr-3" />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center mt-4 gap-2">
              <button
                className="px-3 py-1 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    className={`px-3 py-1 rounded font-semibold ${
                      page === currentPage
                        ? "bg-primary-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                )
              )}
              <button
                className="px-3 py-1 rounded bg-gray-200 text-gray-700 font-semibold disabled:opacity-50"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface DashboardPageProps {
  customers: Customer[];
  activityLogs: ActivityLog[];
  plan: { name: string; messageLimit: number; renewalDate: Date };
  messagesSentThisMonth: number;
  onAddCustomer: (name: string, phone: string) => string | void;
  onSendMessage: (customerId: string) => void;
  onDeleteCustomer: (customerId: string) => void;
  onBulkAddCustomers: (
    customersData: Omit<Customer, "id" | "status" | "addedAt" | "rating">[]
  ) => { added: number; duplicates: number; invalid: number };
  onOpenFunnel: (customerId: string) => void;
  onOpenFeedback: (
    customerId: string,
    feedbackType: "positive" | "negative"
  ) => void;
  onAddFeedback?: (customerId: string, text: string) => void;
  onClearCustomers: () => void;
}

const DashboardPage: React.FC<DashboardPageProps> = ({
  customers,
  activityLogs,
  plan,
  messagesSentThisMonth,
  onAddCustomer,
  onSendMessage,
  onDeleteCustomer,
  onBulkAddCustomers,
  // onSendEmail,
  onOpenFunnel,
  onOpenFeedback,
  onAddFeedback,
  onClearCustomers,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);
        // Local helper replicating backend normalization logic.
        const normalizePhone = (raw: any): { ok: boolean; value?: string } => {
          if (!raw) return { ok: false };
          const cleaned = String(raw)
            .replace(/[^0-9+]/g, "")
            .trim();
          if (cleaned.startsWith("+")) {
            const digits = cleaned.slice(1);
            if (/^[0-9]{10,15}$/.test(digits))
              return { ok: true, value: cleaned };
            return { ok: false };
          }
          const digitsOnly = cleaned.replace(/^0+/, "");
          if (/^[6-9][0-9]{9}$/.test(digitsOnly)) {
            return { ok: true, value: "+91" + digitsOnly };
          }
          if (/^[0-9]{10,15}$/.test(digitsOnly)) {
            // Ambiguous country code – treat as invalid to force user to correct.
            return { ok: false };
          }
          return { ok: false };
        };

        let normalizationInvalid = 0;
        const customersData = json.flatMap((row) => {
          const name = row["Customer Name"];
          const rawPhone =
            row["Phone Number"] ||
            row["Phone"] ||
            row["Phone No"] ||
            row["Contact"];
          const norm = normalizePhone(rawPhone);
          if (!name || !norm.ok) {
            if (name && rawPhone) normalizationInvalid++;
            return [];
          }
          return [{ name, phone: norm.value! }];
        });

        if (customersData.length > 0) {
          const result = onBulkAddCustomers(customersData);
          const totalInvalid = result.invalid + normalizationInvalid;
          alert(
            `Upload complete!\n\nAdded: ${
              result.added
            } new customers.\nDuplicates Skipped: ${
              result.duplicates
            }\nInvalid Entries Skipped: ${totalInvalid}${
              normalizationInvalid
                ? ` (Phone format issues: ${normalizationInvalid})`
                : ""
            }`
          );
        } else {
          alert(
            "Could not find any valid customer data in the uploaded file (ensure headers like 'Customer Name' and 'Phone Number')."
          );
        }
      } catch (error) {
        console.error("Error parsing XLSX file:", error);
        alert(
          "There was an error parsing the XLSX file. Please ensure it is a valid Excel file with the correct headers (e.g., Customer Name, Phone Number)."
        );
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      alert("Error reading file.");
    };
    reader.readAsArrayBuffer(file);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="p-6 lg:p-10">
      {/* Dashboard Overview Section */}
      <DashboardOverview customers={customers} activityLogs={activityLogs} />

      <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-800 tracking-tight">
            Welcome back, Biz Owner!
          </h2>
          <p className="text-gray-500 mt-1">
            Here's a snapshot of your review funnel performance.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx"
            className="hidden"
          />
          <a
            href={`${(import.meta as any).env?.BASE_URL || "/"}feedback`}
            onClick={(e) => {
              e.preventDefault();
              const base = (import.meta as any).env?.BASE_URL || "/";
              const target = `${base}feedback`;
              if (window.location.pathname !== target) {
                window.history.pushState({ page: target }, "", target);
                // Notify SPA listener in App.tsx
                window.dispatchEvent(new PopStateEvent("popstate"));
              }
            }}
            className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md font-semibold hover:bg-gray-100 transition-colors"
          >
            <StarIcon className="h-5 w-5 mr-2" />
            Feedback Page
          </a>
          <button
            onClick={triggerFileUpload}
            className="flex items-center bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md font-semibold hover:bg-gray-100 transition-colors"
          >
            <UploadIcon className="h-5 w-5 mr-2" />
            Upload XLSX
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center bg-primary-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-primary-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-3">
          <FunnelAnalytics customers={customers} />
        </div>
        <div className="lg:col-span-2">
          <CustomerTable
            customers={customers.filter((c) => {
              if (c.id === "public-feedback") return false;
              // Hide known sample/dummy data used in initial seeds
              const dummyNames = new Set(["John Doe", "Jane Smith"]);
              const dummyPhones = new Set(["+1234567890", "+1987654321"]);
              if (dummyNames.has(c.name)) return false;
              if (dummyPhones.has(c.phone)) return false;
              return true;
            })}
            onSendMessage={onSendMessage}
            onDeleteCustomer={onDeleteCustomer}
            onOpenFunnel={onOpenFunnel}
            onOpenFeedback={onOpenFeedback}
            onClearCustomers={onClearCustomers}
          />
        </div>
        <div className="flex flex-col gap-8">
          <PlanStatus
            plan={plan}
            messagesSentThisMonth={messagesSentThisMonth}
          />
          {/* Negative Comments Card Section */}
          <NegativeCommentsCard
            comments={customers.flatMap((c) =>
              c.feedback
                ? c.feedback
                    .filter((f) => f.sentiment === "negative")
                    .map((f) => ({
                      id: f.id,
                      customerName: c.name,
                      customerPhone: c.phone,
                      date: f.date,
                      text: f.text,
                    }))
                : []
            )}
          />
        </div>
      </div>

      {isModalOpen && (
        <AddCustomerModal
          onClose={() => setIsModalOpen(false)}
          onAddCustomer={onAddCustomer}
        />
      )}
    </div>
  );
};
export default DashboardPage;
