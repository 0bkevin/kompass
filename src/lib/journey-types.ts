import type { Piece, Segment } from "./types";

export interface ContextEvidence {
  id: string;
  url?: string;
  title: string;
  excerpt: string;
  status: "read" | "linked" | "failed" | "provided";
  platform: string;
  reason?: string;
}

export interface Inspection {
  id: string;
  inspectedAt: string;
  method: "heuristic" | "ai";
  draft: {
    name: string;
    industry: string;
    description: string;
    website: string;
    market: string;
    language: string;
    tone: string;
    pillars: string[];
    audience: Segment[];
  };
  evidence: ContextEvidence[];
  warnings: string[];
}

export interface AudienceSignal {
  id: string;
  segmentId: string;
  topic: string;
  note: string;
  sourceUrl?: string;
  sampleSize?: number;
  sourceType: "public_content" | "editorial" | "community";
  aggregate?: boolean;
  communityPollId?: string;
  createdAt: string;
}

export interface Outcome {
  id: string;
  pieceId: string;
  segmentId?: string;
  title: string;
  channel?: Piece["channel"];
  publishedUrl?: string;
  publishedAt: string;
  metrics: { views: number; engagement: number; leads: number };
  notes?: string;
  origin: "manual";
  createdAt: string;
}

export interface OpportunityAnalysis {
  id: string;
  opportunityId: string;
  engine: "ai";
  model: string;
  analyzedAt: string;
  fingerprint: string;
  need: string;
  rationale: string;
  hookHypothesis: string;
  adaptation: string;
  segmentIds: string[];
  citations: { referenceId: string; support: string }[];
  limitations: string[];
}

export interface Opportunity {
  analysis?: OpportunityAnalysis;
  factors?: {
    factor: string;
    label: string;
    observation: string;
    limitation: string;
  }[];
  id: string;
  title: string;
  topic: string;
  referenceIds: string[];
  segmentIds: string[];
  relevance: number;
  reasons: string[];
  evidence: {
    referenceId: string;
    title: string;
    url?: string;
    source: string;
    observedAt?: string;
    detail: string;
  }[];
  growth: {
    label:
      | "observed"
      | "early_signal"
      | "stable"
      | "declining"
      | "insufficient";
    explanation: string;
  };
  hypothesis: string;
  adaptation: string;
  confidence: "low" | "medium" | "high";
  suggestedFormat: Piece["format"];
  suggestedChannel: "linkedin" | "instagram" | "tiktok" | "youtube";
  isDemo: boolean;
}

export interface Insights {
  generatedAt: string;
  opportunities: Opportunity[];
  coverage: {
    references: number;
    sources: number;
    activeSources: number;
    errors: string[];
    hasHistory: boolean;
    notes: string[];
  };
  signals: AudienceSignal[];
  learning: {
    outcomes: Outcome[];
    summary: string;
    bySegment: {
      segmentId: string;
      name: string;
      pieces: number;
      views: number;
      engagement: number;
      leads: number;
    }[];
  };
  workflow: {
    context: boolean;
    audience: boolean;
    references: number;
    drafts: number;
    review: number;
    scheduled: number;
    published: number;
  };
}
