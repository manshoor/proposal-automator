# Prompt Admin System — Design Spec

**Date:** 2026-04-08
**Problem:** The system prompt controlling proposal quality is hardcoded in `backend/prompts/proposal.js`. Iterating on it requires code changes and redeployment. As this becomes a SaaS product, each user needs the ability to customize their prompts, and an admin needs to control the global default.
**Goal:** Move the system prompt to the database with a 3-tier hierarchy: user override > admin master > hardcoded fallback. Add role-based access control.

---

## Prompt Hierarchy

Resolution order when generating a proposal:

1. **User's system prompt** — user has an active `type='system'` prompt for this platform → use as the base system prompt
2. **Admin's master prompt** — a global `type='system'` prompt with `is_global=true` → use as base for users without their own
3. **Hardcoded fallback** — `buildSystemPrompt()` in `proposal.js` → ultimate fallback (always works even if DB is empty)

After resolving the base system prompt, custom instructions are appended:
4. **User's custom prompt** — active `type='custom'` prompt → appended as `--- CUSTOM INSTRUCTIONS ---` (existing behavior, unchanged)

Profile data (name, skills, experience, etc.) is always injected by code into whichever base prompt is used.

---

## Database Changes

### Migration: Add role to users

```sql
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user';
-- Set the first user (or a specific email) as admin
UPDATE users SET role = 'admin' WHERE email = '<admin-email>' LIMIT 1;
```

Values: `'user'`, `'admin'`

### Migration: Add type and is_global to prompts

```sql
ALTER TABLE prompts ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'custom';
ALTER TABLE prompts ADD COLUMN is_global BOOLEAN NOT NULL DEFAULT FALSE;
```

- `type = 'system'` — Full system prompt that replaces the hardcoded one
- `type = 'custom'` — Custom instructions appended to system prompt (existing behavior)
- `is_global = true` — Admin's master prompt, visible to all users as fallback

Existing prompts keep `type='custom'` and `is_global=false` — zero disruption.

### Seed admin's master prompt

Insert a `type='system', is_global=true` prompt with the current hardcoded system prompt text from `proposal.js`. This makes the current behavior reproducible from the database.

---

## Backend Changes

### 1. Admin middleware — `backend/middleware/auth.js`

Add `requireAdmin(req, res, next)`:
- Checks `req.user.role === 'admin'`
- Throws `AuthorizationError` (403) if not admin
- Must run after `authenticate` or `optionalAuth`

Update `authenticate` and `optionalAuth` to also set `req.user.role` from the JWT payload or from a DB lookup.

### 2. Auth service — include role in JWT

When generating access tokens (`auth.service.js`), include `role` in the JWT payload:
```js
{ sub: user.id, email: user.email, role: user.role }
```

When verifying tokens, set `req.user.role` from the payload.

### 3. Prompt resolution — `backend/services/proposal.service.js`

Replace the current system prompt building logic:

```js
// Current:
let systemPrompt = buildSystemPrompt(profile);
if (customPrompt) {
  systemPrompt += '\n\n--- CUSTOM INSTRUCTIONS ---\n' + customPrompt.prompt_text;
}

// New:
let systemPrompt;

// Try user's own system prompt
const userSystemPrompt = await promptRepo.findActiveByType('system', platform, userId);
if (userSystemPrompt) {
  systemPrompt = injectProfileData(userSystemPrompt.prompt_text, profile);
} else {
  // Try admin's global master prompt
  const globalPrompt = await promptRepo.findGlobalByType('system', platform);
  if (globalPrompt) {
    systemPrompt = injectProfileData(globalPrompt.prompt_text, profile);
  } else {
    // Hardcoded fallback
    systemPrompt = buildSystemPrompt(profile);
  }
}

// Append custom instructions (type='custom') — unchanged
const customPrompt = await promptRepo.findActiveByType('custom', platform, userId);
if (customPrompt) {
  systemPrompt += '\n\n--- CUSTOM INSTRUCTIONS ---\n' + customPrompt.prompt_text;
}
```

### 4. Profile data injection helper

Add `injectProfileData(promptText, profile)` to `backend/prompts/proposal.js`:
- Replaces `{profile.full_name}`, `{profile.title}`, `{profile.skills}`, etc. in the prompt text
- Falls back to empty string if placeholder has no value
- This lets admin/user prompts reference profile data via placeholders

