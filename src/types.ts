export type View = "home" | "communities" | "search" | "jobs" | "admin" | "company-data" | "profile" | "notifications" | "companies" | "plans" | "superadmin";
export type HomeTab = "for-you" | "communities" | "world" | "recent";

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
  jobs: number | null;
}

export interface CompanyAddress {
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

export interface CompanyAdministrator {
  uid: string;
  displayName?: string;
  email?: string;
}

export interface Company {
  id: string;
  name: string;
  cnpj?: string;
  address?: CompanyAddress;
  administrators?: CompanyAdministrator[];
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
  visibility?: "public" | "private";
  memberCount?: number;
  verifiedCompany?: boolean;
  createdBy?: string;
}

export interface CommunityTopic {
  id: string;
  communityId: string;
  companyId?: string;
  name: string;
  description?: string;
  kind?: "topic" | "sector";
  createdBy?: string;
  createdAt?: string;
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

export interface JobOpening {
  id: string;
  companyId: string;
  companyName: string;
  authorUid: string;
  authorName?: string;
  title: string;
  description: string;
  location?: string;
  contractType?: "clt" | "pj" | "internship" | "temporary" | "other";
  contactEmail?: string;
  audience: "company" | "world";
  status: "open" | "closed";
  createdAt?: string;
  updatedAt?: string;
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
  communityVisibility?: "public" | "private";
  topicId?: string;
  topicName?: string;
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
  lastCommentAt?: string;
  followUpReminderFor?: string;
  followUpReminderAt?: string;
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
  updatedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorUid: string;
  authorName?: string;
  authorAvatarMediaId?: string;
  text: string;
  attachments?: Attachment[];
  reactionCount?: number;
  liked?: boolean;
  createdAt?: string;
  updatedAt?: string;
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
