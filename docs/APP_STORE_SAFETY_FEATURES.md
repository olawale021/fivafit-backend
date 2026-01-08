# App Store Guideline 1.2 - Safety Features Documentation

This document outlines the user-generated content safety features implemented for Apple App Store compliance.

---

## 1. EULA Acceptance Flow

**Scenario:** New user signs up or existing user logs in after update

### What happens:
1. User taps "Sign in with Google" or "Sign in with Apple"
2. After OAuth completes, app checks: "Has this user accepted EULA version 1.0?"
3. If **NO** → User sees full-screen EULA with terms
   - User taps "I Agree" → Recorded in database, proceeds to app
   - User taps "Decline" → Logged out immediately
4. If **YES** → User goes straight to the app

### Behind the scenes:
- Database stores `user_eula_acceptances` with user_id, version, timestamp
- When EULA version changes (e.g., 1.0 → 2.0), all users must accept again

---

## 2. Block User Flow

**Scenario:** User sees offensive content from @toxic_user in their feed

### From Feed (three dots menu):
1. User taps `⋯` next to @toxic_user's post
2. ActionSheet appears: "Block User" | "Report Post" | "Cancel"
3. User taps "Block User"
4. Confirmation: "Are you sure you want to block @toxic_user?"
5. User confirms →
   - @toxic_user is blocked in database
   - @toxic_user is automatically unfollowed
   - All of @toxic_user's posts **instantly disappear** from feed
   - Alert: "Blocked. @toxic_user has been blocked."

### From Profile:
1. User visits @toxic_user's profile
2. Taps `⋯` in header
3. Same flow as above

### What blocked users experience:
- They can't see your posts in their feed
- They can't follow you
- They don't know they're blocked

### Managing blocks:
- Settings → Blocked Users → See list → Tap "Unblock" to reverse

---

## 3. Report Content Flow

**Scenario:** User sees harassment in a post or comment

### Reporting a Post:
1. User taps `⋯` on the offensive post
2. Taps "Report Post"
3. Report sheet slides up with options:
   - Spam
   - Harassment
   - Hate Speech
   - Violence
   - Nudity
   - Self-Harm
   - Impersonation
   - Other
4. User selects "Harassment"
5. Optionally adds details: "This user is targeting me with threats"
6. Taps "Submit Report"
7. **Automatically blocks the user** (their posts vanish)
8. Alert: "Report Submitted. The user has been blocked."

### What happens on your end (developer):
Email sent instantly to info@stepmode.app:

```
Subject: [URGENT] Content Report: harassment

Report ID: rpt_abc123
Type: Post Report
Reporter: @victim_user (user-id-123)
Reported User: @toxic_user (user-id-456)
Post ID: post-789

Reason: harassment
Description: This user is targeting me with threats

Submitted: January 8, 2026, 3:45 PM

⚠️ Action required within 24 hours per App Store guidelines.
```

---

## 4. Content Filtering Flow

**Scenario:** User tries to post something with banned content

### How it works:
1. User completes workout, writes caption with inappropriate content
2. Taps "Share"
3. Backend sends content to **OpenAI Moderation API**
4. OpenAI checks for:
   - Hate speech & threatening hate
   - Harassment & threatening harassment
   - Self-harm content, intent & instructions
   - Sexual content & content involving minors
   - Violence & graphic violence
5. If flagged → Post blocked
6. User sees: "Heads Up - Your content contains language that violates our community guidelines. Please revise and try again."
7. User must edit content to post

### Content checked:
- Post captions
- Comments on posts
- Profile bio updates
- Username selection

### Fallback keyword filtering:
If OpenAI API fails, falls back to keyword-based filtering:
- Stored in `content_filter_keywords` table
- Each has severity: low, moderate, high
- Can be exact match or contains match
- Cached for 5 minutes to avoid DB spam

---

## Real User Journey Example

### Day 1: Sarah downloads StepMode
1. Signs up with Apple ID
2. Sees EULA → Accepts → Enters app
3. Completes workout, tries to post inappropriate caption
4. Gets "Heads Up" warning, changes caption
5. Post goes live

### Day 3: Sarah encounters a troll
1. @troll123 comments "You're fat and ugly" on her post
2. Sarah taps the comment, selects "Report"
3. Chooses "Harassment", submits
4. @troll123 is blocked, comment disappears from her view
5. Developer receives email about the report
6. Developer reviews and can ban @troll123's account if warranted

### Day 5: Sarah checks her blocks
1. Settings → Blocked Users
2. Sees @troll123 in list
3. Decides to keep them blocked

---

## Apple's Verification Checklist

When Apple reviews your app, they'll likely test:

| Test | Expected Result |
|------|-----------------|
| Create account | Must see EULA |
| Try posting offensive word | Must get blocked |
| Report another user | Must work and notify developer |
| Block a user | Their content must vanish immediately |

---

## Technical Implementation

### Database Tables
- `user_eula_acceptances` - EULA acceptance tracking
- `user_blocks` - User block relationships
- `content_reports` - User-submitted reports
- `content_filter_keywords` - Keyword blocklist (fallback)

### API Endpoints
- `GET /api/auth/eula-status` - Check EULA acceptance
- `POST /api/auth/accept-eula` - Accept EULA
- `POST /api/users/:userId/block` - Block user
- `DELETE /api/users/:userId/block` - Unblock user
- `GET /api/users/me/blocked` - List blocked users
- `POST /api/reports` - Submit content report

### Environment Variables
```
OPENAI_API_KEY=sk-...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASS=<app-password>
REPORT_EMAIL=info@stepmode.app
EULA_VERSION=1.0
```

---

## Compliance Summary

- ✅ **EULA with zero tolerance policy** - Users must accept terms after login
- ✅ **Content filtering** - OpenAI Moderation API blocks objectionable content
- ✅ **Flag mechanism** - Users can report posts, comments, and users
- ✅ **Block mechanism** - Users can block abusive users
- ✅ **Developer notification** - Email sent to info@stepmode.app on every report
- ✅ **Instant removal from feed** - Blocked user content hidden immediately
