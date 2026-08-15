# API Spec — Backend work needed for mobile features

This file documents backend/API changes required to support features already
implemented on the mobile client (React Native / Expo). Each dated section
below corresponds to one proposal from La Forge. The mobile app currently
uses mock/placeholder behavior (or silently no-ops) until the backend ships
the described contract.

---

## 2026-08-15 — Ville sur le profil ("pouvoir ajouter sa ville comme twitter")

**Mobile changes (already shipped in this branch):**
- `EditProfileScreen`: new "Ville" text field (max 30 chars), submitted as
  part of the existing profile update call.
- `ProfileScreen` / `UserProfileScreen`: the city, when set, is displayed
  with a location-pin icon next to the existing "joined" metadata line
  (matches the Twitter/X pattern: location first, then join date).
- Client-side `User` type (`src/types/api.ts`, `src/contexts/AuthContext.tsx`,
  and the local `UserProfile` type in `src/screens/UserProfileScreen.tsx`)
  now declare an **optional** `city?: string | null` field. Until the backend
  returns it, this is simply `undefined` and the UI hides the location row.

**Backend work needed:**

1. **`PUT /api/auth/profile`** (existing route, used by `EditProfileScreen`
   to save profile edits)
   - Request body: accept an additional optional field
     ```json
     { "city": "Lyon" }
     ```
     alongside the existing `full_name`, `username`, `bio` fields.
   - Validation: optional string, trim, max length **30 characters**. Accept
     empty string `""` to mean "clear the city" (same convention already
     used for `bio` in this endpoint).
   - Response: the updated `User` object must include the new `city` field
     (see shape below).

2. **`GET /api/auth/me`** (existing route, used to load the current user)
   - Response `User` object must include `city: string | null`.

3. **`GET` user profile routes** (existing routes used by
   `UserProfileScreen` to view another user's profile):
   - Whatever route(s) back `apiService.getUserProfile(userId)` and
     `apiService.getUserProfileByUsername(username)` must also include
     `city: string | null` in their response's `user` object.

4. **DB model change:** add a `city` column to the `users` table:
   - Type: `VARCHAR(30)`, nullable, default `NULL`.
   - No uniqueness constraint, no index needed (not searchable/filterable
     for now).

5. **Auth/permission notes:**
   - `city` is a public profile field (visible to anyone who can view the
     profile already, same visibility rules as `bio` — respects the
     existing private-account visibility logic, no new permission needed).
   - Only the profile owner can set their own `city`, via the existing
     `PUT /api/auth/profile` auth (bearer token identifies the user; no new
     auth logic required, reuse whatever currently guards `bio`/`full_name`
     updates on that route).
   - Do **not** confuse this with the existing `location_consent_status` /
     `location_consent_updated_at` fields — those are GPS/geolocation
     consent flags for a different feature and are untouched by this
     change.
