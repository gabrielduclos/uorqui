# User profiles — Uorqui

## MVP scope

Profiles use the existing Better Auth session, Neon PostgreSQL and the `users`/`profiles` tables. This adds authenticated editing, a public `/@username` page, discovery, and visibility controls.

### Your profile
- Display name, unique lowercase username (3–32 characters), bio up to 500 characters.
- Avatar and cover through **HTTPS image URLs**. Native binary uploads require dedicated media storage and are not implemented yet.
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

## Later
Image uploads and optimization (R2 or equivalent), media safety, external image privacy and real DM integration.
