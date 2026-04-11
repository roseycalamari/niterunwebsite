# Email deliverability checklist (NiteRun)

Small checklist so notification emails are less likely to land in spam.

## 1. Resend domain & DNS

- In [Resend Dashboard](https://resend.com/domains): your domain **niterun.app** should be **Verified**.
- Make sure these exist in your DNS for `niterun.app`:
  - **SPF** (TXT): includes Resend (Resend gives you the exact value)
  - **DKIM** (CNAME/TXT): as provided by Resend
  - **DMARC** (TXT) at `_dmarc.niterun.app` (start with `p=none` to get reports, then tighten later)
- If emails still go to spam, open the domain in Resend and confirm all suggested records are present in your DNS (where you manage niterun.app).

## 2. What we added in the app

- **List-Unsubscribe header** – Every notification email includes a `List-Unsubscribe` header pointing to your app Settings. Many inbox providers (e.g. Gmail) show an "Unsubscribe" link; clicking it opens your app’s Settings page.
- **"Manage notification preferences" in the footer** – Each email has a link to the same Settings page so users can turn off notification emails without using the provider’s Unsubscribe.
- **In-app toggle** – In **Settings → Preferences → Email notifications**, users can turn off notification emails. When off, the Cloud Function does not send any notification email for that user (`emailNotifications: false` in Firestore).

## 3. Sending practices

- **Volume** – Sending only when something happens (e.g. friend request, session invite) keeps volume low and looks like normal transactional mail.
- **Content** – We avoid spammy wording and use a clear From name (**NiteRun &lt;notifications@niterun.app&gt;**).
- **Consistency** – Same domain and From address for all notification emails.

## 4. If emails still go to spam

- Confirm in Resend that the domain is verified and that no warnings are shown.
- Confirm your **From** address is on the same verified domain (`notifications@niterun.app`).
- Ask recipients to move one message to Inbox and (if available) "Add sender to contacts".
- For Gmail: the "Unsubscribe" link we added can help Gmail treat the mail as wanted.

## 5. Tracking failures (in-app)

- We log send attempts to Firestore `emailLogs` with `type`, `to`, `uid`, `ok`, and `providerId` (Resend id) when available (verification + notification emails).
- If you see delivery issues, compare Resend logs with `emailLogs` to spot systematic failures.

## 6. Webhook tracking (delivery/bounces/complaints)

- Configure a Resend webhook to point to your deployed Cloud Function endpoint:
  - `resendWebhook` (Firebase Functions HTTP endpoint)
- Select at least these event types:
  - `email.delivered`
  - `email.bounced`
  - `email.complained`
- Add the webhook signing secret (`whsec_...`) to Functions secrets as `RESEND_WEBHOOK_SECRET`.
- Webhook events are stored in Firestore:
  - `webhookDeliveries/{svix-id}` (dedupe)
  - `emailWebhookEvents/*` (full payload)
  - Best-effort correlation back onto matching `emailLogs` entries (by `providerId` == `email_id`)

No code changes needed for the checklist; this file is for your reference.
