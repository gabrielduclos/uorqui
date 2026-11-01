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
