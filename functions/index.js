const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { Resend } = require("resend");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const RESEND_WEBHOOK_SECRET = defineSecret("RESEND_WEBHOOK_SECRET");
const FROM_EMAIL = "NiteRun <notifications@niterun.app>";

const {
  buildEmail,
  getSubject,
  buildWelcomeEmail,
  buildVerifyEmailTemplate,
  buildAccountDeletionEmail,
  PREFERENCES_URL,
  APP_URL,
} = require("./email-templates");

async function logEmailAttempt(data) {
  try {
    await db.collection("emailLogs").add(Object.assign({ createdAt: Date.now() }, data));
  } catch (e) {
    console.error("Failed to write email log:", e);
  }
}

/* ----------------------------------------------------------
   Cloud Function: Resend webhook receiver (HTTP)
   Stores delivered/bounced/complained events for tracing
   ---------------------------------------------------------- */
exports.resendWebhook = onRequest(
  { cors: false, invoker: "public", secrets: [RESEND_WEBHOOK_SECRET] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const svixId = req.get("svix-id") || "";
    const svixTimestamp = req.get("svix-timestamp") || "";
    const svixSignature = req.get("svix-signature") || "";

    if (!raw || !svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).send("Bad Request");
    }

    // Dedupe (Resend is at-least-once delivery)
    const deliveryRef = db.collection("webhookDeliveries").doc(svixId);
    const existing = await deliveryRef.get();
    if (existing.exists) return res.status(200).send("OK");

    let event;
    try {
      const resend = new Resend("dummy");
      event = resend.webhooks.verify({
        payload: raw,
        headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
        webhookSecret: RESEND_WEBHOOK_SECRET.value(),
      });
    } catch (e) {
      console.error("Invalid Resend webhook:", e);
      return res.status(400).send("Invalid webhook");
    }

    const emailId = event && event.data ? event.data.email_id : null;
    const type = event && event.type ? String(event.type) : "unknown";
    const createdAt = event && event.created_at ? String(event.created_at) : null;

    await deliveryRef.set({
      svixId,
      receivedAt: Date.now(),
      type,
      emailId,
      createdAt,
    });

    // Store full event payload (kept separate so delivery doc stays tiny)
    await db.collection("emailWebhookEvents").add({
      receivedAt: Date.now(),
      svixId,
      type,
      emailId,
      createdAt,
      event,
    });

    // Best-effort correlation back to our send logs
    if (emailId) {
      try {
        const snap = await db.collection("emailLogs").where("providerId", "==", emailId).limit(5).get();
        if (!snap.empty) {
          const update = { lastEventType: type, lastEventAt: Date.now() };
          if (type === "email.delivered") update.deliveredAt = Date.now();
          if (type === "email.bounced") update.bouncedAt = Date.now();
          if (type === "email.complained") update.complainedAt = Date.now();
          await Promise.all(snap.docs.map((d) => d.ref.set(update, { merge: true })));
        }
      } catch (e) {
        console.error("Failed to correlate email webhook:", e);
      }
    }

    return res.status(200).send("OK");
  }
);

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
    try {
      const resp = await resend.emails.send({
        from: FROM_EMAIL,
        to: [userRecord.email],
        subject: "Verify your email — NiteRun",
        html: html,
      });
      await logEmailAttempt({
        type: "verify_email",
        to: userRecord.email,
        uid: uid,
        ok: true,
        provider: "resend",
        providerId: resp && resp.data ? resp.data.id : null,
      });
    } catch (err) {
      await logEmailAttempt({
        type: "verify_email",
        to: userRecord.email,
        uid: uid,
        ok: false,
        provider: "resend",
        error: String(err && (err.message || err)),
      });
      throw err;
    }

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

      // Keep Firestore user profile email in sync (supports email changes too).
      if (data.email) {
        await db.collection("users").doc(data.uid).set(
          { email: data.email },
          { merge: true }
        );
      }
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


/* ============================================================
   ACCOUNT DELETION — email confirm → purge Firestore + Auth + Storage
   ============================================================ */

