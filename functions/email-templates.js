/**
 * NiteRun email templates — pixel-matched to the website & app.
 *
 * Design DNA (from styles.css / app.css):
 *   Cream #fffcef · Black #2f2f2f · Blue #006dff
 *   Sharp corners (0 border-radius) · 2px solid borders
 *   4px offset box-shadows on buttons · 5px on cards
 *   Poppins 800 headings (uppercase, -0.02em) · 700 labels · 500 body
 *   Section eyebrow: tiny uppercase, 0.2em spacing
 */

const APP_URL = "https://niterun.app";
const PREFERENCES_URL = APP_URL + "/app.html#settings";

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSubject(type, data) {
  switch (type) {
    case "session_invite":
      return "You've been added to a session" + (data.venue ? " at " + esc(data.venue) : "");
    case "mvp_award":
      return "You were voted MVP!";
    case "session_closed":
      return "Session ended" + (data.venue ? " at " + esc(data.venue) : "");
    case "friend_request":
      return esc(data.fromName || "Someone") + " wants to be your friend";
    case "friend_accepted":
      return esc(data.fromName || "Someone") + " accepted your friend request";
    case "welcome":
      return "Welcome to NiteRun";
    default:
      return "New notification from NiteRun";
  }
}

/* ---- Exact tokens from :root in styles.css / app.css ---- */
const F  = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
const CR = "#fffcef";
const BK = "#2f2f2f";
const BL = "#006dff";
const GD = "#f59e0b";
const GR = "#22c55e";
const GY = "#6b6b6b";

/* ---- Avatar (matches .topbar__avatar / .profile__avatar) ---- */
function avatar(data, s) {
  s = s || 48;
  const nm = data.fromName || "";
  const ini = nm ? esc(nm.charAt(0).toUpperCase()) : "?";
  if (data.fromPhoto && /^https:\/\//.test(data.fromPhoto)) {
    return `<img src="${esc(data.fromPhoto)}" alt="" width="${s}" height="${s}" style="width:${s}px;height:${s}px;object-fit:cover;display:block;border:2px solid ${BK};" />`;
  }
  return `<div style="width:${s}px;height:${s}px;background:${BK};color:${CR};font-family:${F};font-size:${Math.round(s*0.42)}px;font-weight:800;line-height:${s}px;text-align:center;border:2px solid ${BK};">${ini}</div>`;
}

/* ---- Eyebrow (matches .section-eyebrow) ---- */
function eyebrow(text, color) {
  return `<p style="margin:0;font-family:${F};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:${color || BL};">${text}</p>`;
}

/* ---- Heading (matches h1–h4 in app.css: 800, uppercase, -0.02em, 1.1) ---- */
function heading(text, size) {
  return `<p style="margin:10px 0 0;font-family:${F};font-size:${size || 26}px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:${BK};text-transform:uppercase;">${text}</p>`;
}

/* ---- Body text (matches Poppins 500, 1.6 line-height) ---- */
function body(text) {
  return `<p style="margin:0;font-family:${F};font-size:15px;font-weight:500;line-height:1.6;color:${BK};">${text}</p>`;
}

/* ---- Primary CTA (matches .btn--primary: blue bg, cream text, 2px border, 4px offset shadow) ---- */
function cta(label, color) {
  const bg = color || BL;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
<tr><td style="padding:0 4px 4px 0;background-color:${BK};">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:${bg};color:${CR};font-family:${F};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BK};mso-padding-alt:0;">${label} &rarr;</a>
</td></tr>
</table>`;
}

/* ---- Secondary CTA (matches .btn--secondary: cream bg, black text) ---- */
function ctaSec(label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
<tr><td style="padding:0 4px 4px 0;background-color:${BK};">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:${CR};color:${BK};font-family:${F};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BK};">${label} &rarr;</a>
</td></tr>
</table>`;
}

/* ---- Info card row (matches .card with border + inner content) ---- */
function infoCard(labelText, valueText, accent) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CR};border:2px solid ${BK};">
<tr><td style="padding:16px 20px;">
  ${eyebrow(labelText, accent || BL)}
  <p style="margin:8px 0 0;font-family:${F};font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${BK};text-transform:uppercase;line-height:1.1;">${valueText}</p>
</td></tr>
</table>`;
}

/* ---- Step row (matches .step pattern: number + text) ---- */
function stepRow(num, text) {
  return `<tr>
