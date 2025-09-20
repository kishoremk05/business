export enum CustomerStatus {
  Pending = 'Pending',
  Sent = 'Sent',
  Clicked = 'Clicked',
  Reviewed = 'Reviewed',
  Failed = 'Failed'
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  status: CustomerStatus;
  addedAt: Date;
  rating?: number;
  feedback?: FeedbackEntry[];
}

export interface ActivityLog {
  id: string;
  customerName: string;
  action: string;
  timestamp: Date;
}

export interface FeedbackEntry {
  id: string;
  text: string;
  sentiment: "positive" | "negative";
  date: Date;
  phone?: string;
}

export enum Page {
  Dashboard = 'dashboard',
  Settings = 'settings',
  Feedback = 'feedback',
  QuickFeedback = 'quick-feedback',
}