const CONFIRM_DELETE_LINK_BASE = (APP_URL || "https://niterun.app").replace(/\/$/, "") + "/confirmAccountDeletion";

async function deleteSubcollectionInChunks(colRef, batchSize) {
  let snap = await colRef.limit(batchSize).get();
  while (!snap.empty) {
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    snap = await colRef.limit(batchSize).get();
  }
}

async function deleteSessionsForGroupId(groupId) {
  const snap = await db.collection("sessions").where("groupId", "==", groupId).get();
  for (const d of snap.docs) {
    await d.ref.delete().catch((e) => console.error("delete session", d.id, e));
  }
}

async function deleteGroupFully(groupRef) {
  const gid = groupRef.id;
  await deleteSessionsForGroupId(gid);
  await deleteSubcollectionInChunks(groupRef.collection("members"), 400);
  await groupRef.delete().catch((e) => console.error("delete group doc", gid, e));
}

async function removeUserFromGroup(uid, gid) {
  const groupRef = db.collection("groups").doc(gid);
  const memberRef = groupRef.collection("members").doc(uid);
  const [groupSnap, memberSnap] = await Promise.all([groupRef.get(), memberRef.get()]);
  if (!groupSnap.exists) return;
  if (!memberSnap.exists) return;

  const gData = groupSnap.data() || {};
  const mData = memberSnap.data() || {};
  const wasVerifiedMember = mData.emailVerified === true;

  await memberRef.delete();

  const remaining = await groupRef.collection("members").limit(100).get();
  if (remaining.empty) {
    await deleteGroupFully(groupRef);
    return;
  }

  const newMemberCount = remaining.size;
  const newVerifiedCount = Math.max(0, (gData.verifiedMemberCount || 1) - (wasVerifiedMember ? 1 : 0));
  const isVerified = newVerifiedCount >= 10;

  const updates = {
    memberCount: newMemberCount,
    verifiedMemberCount: newVerifiedCount,
    isVerified: isVerified,
  };

  if (gData.ownerUid === uid) {
    updates.ownerUid = remaining.docs[0].id;
  }

  await groupRef.update(updates);
}

async function removeUserFromFriendsLists(uid) {
  const qs = await db.collection("users").where("friends", "array-contains", uid).get();
  let batch = db.batch();
  let n = 0;
  for (const doc of qs.docs) {
    batch.update(doc.ref, {
      friends: FieldValue.arrayRemove(uid),
      friendCount: FieldValue.increment(-1),
    });
    n++;
    if (n >= 400) {
      await batch.commit();
      batch = db.batch();
      n = 0;
    }
  }
  if (n > 0) await batch.commit();
}

async function purgeUserAccount(uid) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const groupIds =
    userSnap.exists && Array.isArray(userSnap.data().groupIds) ? [...userSnap.data().groupIds] : [];

  if (userSnap.exists) {
    await deleteSubcollectionInChunks(userRef.collection("notifications"), 400);
  }

  for (const gid of groupIds) {
    try {
      await removeUserFromGroup(uid, gid);
    } catch (e) {
      console.error("removeUserFromGroup", gid, e);
    }
  }

  await removeUserFromFriendsLists(uid);

  const created = await db.collection("sessions").where("creatorId", "==", uid).get();
  for (const d of created.docs) {
    await d.ref.delete().catch((e) => console.error("delete session", d.id, e));
  }

  const invited = await db.collection("sessions").where("invitedUids", "array-contains", uid).get();
  for (const d of invited.docs) {
    await d.ref
      .update({ invitedUids: FieldValue.arrayRemove(uid) })
      .catch((e) => console.error("session invited update", d.id, e));
  }

  if (userSnap.exists) {
    await userRef.delete().catch((e) => console.error("delete user doc", e));
  }

  try {
    const bucket = getStorage().bucket();
    await bucket.file(`avatars/${uid}.jpg`).delete();
  } catch (e) {
    /* ignore missing avatar */
  }

  const auth = getAuth();
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    if (e && e.code !== "auth/user-not-found") throw e;
  }
}