<td style="padding:${num === "01" ? "0" : "12px 0 0"};font-family:${F};font-size:14px;font-weight:500;color:${BK};line-height:1.6;${num !== "01" ? `border-top:1px solid ${BK};padding-top:12px;` : ""}">
  <span style="font-family:${F};font-size:12px;font-weight:800;color:${BL};letter-spacing:0.1em;margin-right:8px;">${num}</span>${text}
</td></tr>`;
}

/* ============================================================
   SHELL — mirrors the full page layout:
   cream body → card with 5px offset shadow → black header bar → content → footer
   ============================================================ */
function shell(title, accent, inner, footerNote) {
  const note = footerNote != null ? footerNote : "You're receiving this because you have a NiteRun account.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — NiteRun</title>
</head>
<body style="margin:0;padding:0;background-color:${CR};font-family:${F};-webkit-text-size-adjust:100%;">

<!-- Full-width cream wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CR};">
<tr><td align="center" style="padding:40px 16px 32px;">

<!-- Card shadow wrapper (5px offset like .card box-shadow) -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BK};" align="center">
<tr><td style="padding:0 5px 5px 0;">

<!-- Main card: cream bg, 2px black border, max 520px -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;min-width:320px;background-color:${CR};border:2px solid ${BK};">

  <!-- Header bar: black bg like .topnav / .sidebar -->
  <tr>
    <td style="padding:20px 28px;background-color:${BK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:${F};font-size:18px;font-weight:800;letter-spacing:0.06em;color:${CR};text-transform:uppercase;">NITE-RUN</td>
          <td align="right" style="font-family:${F};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:${accent || BL};">${title}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Content -->
  ${inner}

  <!-- Footer divider (matches .footer__divider: 1px line) -->
  <tr><td style="padding:0 28px;"><div style="height:1px;background-color:${BK};opacity:0.12;"></div></td></tr>

  <!-- Footer (matches .footer__bottom) -->
  <tr>
    <td style="padding:20px 28px;">
      <p style="margin:0;font-family:${F};font-size:11px;color:${GY};line-height:1.7;text-align:center;">
        ${note}<br>
        <a href="${APP_URL}" style="color:${BK};font-weight:600;text-decoration:underline;">niterun.app</a>
        &nbsp;&middot;&nbsp;
        <a href="${PREFERENCES_URL}" style="color:${BK};font-weight:600;text-decoration:underline;">Manage preferences</a>
      </p>
      <p style="margin:12px 0 0;font-family:${F};font-size:10px;color:${GY};text-align:center;opacity:0.5;font-style:italic;">Draft Smarter. Play Harder.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}


/* ============================================================
   WELCOME
   Mirrors: hero section eyebrow + title + feature list + CTA
   ============================================================ */
function buildWelcomeEmail(data) {
  const name = esc(data.displayName || "");
  const inner = `
  <tr>
    <td style="padding:36px 28px 0;text-align:center;">
      ${eyebrow("YOU'RE IN", BL)}
      ${heading("WELCOME TO<br>NITE-RUN", 28)}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0;text-align:center;">
      ${body(name ? `Hey ${name}, welcome aboard.<br><br>Fair teams. Zero drama. Create sessions, add players, balance sides and pick MVPs — all in one place.` : "Fair teams. Zero drama. Create sessions, add players, balance sides and pick MVPs — all in one place.")}
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CR};border:2px solid ${BK};">
        ${stepRow("01", "Create sessions and add players by name or @username")}
        ${stepRow("02", "Get balanced teams based on skill ratings")}
        ${stepRow("03", "Award MVPs and track stats on your profile")}
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 28px 36px;text-align:center;">
      ${cta("LAUNCH APP", BL)}
    </td>
  </tr>`;
  return shell("Welcome", BL, inner, "You're receiving this because you just signed up for NiteRun.");
}


/* ============================================================
   FRIEND REQUEST
   Mirrors: user profile card with avatar + name + username
   ============================================================ */
function buildFriendRequestEmail(data) {
  const fromName = esc(data.fromName || "Someone");
  const av = avatar(data, 56);
  const inner = `
  <tr>
    <td style="padding:32px 28px 0;text-align:center;">
      ${eyebrow("FRIEND REQUEST", BL)}
      ${heading("NEW REQUEST", 24)}
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CR};border:2px solid ${BK};">
        <tr>
          <td style="padding:20px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:16px;">${av}</td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-family:${F};font-size:16px;font-weight:800;letter-spacing:-0.02em;color:${BK};text-transform:uppercase;line-height:1.1;">${fromName}</p>
                  ${data.fromUsername ? `<p style="margin:4px 0 0;font-family:${F};font-size:13px;font-weight:600;color:${BL};">@${esc(data.fromUsername)}</p>` : ""}
                  <p style="margin:8px 0 0;font-family:${F};font-size:13px;font-weight:500;color:${GY};">wants to be your friend</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 36px;text-align:center;">
      ${cta("VIEW REQUEST", BL)}
    </td>
  </tr>`;
  return shell("Friend Request", BL, inner);
}


/* ============================================================
   FRIEND ACCEPTED
   ============================================================ */
function buildFriendAcceptedEmail(data) {
  const fromName = esc(data.fromName || "Someone");
  const av = avatar(data, 56);
  const inner = `
  <tr>
    <td style="padding:32px 28px 0;text-align:center;">
      ${eyebrow("REQUEST ACCEPTED", GR)}
      ${heading("YOU'RE NOW FRIENDS", 24)}
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CR};border:2px solid ${BK};">
        <tr>
          <td style="padding:20px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:16px;">
                  <div style="display:inline-block;border:3px solid ${GR};">${av}</div>
                </td>
                <td style="vertical-align:middle;">
                  <p style="margin:0;font-family:${F};font-size:16px;font-weight:800;letter-spacing:-0.02em;color:${BK};text-transform:uppercase;line-height:1.1;">${fromName}</p>
                  ${data.fromUsername ? `<p style="margin:4px 0 0;font-family:${F};font-size:13px;font-weight:600;color:${BL};">@${esc(data.fromUsername)}</p>` : ""}
                  <p style="margin:8px 0 0;font-family:${F};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${GR};">Friends &#10003;</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 36px;text-align:center;">
      ${cta("VIEW PROFILE", GR)}
    </td>
  </tr>`;
  return shell("Request Accepted", GR, inner);
}


/* ============================================================
   SESSION INVITE
   Mirrors: live session card with venue + meta + creator
   ============================================================ */
function buildSessionInviteEmail(data) {
  const fromName = esc(data.fromName || "A player");
  const venue = esc(data.venue || "A session");
  const inner = `
  <tr>
    <td style="padding:32px 28px 0;text-align:center;">
      ${eyebrow("SESSION INVITE", BL)}
      ${heading("YOU'VE BEEN ADDED", 24)}
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0;">
      ${infoCard("VENUE", venue, BL)}
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;padding-right:14px;">${avatar(data, 40)}</td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-family:${F};font-size:14px;font-weight:700;color:${BK};">${fromName}</p>
            <p style="margin:2px 0 0;font-family:${F};font-size:12px;font-weight:500;color:${GY};">added you to this session</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 36px;text-align:center;">
      ${cta("VIEW SESSION", BL)}
    </td>
  </tr>`;
  return shell("Session Invite", BL, inner);
}


/* ============================================================
   MVP AWARD
   Mirrors: stat card with big number + gold accent
   ============================================================ */
function buildMvpAwardEmail(data) {
  const venue = esc(data.venue || "");
  const inner = `
  <tr>
    <td style="padding:32px 28px 0;text-align:center;">
      ${eyebrow("MVP AWARD", GD)}
      ${heading("YOU'RE THE MVP", 28)}
    </td>
  </tr>
  <tr>
    <td style="padding:24px 28px 0;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BK};">
        <tr><td style="padding:0 4px 4px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="background-color:${GD};border:2px solid ${BK};">
            <tr><td style="padding:16px 32px;text-align:center;">
              <span style="font-size:28px;line-height:1;">&#127942;</span>
              <p style="margin:6px 0 0;font-family:${F};font-size:22px;font-weight:800;letter-spacing:0.04em;color:${BK};">MVP +1</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0;text-align:center;">
      ${body(venue ? `Your performance at <strong style="font-weight:800;text-transform:uppercase;">${venue}</strong> earned you the MVP award. This badge is now on your profile.` : "You've been selected as the Most Valuable Player. This badge is now on your profile.")}
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 36px;text-align:center;">
      ${cta("VIEW PROFILE", GD)}
    </td>
  </tr>`;
  return shell("MVP Award", GD, inner);
}


/* ============================================================
   SESSION CLOSED
   Mirrors: session detail card with venue + MVP badge + meta
   ============================================================ */
function buildSessionClosedEmail(data) {
  const venue = esc(data.venue || "Session");
  const mvpName = esc(data.mvpName || "");
  const inner = `
  <tr>
    <td style="padding:32px 28px 0;text-align:center;">
      ${eyebrow("FINAL WHISTLE", GY)}
      ${heading(venue, 24)}
    </td>
  </tr>
  ${mvpName ? `
  <tr>
    <td style="padding:20px 28px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CR};border:2px solid ${BK};">
        <tr><td style="padding:16px 20px;text-align:center;">
          ${eyebrow("&#127942; MVP", GD)}
          <p style="margin:6px 0 0;font-family:${F};font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${BK};text-transform:uppercase;">${mvpName}</p>
        </td></tr>
      </table>
    </td>
  </tr>` : ""}
  <tr>
    <td style="padding:20px 28px 0;text-align:center;">
      ${body("This session has been closed by the host. Check your stats on your profile.")}
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 36px;text-align:center;">
      ${ctaSec("VIEW HISTORY")}
    </td>
  </tr>`;
  return shell("Session Ended", GY, inner);
}


/* ============================================================
   EMAIL VERIFICATION
   Mirrors: welcome layout with shield icon + verification CTA
   ============================================================ */
function buildVerifyEmailTemplate(data) {
  const name = esc(data.displayName || "");
  const link = data.verifyLink || APP_URL;
  const inner = `
  <tr>
    <td style="padding:36px 28px 0;text-align:center;">
      ${eyebrow("VERIFY YOUR EMAIL", BL)}
      ${heading("ONE LAST STEP", 28)}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0;text-align:center;">
      ${body(name ? `Hey ${name}, tap the button below to verify your email and unlock your NiteRun account.` : "Tap the button below to verify your email and unlock your NiteRun account.")}
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 0;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BK};">
        <tr><td style="padding:0 4px 4px 0;">
          <a href="${link}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:${BL};color:${CR};font-family:${F};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BK};mso-padding-alt:0;">VERIFY EMAIL &rarr;</a>
        </td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0;text-align:center;">
      <p style="margin:0;font-family:${F};font-size:12px;font-weight:500;color:${GY};line-height:1.6;">This link expires in 24 hours. If you didn't create a NiteRun account, ignore this email.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 28px 36px;text-align:center;">
      <p style="margin:0;font-family:${F};font-size:11px;font-weight:500;color:${GY};line-height:1.6;word-break:break-all;">Or copy this link: <a href="${link}" style="color:${BL};font-weight:600;text-decoration:underline;">${link}</a></p>
    </td>
  </tr>`;
  return shell("Verify Email", BL, inner, "You're receiving this because someone signed up for NiteRun with this email.");
}


/* ============================================================
   GENERIC
   ============================================================ */
function buildGenericEmail(data) {
  const message = esc(data.message || "You have a new notification.");
  const inner = `
  <tr>
    <td style="padding:32px 28px 0;text-align:center;">
      ${eyebrow("NOTIFICATION", BL)}
      ${heading("NEW UPDATE", 24)}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 28px 0;text-align:center;">
      ${body(message)}
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 36px;text-align:center;">
      ${cta("OPEN NITERUN", BL)}
    </td>
  </tr>`;
  return shell("Notification", BL, inner);
}


/* ============================================================
   EXPORTS
   ============================================================ */
function buildEmail(type, data) {
  switch (type) {
    case "friend_request":   return buildFriendRequestEmail(data);
    case "friend_accepted":  return buildFriendAcceptedEmail(data);
    case "session_invite":   return buildSessionInviteEmail(data);
    case "mvp_award":        return buildMvpAwardEmail(data);
    case "session_closed":   return buildSessionClosedEmail(data);
    case "welcome":          return buildWelcomeEmail(data);
    default:                 return buildGenericEmail(data);
  }
}

module.exports = {
  buildEmail,
  getSubject,
  buildWelcomeEmail,
  buildVerifyEmailTemplate,
  PREFERENCES_URL,
};
