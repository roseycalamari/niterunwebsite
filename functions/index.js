const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Resend } = require("resend");

initializeApp();
const db = getFirestore();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const FROM_EMAIL = "NiteRun <notifications@niterun.app>";

const { buildEmail, getSubject, buildWelcomeEmail, PREFERENCES_URL } = require("./email-templates");

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
