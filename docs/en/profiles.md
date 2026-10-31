# User profiles — Uorqui

## MVP scope

Profiles use the existing Better Auth session, Neon PostgreSQL and the `users`/`profiles` tables. This adds authenticated editing, a public `/@username` page, discovery, and visibility controls.

### Your profile
- Display name, unique lowercase username (3–32 characters), bio up to 500 characters.
- Avatar and cover through **HTTPS image URLs**. Direct uploads use private Cloudflare R2 storage with client-side crop and compression.
- Public profile toggle: when disabled, the user is excluded from search and the public page returns 404. The owner can still edit through My Profile.
- Server-side validation, permission checks and transactional updates.

### Public profile
- Route `/@username`, accessible without signing in.
- Shows public display name, handle, bio, image links, and join date.
- Never returns email or authentication data.
- The Message action stays disabled until real messaging is connected. Public posts are still under development.

### User discovery
- `GET /api/v1/profiles/search?q=term`, at least 2 characters, maximum 15 public results.
- Search results link to the person's profile.

## API
| Method | Route | Visibility |
| --- | --- | --- |
| GET | `/api/v1/me` | Authenticated owner, includes private profile |
| PATCH | `/api/v1/me/profile` | Authenticated, owner-only |
| GET | `/api/v1/profiles/:handle` | Public profiles only |
| GET | `/api/v1/profiles/search?q=` | Public profiles only, no email |

## Database and deployment

Drizzle migration `0002_profile_visibility_media` adds `avatar_url`, `cover_url` and `is_public` (default TRUE). Apply the migration **before** deploying the API/frontend changes to prevent missing-column errors. The UI kit remains documentation-only.


## Profile photos and Cloudflare R2

- Dedicated new private bucket: `uorqui-profile-media`; do not reuse legacy media buckets.
- Worker binding: `PROFILE_MEDIA`. `POST /api/media/profile/avatar` and `POST /api/media/profile/cover` upload processed WebP/JPEG/PNG images up to 3 MB; `DELETE` removes them.
- Client-side cropper outputs 640×640 avatars and 1440×480 covers, preferring WebP compression.
- Session authorization and profile persistence remain in Fastify and Neon; only metadata references live in Postgres, not images.
- All reads through `/media/profile/{id}/{avatar|cover}/{asset}.{ext}` are authorized against the current DB record and its public/private state. Revoked images are no longer served.
- Keep the R2 bucket private, with no public domain or shared cache.
- Production requires the Cloudflare Worker R2 binding; failures must show an error.
- Existing external HTTPS links are supported for backwards compatibility.


### Session image caching

Profile avatars and cover images stored in private R2 are reused through a **bounded in-memory cache** in the current browser tab (up to 48 images, with a 5-minute expiry check). This stops repeated downloads and visual flashing when navigating between conversations, user lists, and profile pages. The cache does not persist in Cache Storage, IndexedDB, localStorage, or a public CDN. The Worker continues authorizing each network request, with `no-store` HTTP headers. Clear cached images on logout, image replacement/removal and when the owner changes profile visibility. This safety-first policy applies to R2 profile images; the future chat attachments pipeline will need its own cache rules.

## Later
Media safety, legacy external image privacy and real DM integration.
