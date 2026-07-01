// Mirrors the Worker API responses (services/src/controllers).

export interface Overview {
  pagesWithTours: number;       // number of pages with a tour (= "tours")
  totalSteps: number;           // total steps across all tours
  toursShownWeek: number;       // tours shown (impressions), last 7d
  stepsShownWeek: number;       // step-tooltips shown, last 7d
  completionRate: number; // %
  toursGenerated: number;
  billableAmount: number; // smallest currency unit
  providerCostMicroUsd: number; // our cost (micro-USD)
  trend: {
    activeUsersWeek: number;
    activeUsersDeltaPct: number | null;
    shownDeltaPct: number | null;
    series: { date: string; users: number }[];
  };
}

export type TimeRange = 'hour' | 'day' | 'week' | 'month';

export interface TimeseriesPoint {
  label: string;
  shown: number;
  steps: number;
}

export interface Timeseries {
  range: TimeRange;
  series: TimeseriesPoint[];
}

export interface PageRow {
  contextKey: string;
  generations: number;
  billable: number;
  shown: number;
  completed: number;
  completionRate: number;
}

export interface ActivityEvent {
  id: string;
  at: string;
  action?: string;
  entity?: string;
  [k: string]: unknown;
}

export interface MauBill {
  projectId: string;
  month: string;
  plan: string;
  mau: number;
  planLimit: number;
  baseFee: number;
  overage: number;
  amountDue: number;
}