function deleteAccountResultPage(title, message, success) {
  const accent = success ? "#22c55e" : "#e53e3e";
  const icon = success
    ? '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : '<svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
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
<a class="btn" href="https://niterun.app/auth.html">${success ? "CLOSE — LOG IN" : "BACK TO LOGIN →"}</a>
</div>
</body>
</html>`;
}

exports.requestAccountDeletion = onCall(
  { secrets: [RESEND_API_KEY], region: "us-central1" },
  async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid = request.auth.uid;
  const auth = getAuth();
  const userRecord = await auth.getUser(uid);
  const email = userRecord.email;
  if (!email) {
    throw new HttpsError("failed-precondition", "No email on file.");
  }

  const pendingRef = db.collection("accountDeletionPending").doc(uid);
  const pendSnap = await pendingRef.get();
  if (pendSnap.exists) {
    const oldToken = pendSnap.data().token;
    if (oldToken) {
      await db.collection("accountDeletionRequests").doc(oldToken).delete().catch(() => {});
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 48 * 60 * 60 * 1000;

  await pendingRef.set({ token, email, expiresAt }, { merge: true });
  await db.collection("accountDeletionRequests").doc(token).set({
    uid,
    email,
    expiresAt,
    used: false,
  });

  const confirmLink = `${CONFIRM_DELETE_LINK_BASE}?token=${encodeURIComponent(token)}`;

  const userDoc = await db.collection("users").doc(uid).get();
  const displayName = userDoc.exists ? userDoc.data().displayName || "" : "";

  const html = buildAccountDeletionEmail({
    displayName: displayName,
    confirmLink: confirmLink,
  });

  const resend = new Resend(RESEND_API_KEY.value());
  try {
    const resp = await resend.emails.send({
      from: FROM_EMAIL,
      to: [email],
      subject: "Confirm deleting your NiteRun account",
      html: html,
    });
    await logEmailAttempt({
      type: "account_deletion_request",
      to: email,
      uid: uid,
      ok: true,
      provider: "resend",
      providerId: resp && resp.data ? resp.data.id : null,
    });
  } catch (err) {
    await logEmailAttempt({
      type: "account_deletion_request",
      to: email,
      uid: uid,
      ok: false,
      provider: "resend",
      error: String(err && (err.message || err)),
    });
    throw err;
  }

  return { sent: true };
});

exports.confirmAccountDeletion = onRequest(
  { cors: false, invoker: "public", region: "us-central1" },
  async (req, res) => {
  const token = req.query.token;
  if (!token || typeof token !== "string") {
    return res.status(400).send(deleteAccountResultPage("Invalid link", "No confirmation token was provided.", false));
  }

  try {
    const docRef = db.collection("accountDeletionRequests").doc(String(token).trim());
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.status(400).send(deleteAccountResultPage("Invalid link", "This confirmation link is not valid.", false));
    }

    const data = snap.data();

    if (data.used) {
      return res
        .status(200)
        .send(deleteAccountResultPage("Already processed", "This account deletion was already confirmed.", true));
    }

    if (Date.now() > data.expiresAt) {
      return res.status(400).send(deleteAccountResultPage("Link expired", "This link has expired. Request a new one from NiteRun settings.", false));
    }

    const uid = data.uid;
    await purgeUserAccount(uid);

    await docRef.update({ used: true, completedAt: Date.now() });
    await db.collection("accountDeletionPending").doc(uid).delete().catch(() => {});

    return res
      .status(200)
      .send(
        deleteAccountResultPage(
          "Account deleted",
          "Your NiteRun account and associated data have been removed. Thank you for playing.",
          true
        )
      );
  } catch (err) {
    console.error("confirmAccountDeletion error:", err);
    return res
      .status(500)
      .send(deleteAccountResultPage("Something went wrong", "We could not finish deleting the account. Please try again or contact support.", false));
  }
});
