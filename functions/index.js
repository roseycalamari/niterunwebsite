const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { Resend } = require("resend");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const FROM_EMAIL = "NiteRun <notifications@niterun.app>";

const { buildEmail, getSubject, buildWelcomeEmail, buildVerifyEmailTemplate, PREFERENCES_URL } = require("./email-templates");

/* ----------------------------------------------------------
   Cloud Function: send custom verification email (callable)
   ---------------------------------------------------------- */
exports.sendVerification = onCall(
  { secrets: [RESEND_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;
    const auth = getAuth();
    const userRecord = await auth.getUser(uid);

    if (userRecord.emailVerified) {
      return { already: true };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await db.collection("emailVerifications").doc(token).set({
      uid: uid,
      email: userRecord.email,
      expiresAt: expiresAt,
      used: false,
    });

    const verifyLink = `https://verifyemail-kmzhjcr2xq-uc.a.run.app?token=${token}`;

    const userDoc = await db.collection("users").doc(uid).get();
    const displayName = userDoc.exists ? userDoc.data().displayName : "";

    const html = buildVerifyEmailTemplate({
      displayName: displayName,
      verifyLink: verifyLink,
    });

    const resend = new Resend(RESEND_API_KEY.value());
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [userRecord.email],
      subject: "Verify your email — NiteRun",
      html: html,
    });

    return { sent: true };
  }
);


/* ----------------------------------------------------------
   Cloud Function: HTTP endpoint to handle verification link
   ---------------------------------------------------------- */
exports.verifyEmail = onRequest(
  { cors: false, invoker: "public" },
  async (req, res) => {
    const token = req.query.token;
    if (!token) {
      return res.status(400).send(verifyPage("Invalid Link", "No verification token provided.", false));
    }

    try {
      const docRef = db.collection("emailVerifications").doc(token);
      const snap = await docRef.get();

      if (!snap.exists) {
        return res.status(400).send(verifyPage("Invalid Link", "This verification link is not valid.", false));
      }

      const data = snap.data();

      if (data.used) {
        return res.status(200).send(verifyPage("Already Verified", "Your email has already been verified. You can log in now.", true));
      }

      if (Date.now() > data.expiresAt) {
        return res.status(400).send(verifyPage("Link Expired", "This verification link has expired. Please request a new one from the login page.", false));
      }

      const auth = getAuth();
      await auth.updateUser(data.uid, { emailVerified: true });
      await docRef.update({ used: true });

      return res.status(200).send(verifyPage("Email Verified!", "Your email has been verified successfully. You can now log in to NiteRun.", true));
    } catch (err) {
      console.error("Verification error:", err);
      return res.status(500).send(verifyPage("Something Went Wrong", "Please try again or request a new verification email.", false));
    }
  }
);

function verifyPage(title, message, success) {
  const accent = success ? "#22c55e" : "#ef4444";
  const icon = success
    ? '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — NiteRun</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fffcef;font-family:'Poppins',sans-serif;padding:24px}
.card{max-width:440px;width:100%;background:#fffcef;border:2px solid #2f2f2f;box-shadow:5px 5px 0 #2f2f2f;text-align:center;padding:48px 36px}
.card svg{margin-bottom:16px}
h1{font-size:1.5rem;font-weight:800;text-transform:uppercase;letter-spacing:-0.02em;color:#2f2f2f;margin-bottom:12px}
p{font-size:0.9rem;font-weight:500;color:#2f2f2f;opacity:0.7;line-height:1.6;margin-bottom:24px}
a.btn{display:inline-block;padding:14px 36px;background:${accent};color:#fffcef;font-family:'Poppins',sans-serif;font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid #2f2f2f;box-shadow:4px 4px 0 #2f2f2f}
a.btn:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 #2f2f2f}
</style>
</head>
<body>
<div class="card">
${icon}
<h1>${title}</h1>
<p>${message}</p>
<a class="btn" href="https://niterun.web.app/auth.html">${success ? "LOG IN →" : "BACK TO LOGIN →"}</a>
</div>
</body>
</html>`;
}


/* ----------------------------------------------------------
   Cloud Function: welcome email when new user doc is created
   ---------------------------------------------------------- */
exports.sendWelcomeEmail = onDocumentCreated(
  {
    document: "users/{userId}",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const userData = snap.data();
    const email = userData.email;
    if (!email) return;

    try {
      const subject = getSubject("welcome", userData);
      const html = buildWelcomeEmail({
        displayName: userData.displayName || "",
        email: email,
      });

      const resend = new Resend(RESEND_API_KEY.value());

      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject: subject,
        html: html,
        headers: {
          "List-Unsubscribe": `<${PREFERENCES_URL}>`,
        },
      });

      console.log(`Welcome email sent to ${email}`);
    } catch (err) {
      console.error("Failed to send welcome email:", err);
    }
  }
);

/* ----------------------------------------------------------
   Cloud Function: send email on new notification
   ---------------------------------------------------------- */
exports.sendNotificationEmail = onDocumentCreated(
  {
    document: "users/{userId}/notifications/{notifId}",
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notifData = snap.data();
    const userId = event.params.userId;

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) return;

      const userData = userDoc.data();
      const email = userData.email;
      if (!email) return;

      if (userData.emailNotifications === false) return;

      const type = notifData.type || "general";
      const subject = getSubject(type, notifData);
      const html = buildEmail(type, notifData);

      const resend = new Resend(RESEND_API_KEY.value());

      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        subject: subject,
        html: html,
        headers: {
          "List-Unsubscribe": `<${PREFERENCES_URL}>`,
        },
      });

      console.log(`Email sent to ${email} for notification type: ${type}`);
    } catch (err) {
      console.error("Failed to send notification email:", err);
    }
  }
);
