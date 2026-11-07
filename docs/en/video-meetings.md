# Voice rooms and audio/video meetings

Updated **November 7, 2026** for technical beta `0.1.0-beta.12`.

Uorqui has **text**, **voice**, and **meeting** community channels. Joining a call is an explicit action: simply opening a room never enables the microphone or camera.

## Interface behavior

- The mobile main menu appears **above** active audio/video call surfaces (including the fullscreen meeting) and keeps WebRTC mounted when opened. The drawer follows the visible viewport and current workspace theme.
- The participant card keeps connection progress/failure on a dedicated line **below** the handle so short cards never cover `@username`.

- **Text chat starts collapsed by default** in both voice and meeting rooms. Users can expand/collapse it without disconnecting.
- Voice content and the text panel adapt to phone and desktop layouts. Active calls can be minimized inside Uorqui without unmounting the WebRTC component.
- Participants can toggle their camera and microphone. Audio-only joining is supported if camera acquisition fails.
- A **speaking participant's camera** is highlighted based on detected audio activity. **Fullscreen** shows the highlighted camera as the main view and, when available, the user's own camera as a small picture-in-picture overlay.
- Participants can **pin a different camera**, navigate thumbnails, and return to automatic speaker focus. A shared screen may occupy the main view.
- **Share screen** is available in both voice and meeting channels, using browser `getDisplayMedia`; it can coexist with a live camera. The button is disabled when the API is unavailable. Mobile and installed-PWA support varies by OS/browser.
- Fullscreen retains microphone, camera, sharing, leave-call and exit-fullscreen controls.
- The **Invite** action in the meeting room and the channel header opens the **same invitation dialog**. A temporary link joins the community and opens that exact channel/meeting, either by copying or Uorqui 1:1 DM; access checks remain mandatory.

## Admission and authorization

- Community owners/admins set **Direct entry** or **Approval required** for each meeting.
- The API rejects unauthorized WebRTC joins; admins approve or decline individual requests.
- **Community membership**, **channel password access**, and **meeting admission** are separate server-enforced checks.
- Community membership and meeting requests notify administrators through the notification inbox and Web Push when enabled.
- Community approval publishes an account-targeted SSE event, so the applicant's community list and detail update without a reload; the client resubscribes to include the newly joined community.

## Channel administration

- No Edit action is shown in channel headers. Owners/admins change names, pinned descriptions, passwords and access rules in **Moderation → Channels**. Each channel can display a persistent description/rules section (up to 4,000 characters) with **Read more / Show less** for longer text. New channels suggest editable, per-type numbered names.
- In **Moderation → Members**, owners/admins select which closed channels each person can access. Channel permission, password and meeting admission remain independent. Revoking closed-channel access disconnects active RTC sessions; see [Channel permissions](channel-permissions.md).
- **Delete channel** remains under community moderation.
- Passwords use salted scrypt hashes; rotation revokes previous grants, and incorrect attempts are rate-limited.

## Architecture and limitations

- Calls use a **six-person peer-to-peer WebRTC mesh** with Fastify signaling and Neon PostgreSQL sessions. The application does not record meeting audio/video.
- Screen capture and camera controls require browser support and permissions. TURN relay, cross-network reliability, Android/iOS browsers and installed-PWA behavior **still need real-device testing**.
- Versioned migrations `0030`–`0032` introduced meeting channels, admission and password protection. Historic migrations must be retained even when features are retired.
- Passing TypeScript, build and API integration checks does not certify a live multi-device call.
