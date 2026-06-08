export type TaskCategory = "developer" | "design" | "research" | "documentation" | "content";

export interface Task {
  id: string;
  number: number;
  title: string;
  category: TaskCategory;
  reward: number;
  rewardRbnt?: number;
  reviewerComp: number;
  paymentSplit: string;
  status: "open" | "assigned" | "in_progress" | "under_review" | "completed" | "paused";
  shortDescription: string;
  problem: string;
  deliverables: string[];
  qualityBenchmarks: string[];
  failureCriteria: string[];
  technicalRequirements?: string[];
  infrastructure?: string[];
}

export const formatReward = (rbnt?: number, usd?: number): string => {
  if (rbnt && usd) return `${rbnt.toLocaleString()} RBNT (~$${usd})`;
  if (rbnt) return `${rbnt.toLocaleString()} RBNT`;
  return `$${usd ?? 0}`;
};

export const getCategoryLabel = (cat: TaskCategory): string => ({
  developer: "Developer Work",
  design: "Design",
  research: "Research & Analysis",
  documentation: "Documentation",
  content: "Content & Community",
}[cat]);

export const getStatusLabel = (status: Task["status"]): string => ({
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  under_review: "Under Review",
  completed: "Completed",
  paused: "Paused",
}[status]);
