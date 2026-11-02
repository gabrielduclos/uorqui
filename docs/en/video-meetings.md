# Community audio/video meetings

Uorqui adds **Meeting** channels beside existing text channels and voice rooms.

## Features
- Community admins may create a **Meeting (audio and video)** channel.
- Joining is an explicit action with microphone/camera permissions. Camera on/off controls are available during the call, with audio-only fallback if camera capture fails.
- Calls use the existing WebRTC peer-to-peer mesh with a **six-person limit**. The application does not record or persist meeting audio/video.
- The video meeting prioritizes the camera grid on mobile and desktop; in-room text can be expanded as needed.
- **Invite** copies a meeting URL or sends it to an @handle via Uorqui DM. The current community invite token is reused when present; an administrator may generate one. Nonmembers must first join the community.

## Admission rules
- Community owners/admins choose **Direct entry** or **Approval required**.
- Under approval mode, the API rejects unauthorized WebRTC joins. Members request access, and admins can approve/decline from the room.
- Community membership and meeting approval remain distinct: a shareable invite link never overrides meeting admission.
- Community membership requests and meeting access requests create admin inbox notifications and Web Push alerts when enabled. Configure the category via **Notifications > Settings**.
- API authorization checks session identity, community membership, channel access, meeting approval and relevant blocks/bans.

## Technical notes
The Fastify API reuses WebRTC signaling and sessions in Neon PostgreSQL. **Released in the technical beta on November 2, 2026.** Migrations `0030`–`0032` cover meeting channels, admission, notifications and password protection. All 33 migrations are recorded in production, the code passed GitHub integration tests, and the read-only live smoke suite passed all five checks against Render and Cloudflare. This does not constitute a real-device WebRTC media test.

**Limitations:** Six-person P2P scaling, TURN relay readiness, camera permissions and iOS/Android installed-PWA behavior require real-device and cross-network validation.

## Password-protected channels

Community owners and admins can set, change or remove a password from **Community moderation > Manage channels** for text, voice and meeting channels. Passwords are salted and scrypt-hashed; ordinary members unlock each channel on their own account. Changing the password revokes old grants. Failed attempts are rate-limited. Community membership and meeting approval still apply independently.
