# TASK.md - Multi-User System Architecture Plan

## Overview

Design a multi-user architecture for the Relay/Claude system that supports isolated user workspaces while allowing administrative access. The system currently has one user (`a28m2t2xu8go4a0qgblz7xxze`) and needs to add a second user (`xfg6gb`) with their own projects folder, shared SSH keys, and appropriate access controls. This is a **planning-only task** - no implementation or system changes should be made.

## User Story

As a system administrator
I want to add a second user with isolated project access but shared credentials
So that multiple users can work independently while I maintain administrative oversight of all projects

## Requirements

### User Configuration
- [ ] Define user identity system for `xfg6gb` (new user)
- [ ] Define admin privileges for `a28m2t2xu8go4a0qgblz7xxze` (existing user)
- [ ] Both users share the same SSH private/public key pair
- [ ] Both users have identical system rights/permissions

### Project Isolation
- [ ] New user `xfg6gb` has dedicated projects folder: `/opt/clawd/projects/xfg6gb/` (or similar)
- [ ] New user `xfg6gb` can **only** see their own projects in Relay UI
- [ ] Admin user `a28m2t2xu8go4a0qgblz7xxze` can see **both** their own projects and `xfg6gb` projects
- [ ] Each user's projects remain logically separated on disk

### Relay UI Integration
- [ ] Relay project selector filters projects by current user
- [ ] Admin user sees all projects (both users' folders)
- [ ] Regular user sees only their own projects
- [ ] Clear visual indication of which user context is active

## Acceptance Criteria

- [ ] Architecture plan addresses user authentication/identification
- [ ] Plan explains how project folders are organized and scoped per user
- [ ] Plan describes Relay UI changes needed for project filtering
- [ ] Plan identifies which files/components need modification (config, auth, UI)
- [ ] Plan considers edge cases (user switching, session persistence, access violations)
- [ ] Plan evaluates feasibility and complexity (high/medium/low effort)
- [ ] No code is written or system changes are made (planning phase only)

## Technical Considerations

### Current System State
- **Existing user:** `a28m2t2xu8go4a0qgblz7xxze` (25-character username)
- **New user:** `xfg6gb` (6-character username)
- **Projects location:** `/opt/clawd/projects/`
- **Relay server:** Runs on port 7786
- **Authentication:** SSH key-based (shared between users)

### Key Questions to Address

1. **User Identity Storage**
   - Where is the current user stored? (Environment variable, config file, session?)
   - How does Relay know which user is active?
   - Options: ENV var (`RELAY_USER`), config file (`relay/config.py`), session cookie, URL parameter

2. **Project Discovery & Filtering**
   - Current: Relay scans `/opt/clawd/projects/` for all folders
   - Required: Filter by user OR show all for admin
   - Files likely involved: `relay/config.py`, `relay/api_handlers.py` (project list endpoint)

3. **Access Control Model**
   - Admin flag: How to mark `a28m2t2xu8go4a0qgblz7xxze` as admin?
   - Permission check: Where to enforce "user can only see their projects"?
   - Options: Role-based (admin/user), user whitelist, project ownership mapping

4. **User Switching**
   - Do users share the same OS account or separate accounts?
   - If same OS account: How to switch between Relay user contexts?
   - If separate OS accounts: Each runs own Relay instance on different ports?

5. **Session Management**
   - If users switch contexts in the same browser, how to persist identity?
   - localStorage, session cookies, or URL-based user context?

### Potential Approaches

**Option A: Environment Variable + Project Subdirectories**
- Set `RELAY_USER=xfg6gb` or `RELAY_USER=a28m2t2xu8go4a0qgblz7xxze` before starting Relay
- Projects organized: `/opt/clawd/projects/{username}/`
- Relay filters projects based on `RELAY_USER` env var
- Admin users bypass filter (hardcoded admin list in config)
- **Pros:** Simple, no UI auth needed
- **Cons:** Requires separate Relay instances per user (different env vars)

**Option B: User Selector in Relay UI**
- Add user dropdown in Relay interface (top bar)
- Projects organized: `/opt/clawd/projects/{username}/`
- API filters projects by selected user (stored in session/localStorage)
- Admin sees "All Users" option in dropdown
- **Pros:** Single Relay instance, easy switching
- **Cons:** No real authentication (honor system), session management complexity

**Option C: OS-Level User Accounts**
- Create separate Linux users: `relay-a28m2t2xu8go4a0qgblz7xxze` and `relay-xfg6gb`
- Each user runs Relay on different port (7786, 7787)
- Projects in each user's home directory or separate `/opt/clawd/projects-{username}/`
- **Pros:** True OS-level isolation
- **Cons:** More complex setup, port management, shared SSH key requires careful permissions

**Option D: Single User, Project Metadata Tags**
- Keep single OS user, add metadata file in each project: `.relay-owner`
- Relay reads metadata to determine project ownership
- UI filters based on metadata + admin flag
- **Pros:** Minimal system changes, flexible
- **Cons:** Requires metadata maintenance, no enforcement outside Relay

### Files Likely Requiring Changes

Based on Relay codebase structure:

1. **`relay/config.py`**
   - Add `CURRENT_USER` or `RELAY_USER` configuration
   - Add `ADMIN_USERS` list
   - Define user-to-projects-directory mapping

2. **`relay/api_handlers.py`**
   - Modify project discovery/listing endpoint
   - Add user-based filtering logic
   - Check admin status before showing all projects

3. **`relay/templates/index.html`**
   - Add user context indicator (top bar)
   - Optionally: user switcher dropdown (if Option B)

4. **`relay/templates/app.js`**
   - Filter project list based on current user
   - Handle user switching (if applicable)
   - Persist user selection in localStorage (if Option B)

5. **Environment/Deployment**
   - Systemd service file (if using env vars)
   - Startup scripts to set `RELAY_USER`
   - Documentation for user setup

### Edge Cases & Security Considerations

- **URL manipulation:** Can non-admin user force viewing other projects via API calls?
- **Session hijacking:** If using browser-based user switching, ensure session security
- **Shared SSH key:** Both users have same key - ensure file permissions prevent cross-user access at OS level
- **Project name collisions:** Can both users have a project named "test"? (Namespace by user folder)
- **Admin abuse:** Admin can see all projects - is this acceptable? (Yes, per requirements)

## Recommended Approach

**Hybrid: Environment Variable + Admin Override**

1. **User identification:** `RELAY_USER` environment variable set when starting Relay
2. **Project structure:** `/opt/clawd/projects/{username}/` subdirectories
3. **Admin list:** Hardcoded in `relay/config.py`: `ADMIN_USERS = ['a28m2t2xu8go4a0qgblz7xxze']`
4. **Filtering logic:**
   ```python
   if current_user in ADMIN_USERS:
       projects = scan_all_projects()
   else:
       projects = scan_projects_for_user(current_user)
   ```
5. **Deployment:** Separate systemd service files or startup scripts per user

**Pros:**
- Simple, robust, no browser-based auth complexity
- Clear OS-level separation (different processes)
- Admin override is straightforward
- Shared SSH key works (both processes run as same OS user)

**Cons:**
- Requires running two Relay instances (different ports or different machines)
- Cannot switch users without restarting Relay

## Next Steps (After Plan Approval)

1. Review this plan with stakeholders
2. Choose preferred approach (recommend Hybrid)
3. Create detailed implementation checklist
4. Identify testing strategy (user A sees only their projects, admin sees all)
5. Document user onboarding process
6. Execute implementation (code changes, testing, deployment)

## Feasibility Assessment

**Overall Feasibility:** ✅ **Highly Viable**

- **Effort Estimate:** Medium (2-4 hours implementation + testing)
- **Risk Level:** Low - changes are localized to config and project filtering
- **Breaking Changes:** Minimal - existing user's projects move to subdirectory
- **Rollback Plan:** Restore original `/opt/clawd/projects/` flat structure

This architecture is feasible and aligns well with the stated requirements. The main implementation work is adding user-aware project filtering and organizing projects into user-specific subdirectories.
