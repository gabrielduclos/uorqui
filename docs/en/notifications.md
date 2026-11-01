# Notifications in Uorqui

The app provides an authenticated activity inbox with unread badges and actions to mark one or all items as read.

Recorded events: post likes and comments, new followers, friend requests, and accepted requests. Self-actions do not notify. Repeated likes and follows do not create duplicate activity records. Blocked accounts cannot create or expose activity between each other.

Tapping post activity opens the related feed post; other activity opens the actor profile. History and read state are stored in PostgreSQL. Authenticated real-time events update the UI, with periodic polling as a fallback.

## Web Push

Activity notifications reuse the existing VAPID keys, account-bound subscriptions and service worker already used for messaging. Delivery requires the user's permission. On iOS, users must install the PWA to their Home Screen and grant permission. Push is best-effort; the activity remains in the inbox if delivery fails.

Apply the `0027_activity_notifications.sql` migration to the intended database before enabling the feature in production. Push payloads do not include private post content, and activity notifications do not send emails.
