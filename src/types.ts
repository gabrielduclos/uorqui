export type View = "home" | "communities" | "search" | "admin" | "profile" | "notifications" | "companies";
export type HomeTab = "for-you" | "recent" | "announcement" | "world";

export interface UserProfile {
  uid: string;
  email?: string;
  displayName?: string;
  username?: string;
  bio?: string;
  avatarMediaId?: string;
}

export interface Company {
  id: string;
  name: string;
  role?: string;
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
  type: "post" | "question" | "announcement";
  text: string;
  title?: string;
  requiresReadReceipt?: boolean;
  acceptedCommentId?: string;
  attachments?: Attachment[];
  reactionCount?: number;
  commentCount?: number;
  liked?: boolean;
  hasRead?: boolean;
  createdAt?: string;
  deletedByAdmin?: boolean;
  deletedAt?: string;
  deletedByUid?: string;
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
  communities: Community[];
  communityMap: Record<string, Community>;
  posts: Post[];
  worldPosts: Post[];
  notifications: NotificationItem[];
  allCompanyCommunities: Community[];
  members: Member[];
}
