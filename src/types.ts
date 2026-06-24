/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScreenType =
  | 'landing'
  | 'dashboard'
  | 'intelligence'
  | 'architect'
  | 'focus'
  | 'analytics'
  | 'habits'
  | 'settings';

export interface TaskType {
  id: string;
  title: string;
  project: string;
  status: 'critical' | 'normal' | 'deferred';
  countdownSeconds: number; // For interactive countdown
  effort?: string;
  progress?: number; // 0 to 100
  description?: string;
  assignees?: string[]; // e.g. ["JD", "AS"]
  subtasks?: { text: string; completed: boolean }[];
  difficulty?: number; // 1 to 10
  impact?: number; // 1 to 10
  priorityScore?: number; // calculated priority engine score
  postponedCount?: number; // tracking procrastination
  createdAt?: string; // ISO date string
}

export interface RiskAlert {
  id: string;
  title: string;
  timeStatus: string;
  level: 'high' | 'medium';
}

export interface TimelineItem {
  id: string;
  week: string;
  title: string;
  description: string;
  status: 'current' | 'upcoming' | 'locked';
}

export interface MilestoneTask {
  text: string;
  completed: boolean;
}

export interface MilestoneItem {
  id: string;
  tag: string;
  title: string;
  tasks: MilestoneTask[];
}

export interface ArchitectedPlan {
  title: string;
  timeline: TimelineItem[];
  milestones: MilestoneItem[];
}