### 5. Prompt repository — new query functions

Add to `backend/repositories/prompt.repository.js`:
- `findActiveByType(type, platform, userId)` — finds user's active prompt of given type for platform
- `findGlobalByType(type, platform)` — finds global (`is_global=true`) active prompt of type for platform
- `findAllGlobal()` — admin endpoint: list all global prompts

### 6. Admin API — `backend/api/admin.js`

New router, mounted at `/api/v1/admin` with `requireAdmin` middleware:

- `GET /prompts` — List all global prompts
- `POST /prompts` — Create global prompt (sets `is_global=true`)
- `PUT /prompts/:id` — Update global prompt
- `DELETE /prompts/:id` — Delete global prompt
- `GET /users` — List all users (admin view)
- `PUT /users/:id/role` — Change user role

### 7. Route registration — `backend/routes/v1/index.js`

- Import admin router
- Mount: `router.use('/admin', authenticate, requireAdmin, adminRouter)`

---

## Dashboard Changes

### 1. Admin prompt editor page — `dashboard/app/admin/prompts/page.js`

- Only accessible to admin users (check role from auth context)
- Full-screen prompt editor with the master system prompt
- Shows available placeholder variables: `{profile.full_name}`, `{profile.title}`, `{profile.skills}`, `{profile.experience}`, `{profile.portfolio}`, `{profile.default_hourly_rate}`
- Platform selector (upwork, fiverr, all, etc.)
- Save button → `PUT /api/v1/admin/prompts/:id`
- "Reset to Default" button → restores the hardcoded prompt text

### 2. Enhanced user prompts page — `dashboard/app/prompts/page.js`

Add a toggle or tab: "System Prompt Override" vs "Custom Instructions"
- **System Prompt Override** (type='system'): Full editor where user can replace the master prompt with their own version
- **Custom Instructions** (type='custom'): Current behavior, append-only

### 3. Sidebar navigation — show "Admin" section only for admin users

- Check user role from localStorage or auth context
- Show "Admin > Prompts" menu item only for admin users

### 4. Admin user management page — `dashboard/app/admin/users/page.js`

- List all users (email, role, created_at)
- Dropdown to change role (user/admin)
- Simple table with inline role editing

---

## Files to Create/Modify

| # | File | Action | Change |
|---|------|--------|--------|
| 1 | `backend/db/migrations/011_prompt_admin.sql` | Create | Add `role` to users, `type`+`is_global` to prompts, seed master prompt |
| 2 | `backend/middleware/auth.js` | Modify | Add `requireAdmin`, include role in `req.user` |
| 3 | `backend/services/auth.service.js` | Modify | Include `role` in JWT payload |
| 4 | `backend/repositories/prompt.repository.js` | Modify | Add `findActiveByType`, `findGlobalByType`, `findAllGlobal` |
| 5 | `backend/prompts/proposal.js` | Modify | Add `injectProfileData()` helper |
| 6 | `backend/services/proposal.service.js` | Modify | New 3-tier prompt resolution logic |
| 7 | `backend/api/admin.js` | Create | Admin CRUD endpoints for prompts + users |
| 8 | `backend/routes/v1/index.js` | Modify | Mount admin router |
| 9 | `dashboard/app/admin/prompts/page.js` | Create | Admin prompt editor |
| 10 | `dashboard/app/admin/users/page.js` | Create | Admin user management |
| 11 | `dashboard/app/prompts/page.js` | Modify | Add system prompt override option |
| 12 | `dashboard/components/Sidebar.js` | Modify | Show admin section for admin users |

---

## Verification

1. **Migration:** Run migration → verify `role` column exists on users, `type`+`is_global` on prompts
2. **Admin access:** Login as admin → should see Admin menu. Login as user → should NOT see Admin menu.
3. **Master prompt edit:** Admin edits master prompt → all users without their own override should use the new master prompt
4. **User override:** User creates their own system prompt → proposals should use user's prompt, not admin's
5. **Fallback chain:** Delete all DB prompts → proposals should still work using hardcoded fallback
6. **Custom instructions:** Create a custom instruction prompt → should be appended to whichever system prompt is active
7. **Profile placeholders:** Use `{profile.skills}` in a prompt → should be replaced with actual user skills
8. **Role management:** Admin changes user role → user's access should update on next login
9. **Backwards compatibility:** Existing prompts (type='custom') should continue working exactly as before
