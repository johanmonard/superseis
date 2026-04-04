// -----------------------------------------------------------------------
// REFERENCE ONLY — do not copy this file.
// This is sample data for the Operations reference module.
// Build your own data models and API integrations from scratch.
// -----------------------------------------------------------------------

export type OperationsTaskStatus = "new" | "in-progress" | "blocked" | "done";
export type OperationsTaskPriority = "low" | "medium" | "high";

export interface OperationsTask {
  id: string;
  title: string;
  owner: string;
  status: OperationsTaskStatus;
  priority: OperationsTaskPriority;
  updatedAt: string;
  summary: string;
}

export interface OperationsBriefing {
  id: string;
  title: string;
  owner: string;
  scope: string;
  notes: string;
  needsFollowUp: boolean;
  createdAt: string;
}

export const operationsSampleTasks: OperationsTask[] = [
  {
    id: "OPS-104",
    title: "Reconcile arrival checklist",
    owner: "Nora",
    status: "blocked",
    priority: "high",
    updatedAt: "8 min ago",
    summary: "Waiting on customer gate access notes before final release.",
  },
  {
    id: "OPS-101",
    title: "Confirm subcontractor handoff",
    owner: "Ibrahim",
    status: "in-progress",
    priority: "medium",
    updatedAt: "22 min ago",
    summary: "Preparing the final handoff note for tomorrow morning.",
  },
  {
    id: "OPS-097",
    title: "Review permit scan batch",
    owner: "Mae",
    status: "new",
    priority: "low",
    updatedAt: "41 min ago",
    summary: "Triage import anomalies before they move to the admin queue.",
  },
  {
    id: "OPS-082",
    title: "Close Friday readiness brief",
    owner: "Jon",
    status: "done",
    priority: "medium",
    updatedAt: "Today",
    summary: "Shared with the field team and archived in the daily log.",
  },
];

export const operationsSampleBriefings: OperationsBriefing[] = [
  {
    id: "BRF-02",
    title: "Morning gate update",
    owner: "Nora",
    scope: "Arrival briefing",
    notes: "Customer-side gate timing changed after the first truck had already left.",
    needsFollowUp: true,
    createdAt: "Today, 07:40",
  },
  {
    id: "BRF-01",
    title: "Field handoff summary",
    owner: "Ibrahim",
    scope: "Shift handoff",
    notes: "Shared the late supplier note and assigned the first follow-up call.",
    needsFollowUp: false,
    createdAt: "Yesterday, 17:15",
  },
];
