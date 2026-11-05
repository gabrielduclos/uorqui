# Notifications in Uorqui

The app provides an authenticated activity inbox with unread badges and actions to mark one or all items as read.

Recorded events: post likes and comments, new followers, friend requests, and accepted requests. Self-actions do not notify. Repeated likes and follows do not create duplicate activity records. Blocked accounts cannot create or expose activity between each other.

Tapping post activity opens the related feed post; other activity opens the actor profile. History and read state are stored in PostgreSQL. Authenticated real-time events update the UI, with periodic polling as a fallback.

## Web Push

Activity notifications reuse the existing VAPID keys, account-bound subscriptions and service worker already used for messaging. Delivery requires the user's permission. On iOS, users must install the PWA to their Home Screen and grant permission. Push is best-effort; the activity remains in the inbox if delivery fails.

Apply the `0027_activity_notifications.sql` migration to the intended database before enabling the feature in production. Push payloads do not include private post content, and activity notifications do not send emails.

## Individual push settings

A **Settings** button at the top right of the notification inbox opens a separate view with a back action. The global header bell and the permission request in the inbox have been removed.

Users can independently enable/disable seven categories: direct messages, community messages, likes, comments, friend requests, accepted friend requests, and new followers. **Enable all** and **Disable all** are available, along with a separate device-level push permission control.

Settings are stored per account in `notification_preferences` and **enforced on the server** before push sends (including direct and community messages). Disabling push does not hide an activity from the inbox. All categories default to enabled. Apply `0028_notification_preferences.sql` to production only after explicit approval.

## Android notification status-bar icon

The full notification retains the color PWA icon, `icon-192.png`. The small **Android status-bar glyph** uses `notification-badge.png` instead: a 72 × 72 px white-on-transparent PNG showing the U monogram inside a chat bubble. Its vector source is `notification-badge.svg`. Avoid using the colored launcher icon as the notification `badge`: Android converts it into a monochrome silhouette.

After deployment, reopen the installed PWA to update its service worker and receive a new push on a physical Android device to verify the result. Exact appearance varies with Android and browser versions.

## Email notifications

New Gmail and manual IMAP messages use the same account-bound VAPID push subscription; legacy connected Outlook accounts remain eligible. The **New emails** switch controls `notification_preferences.email_message` (migration `0037_mail_push.sql`). Push shows sender and subject, never the full body, and opens the connected message. The initial mailbox scan is silent to prevent an old-email flood, and delivery may be delayed when the API host is asleep.

## Deep links and in-app alerts

Tapping an operating-system push navigates the PWA directly to the persistent link for its conversation, channel, message, or activity; unlike a post-focus message, URL navigation survives suspended iOS apps. Community links retain the actual channel ID and never auto-join voice rooms; invitations open Notifications. Activity links open the associated request or profile after authenticated data loads.

While the app is **visible**, DM SSE updates, newly unread community channels, invitations, and activity items create temporary clickable in-app alerts only when their module is not currently active. A foreground Web Push is forwarded into this in-app UI instead of displaying a duplicate operating-system alert. Background/system push remains unchanged. Alerts are dismissible and capped at three; unread counters are unaffected.
