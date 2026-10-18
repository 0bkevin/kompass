export type View =
  | "home"
  | "opportunities"
  | "results"
  | "radar"
  | "inbox"
  | "studio"
  | "calendar"
  | "assets"
  | "audience"
  | "brand"
  | "settings";
export type Role = "owner" | "editor" | "reviewer";
export interface AccessPolicy {
  allowed: boolean;
  reason: string;
  termsUrl?: string;
  reviewedAt?: string;
  expiresAt?: string;
}
export interface AccessPolicies {
  version?: string;
  apify: AccessPolicy;
  youtube: AccessPolicy;
  gemini: AccessPolicy;
  reddit: AccessPolicy;
  externalWeb: AccessPolicy;
}
export interface User {
  id: string;
  name: string;
  email: string;
}
export interface Segment {
  id: string;
  name: string;
  role: string;
  stage: string;
  needs: string;
  description?: string;
}
export interface Brand {
  isDemo?: boolean;
  id: string;
  name: string;
  industry: string;
  description: string;
  tone: string;
  language: string;
  market: string;
  website: string;
  color: string;
  secondaryColor: string;
  logoAssetId?: string;
  goals: string[];
  pillars: string[];
  audience: Segment[];
  weeklyTarget: number;
  role: Role;
  createdAt: string;
}
export interface Session {
  user: User | null;
  brands: Brand[];
}
export interface Analysis {
  hook: string;
  format: string;
  hypothesis: string;
  saturation: "low" | "medium" | "high" | "unknown";
  saturationReason: string;
  relevance: number;
  adaptation: string;
  segmentIds: string[];
  signals: string[];
  confidence: "low" | "medium" | "high";
  engine: "heuristic" | "ai";
  analyzedAt: string;
}
export interface Trend {
  score: number;
  scoreReasons: string[];
  observedAt: string;
  previousObservedAt?: string;
  velocity?: number;
  metrics?: { score?: number; comments?: number; views?: number };
  priorityMetric?: {
    name: string;
    value: number | null;
    rank?: number | null;
    origin: string;
  };
  sourceUrl?: string;
  sampleSize?: number;
  kind: "popular" | "emerging" | "unclassified";
  [key: string]: unknown;
}
export interface Reference {
  accessPolicy?: AccessPolicy;
  id: string;
  title: string;
  url?: string;
  originalUrlOmitted?: boolean;
  text?: string;
  source: string;
  providerAttributions?: { id: string; name: string; url: string }[];
  platform?: SocialPlatform;
  language: string;
  market: string;
  format: string;
  status: "new" | "analyzed" | "saved" | "dismissed";
  tags: string[];
  assetId?: string;
  videoId?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  contentScope?: "video_audio" | "sampled_video" | "metadata_only";
  mediaAccess?:
    "youtube_url" | "provider_url" | "uploaded_file" | "unavailable";
  videoAnalysis?: VideoAnalysis;
  createdAt: string;
  isDemo?: boolean;
  analysis?: Analysis;
  brandRelevance?: { score: number; matchedTerms: string[]; method: "lexical" };
  trend?: Trend;
  publishedAt?: string;
  author?: string;
  topic?: string;
  [key: string]: unknown;
}
export interface VideoAnalysis {
  engine: "gemini";
  status: "completed";
  contentScope: "video_audio" | "sampled_video";
  summary: string;
  hook: { visual: string; verbal: string };
  structure: string[];
  onScreenText: string[];
  audioNotes: string;
  adaptation: string;
  observations: {
    startSeconds: number;
    endSeconds: number;
    observation: string;
  }[];
  coverage: {
    mode: string;
    samplingFps?: number;
    notes: string;
  };
  limitations: string[];
  analyzedAt: string;
  model: string;
}
export interface Idea {
  id: string;
  title: string;
  angle: string;
  referenceIds: string[];
  segmentId?: string;
  status: "proposed" | "approved" | "dismissed";
  createdAt: string;
}
export interface Scene {
  id: string;
  text: string;
  duration: number;
  assetId?: string;
}
export interface Comment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}
export interface Piece {
  id: string;
  title: string;
  referenceId?: string;
  providerAttributions?: { id: string; name: string; url: string }[];
  ideaId?: string;
  segmentId?: string;
  format: "reel" | "carousel" | "post" | "video" | "newsletter";
  channel: "instagram" | "linkedin" | "tiktok" | "youtube";
  status: "draft" | "review" | "approved" | "scheduled" | "published";
  hook: string;
  script: string;
  caption: string;
  cta: string;
  scenes: Scene[];
  assetIds: string[];
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  assignee?: string;
  comments?: Comment[];
  metrics?: { views: number; engagement: number; leads: number };
  generationEngine?: "heuristic" | "ai";
  editorialBrief?: {
    instructions: string;
    angle: string;
    audienceNeeds: string;
    referenceUrl: string;
    providerAttributions?: { id: string; name: string; url: string }[];
    applied: {
      format: Piece["format"];
      unitCount?: number;
      cta: string;
      includeExample: boolean;
      sectionTitles?: string[];
    };
    notes: string[];
  };
  approvalVersion: string;
  publicationError?: string;
  publicationReceipt?: PublicationReceipt;
}
export type PublicationDestination = {
  provider: "webhook";
  url: string;
  parametersHidden?: boolean;
};
export interface PublicationReceipt {
  provider: "legacy" | "webhook";
  publishedAt: string;
  status?: number;
  requestId?: string;
  destination?: PublicationDestination;
}
export interface PublicationState {
  status: "ready" | "sending" | "uncertain" | "failed" | "delivered";
  pieceStatus: Piece["status"];
  approvalVersion: string;
  destination: PublicationDestination | null;
  destinationKey: string | null;
  unavailableReason?: string;
  receipt?: PublicationReceipt;
  error?: string;
}
export interface Asset {
  id: string;
  name: string;
  type: "image" | "video" | "document" | "audio";
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
  pieceId?: string;
  origin: "upload" | "template" | "ai" | "render";
}
export interface Source {
  accessPolicy?: AccessPolicy;
  id: string;
  name: string;
  type: "hackernews" | "reddit" | "rss" | "gdelt" | "youtube" | "apify";
  platform?: SocialPlatform;
  url?: string;
  query?: string;
  limit?: number;
  enabled: boolean;
  lastSyncedAt?: string;
  lastError?: string;
  createdAt: string;
}
export type SocialPlatform =
  "youtube" | "instagram" | "tiktok" | "facebook" | "x";
export interface SocialSettings {
  policies?: AccessPolicies;
  youtube: { configured: boolean };
  apify: { configured: boolean };
  gemini: { configured: boolean; model?: string };
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface Activity {
  id: string;
  text: string;
  createdAt: string;
}
export interface Integrations {
  ai: {
    configured: boolean;
    ready: boolean;
    managedBy: "platform" | "workspace" | "local";
    hasOverride: boolean;
    model?: string;
    accessPolicy?: AccessPolicy;
  };
  webhook: { configured: boolean; url?: string; accessPolicy?: AccessPolicy };
}
export interface BrandState {
  accessPolicies?: AccessPolicies;
  brand: Brand;
  references: Reference[];
  ideas: Idea[];
  pieces: Piece[];
  assets: Asset[];
  sources: Source[];
  members: Member[];
  activity: Activity[];
  integrations: Integrations;
}
