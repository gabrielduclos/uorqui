export type View = "home" | "communities" | "search" | "admin" | "profile" | "notifications" | "companies" | "plans" | "superadmin";
export type HomeTab = "for-you" | "recent" | "announcement" | "world";

export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  username?: string;
  bio?: string;
  avatarMediaId?: string;
}

export type CompanyPlan = "free" | "premium";
export type BillingStatus = "inactive" | "pending" | "active" | "past_due" | "canceled";

export interface PlanLimits {
  members: number | null;
  communities: number | null;
}

export interface Company {
  id: string;
  name: string;
  role?: string;
  plan?: CompanyPlan;
  effectivePlan?: CompanyPlan;
  billingStatus?: BillingStatus;
  premiumUntil?: string;
  manualPremiumUntil?: string;
  premiumSource?: "asaas" | "manual" | "";
  memberCount?: number;
  communityCount?: number;
  limits?: PlanLimits;
  billingReady?: boolean;
  premiumMonthlyPrice?: number;
  billingSubscriptionId?: string;
}

export interface Community {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  memberCount?: number;
}

export interface CommunityMember {
  uid: string;
  displayName?: string;
  email?: string;
  avatarMediaId?: string;
  companyRole?: "owner" | "admin" | "member";
  communityRole?: "moderator" | "member";
}

export interface NotificationItem {
  id?: string;
  type: string;
  title: string;
  body?: string;
  read?: boolean;
  persistent?: boolean;
  status?: string;
  createdAt?: string;
  data?: Record<string, string>;
}

export interface Attachment {
  id: string;
  name?: string;
  contentType?: string;
  size?: number;
}

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
}

export interface Post {
  id: string;
  authorUid: string;
  authorName?: string;
  authorAvatarMediaId?: string;
  scope: "world" | "company" | "community";
  companyId?: string;
  companyName?: string;
  communityId?: string;
  communityName?: string;
  type: "post" | "question" | "announcement" | "poll" | "event";
  text: string;
  title?: string;
  requiresReadReceipt?: boolean;
  acceptedCommentId?: string;
  isResolved?: boolean;
  resolvedAt?: string;
  resolvedByUid?: string;
  attachments?: Attachment[];
  reactionCount?: number;
  commentCount?: number;
  liked?: boolean;
  hasRead?: boolean;
  createdAt?: string;
  deletedByAdmin?: boolean;
  deletedAt?: string;
  deletedByUid?: string;
  pollOptions?: PollOption[];
  pollTotalVotes?: number;
  myPollOptionId?: string;
  eventStart?: string;
  eventEnd?: string;
  eventLocation?: string;
  eventTimeZone?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorUid: string;
  authorName?: string;
  authorAvatarMediaId?: string;
  text: string;
  createdAt?: string;
}

export interface Member {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
}

export interface BootstrapData {
  me: UserProfile;
  companies: Company[];
  selectedCompanyId: string;
  company: Company | null;
  role: string | null;
  canAdmin: boolean;
  isSuperadmin: boolean;
  communities: Community[];
  communityMap: Record<string, Community>;
  posts: Post[];
  worldPosts: Post[];
  notifications: NotificationItem[];
  allCompanyCommunities: Community[];
  members: Member[];
}
