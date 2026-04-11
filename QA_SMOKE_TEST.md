## NiteRun — Smoke test (10–15 min)

Run this before deploying to production.

### Accounts / auth
- Create a new account
- Receive verification email (Resend)
- Click verify link → returns success page
- Log in (must be blocked if not verified; must work after verified)

### Groups
- Create group
- Join group with invite code (2nd account)
- Verify member count/verified count behaves as expected

### Official session (verified group)
- Start official session (select group)
- Add players (mix of @ users + local names)
- Generate teams

### Close session + MVP
- Close session
- Pick MVP
- Confirm profile stats update (sessions played / MVP count)

### Invites / friends (basic)
- Send friend request
- Accept/decline and ensure notification is created

### Notifications
- In-app notification appears and unread count badge updates
- Email notification is received (Resend)

### Settings toggles
- Turn off email notifications → trigger another notification → ensure no email is sent

