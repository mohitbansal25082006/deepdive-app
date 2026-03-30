// src/types/social.ts
// DeepDive AI — Part 36: Social & Discovery type definitions

// ─── Public Profile ───────────────────────────────────────────────────────────

export interface PublicUserProfile {
  id:             string;
  username:       string | null;
  full_name:      string | null;
  avatar_url:     string | null;
  bio:            string | null;
  occupation:     string | null;
  interests:      string[] | null;
  is_public:      boolean;
  follower_count:  number;
  following_count: number;
  /** Count of active share links (published reports) */
  public_reports:  number;
  /** Sum of view_count across all active share links */
  total_views:     number;
  /** Is the currently-authenticated user following this profile? */
  is_following:    boolean;
  /** Is the viewer viewing their own profile? */
  is_own_profile:  boolean;
}

// ─── Follow List ──────────────────────────────────────────────────────────────

export interface FollowListItem {
  id:           string;
  username:     string | null;
  full_name:    string | null;
  avatar_url:   string | null;
  bio:          string | null;
  joined_at:    string;        // when the follow relationship was created
  is_following: boolean;       // does the current viewer follow this person?
}

// ─── Public Profile Report Card ───────────────────────────────────────────────

export interface PublicProfileReport {
  share_id:          string;
  title:             string;
  query:             string;
  depth:             'quick' | 'deep' | 'expert';
  executive_summary: string;
  tags:              string[];
  sources_count:     number;
  reliability_score: number;
  view_count:        number;
  share_count:       number;
  created_at:        string;
  completed_at:      string | null;
}

// ─── Following Feed ───────────────────────────────────────────────────────────

export interface FeedItem {
  share_id:          string;
  report_id:         string;
  title:             string;
  query:             string;
  depth:             'quick' | 'deep' | 'expert';
  executive_summary: string;
  tags:              string[];
  sources_count:     number;
  reliability_score: number;
  view_count:        number;
  published_at:      string;   // when the share link was created (first published)
  author_id:         string;
  author_username:   string | null;
  author_full_name:  string | null;
  author_avatar_url: string | null;
}

// ─── Follow Notification ─────────────────────────────────────────────────────

export type FollowNotificationType = 'new_follower' | 'new_report';

export interface FollowNotification {
  id:               string;
  type:             FollowNotificationType;
  read:             boolean;
  created_at:       string;
  report_id:        string | null;
  actor_id:         string;
  actor_username:   string | null;
  actor_full_name:  string | null;
  actor_avatar_url: string | null;
  report_title:     string | null;
}

// ─── Social Stats ─────────────────────────────────────────────────────────────

export interface SocialStats {
  follower_count:       number;
  following_count:      number;
  public_reports_count: number;
  total_views:          number;
}

// ─── Hook State ───────────────────────────────────────────────────────────────

export interface FollowState {
  isFollowing:   boolean;
  isLoading:     boolean;
  followerCount: number;
}

export interface SocialNotifState {
  notifications: FollowNotification[];
  unreadCount:   number;
  isLoading:     boolean;
}

export interface FeedState {
  items:        FeedItem[];
  isLoading:    boolean;
  isRefreshing: boolean;
  hasMore:      boolean;
  hasNew:       boolean;
}