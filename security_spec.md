# Security Specification — daythemnhantri.com Firestore Rules

## 1. Core Data Invariants
1. **Strict Verified Gmail Identity**: Every write operation requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Hardcoded + DB-Backed Privileged Principals**:
   - `SUPER_ADMIN`: `duyweb5@gmail.com` (verified email) or verified user doc with `role == 'SUPER_ADMIN'`.
   - `ADMIN`: `lethituman2021@gmail.com` (verified email) or verified user doc with `role == 'ADMIN'`.
   - `TEACHER`: verified user doc with `role == 'TEACHER'`.
3. **Zero Privilege Escalation**: Regular users creating their own `/users/{uid}` profile may ONLY assign `role` in `['PARENT', 'STUDENT']` (unless verified as `duyweb5@gmail.com` or `lethituman2021@gmail.com`). Users can NEVER modify their own `role` field on update.
4. **SuperAdmin-Only System Parameters**: Sensitive `site_config/main` fields (`domain`, `seoTitle`, `seoDescription`, `bankName`, `bankAccount`, `bankOwner`, `momoPhone`, `enableAiAdvisor`, `enableOnlineExams`, `enableOnlinePayment`) and `/role_invites/{inviteId}` are writable strictly by `SUPER_ADMIN`. Operational content fields (titles, slogans, banners, hotline, gallery, courses) are editable via 1-click CMS by both `SUPER_ADMIN` and `ADMIN`.
5. **PII Isolation**: `/students`, `/tuition`, `/users`, and `/expenses` contain PII or financial secrets and strictly prohibit anonymous or cross-user reads. Public faculty info is separated into `/public_teachers` with no phone numbers.
6. **Anti-Update-Gap & Strict Validation**: Every create and update invokes a standalone `isValid[Entity](incoming())` helper enforcing exact keys (`hasAll` + `hasOnly`), string `.size()` boundaries, bounded arrays, and action-based `affectedKeys().hasOnly(...)` whitelists.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: Request with `email: "duyweb5@gmail.com"` and `email_verified: false` updating `/site_config/main`.
2. **Self-Assigned SuperAdmin Escalation**: Random user creating `/users/{uid}` with `role: "SUPER_ADMIN"`.
3. **Profile Role Escalation Update**: Existing `STUDENT` updating `/users/{uid}` with `{ role: "ADMIN" }`.
4. **Admin Touching SuperAdmin Payment Config**: `ADMIN` (`lethituman2021@gmail.com`) modifying `bankAccount` or `domain` in `/site_config/main`.
5. **Shadow Ghost Field Injection**: `ADMIN` creating `/courses/course-x` with an extra unlisted key `isVerified: true`.
6. **ID Poisoning**: Creating `/courses/` with a 300-character document ID containing special characters.
7. **PII Blanket Read on Students**: Authenticated `STUDENT` attempting `get` or `list` on another student's `/students/{otherId}` document.
8. **Teacher Reading Financial Expenses**: `TEACHER` attempting `get` or `list` on `/expenses/{expenseId}`.
9. **Parent Self-Verifying Academic Score**: `PARENT` or `STUDENT` creating `/scores/{scoreId}` with `verified: true`.
10. **Terminal State Violation on Ticket**: Non-staff user trying to reopen or modify `reply` on a `RESOLVED` `/tickets/{ticketId}`.
11. **Value Poisoning on Tuition Payment**: Parent attempting to update `totalAmount: 0` while marking `/tuition/{tuitionId}` as `PAID`.
12. **Unbounded Array / Denial-of-Wallet**: Submitting `/courses/{id}` with 100 subjects or a 10KB title string.
