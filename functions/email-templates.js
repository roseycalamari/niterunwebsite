/**
 * NiteRun email templates — match app/website exactly.
 * Cream #fffcef, black #2f2f2f, 2px borders, 5px card shadow, 4px button shadow.
 * Poppins, uppercase headings, letter-spacing 0.06em–0.08em.
 * No Firebase dependencies.
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

/* ---- Design tokens (match app.css) ---- */
const FONT = "'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif";
const CREAM = "#fffcef";
const BLACK = "#2f2f2f";
const BLUE  = "#006dff";
const GOLD  = "#f59e0b";
const GREEN = "#22c55e";
const GREY  = "#6b6b6b";

function avatarBlock(data, size) {
  const s = size || 56;
  const fromName = data.fromName || "";
  const initial = fromName ? esc(fromName.charAt(0).toUpperCase()) : "?";
  if (data.fromPhoto && /^https:\/\//.test(data.fromPhoto)) {
    return `<img src="${esc(data.fromPhoto)}" alt="" width="${s}" height="${s}" style="width:${s}px;height:${s}px;object-fit:cover;display:block;border:2px solid ${BLACK};" />`;
  }
  return `<div style="width:${s}px;height:${s}px;background:${BLACK};color:${CREAM};font-family:${FONT};font-size:${Math.round(s * 0.4)}px;font-weight:700;line-height:${s}px;text-align:center;border:2px solid ${BLACK};">${initial}</div>`;
}

/* Card shell: 5px offset shadow (like .card), black header bar, 2px borders */
function emailShell(title, accent, innerHtml, footerNote) {
  const note = footerNote != null ? footerNote : "You're receiving this because you have a NiteRun account.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title} — NiteRun</title>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BLACK};" align="center">
<tr><td style="padding:0 5px 5px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:${CREAM};border:2px solid ${BLACK};">
  <tr>
    <td style="padding:20px 24px;background-color:${BLACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:0.06em;color:${CREAM};text-transform:uppercase;">NITE-RUN</td>
          <td align="right" style="font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${accent};">${title}</td>
        </tr>
      </table>
    </td>
  </tr>
  ${innerHtml}
  <tr>
    <td style="padding:20px 24px;border-top:2px solid ${BLACK};">
      <p style="margin:0;font-family:${FONT};font-size:11px;color:${GREY};line-height:1.6;text-align:center;">
        ${note}<br>
        <a href="${APP_URL}" style="color:${BLACK};text-decoration:underline;">niterun.app</a>
        &nbsp;·&nbsp;
        <a href="${PREFERENCES_URL}" style="color:${BLACK};text-decoration:underline;">Manage notification preferences</a>
      </p>
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

/* Primary CTA: blue (or color), cream text, 2px black border, 4px offset shadow (like .btn--primary) */
function ctaButton(label, color) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BLACK};">
<tr><td style="padding:0 4px 4px 0;">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:${color};color:${CREAM};font-family:${FONT};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BLACK};">${label}</a>
</td></tr>
</table>`;
}
function ctaButtonSecondary(label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BLACK};">
<tr><td style="padding:0 4px 4px 0;">
<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:${CREAM};color:${BLACK};font-family:${FONT};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BLACK};">${label}</a>
</td></tr>
</table>`;
}

/* ---- Welcome (new account) ---- */
function buildWelcomeEmail(data) {
  const name = esc(data.displayName || "");
  const inner = `
  <tr>
    <td style="padding:36px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:${BLUE};">You're in</p>
      <p style="margin:12px 0 0;font-family:${FONT};font-size:28px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:${BLACK};text-transform:uppercase;">Welcome to NiteRun</p>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:16px;font-weight:500;line-height:1.5;color:${BLACK};">
        ${name ? `Hi ${name},<br><br>` : ""}
        Fair teams. Zero drama. Create sessions, add players, balance sides and pick MVPs — all in one place.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:8px 32px 0;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${CREAM};border:2px solid ${BLACK};">
        <tr>
          <td style="padding:12px 20px;font-family:${FONT};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${GREY};">What you can do</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};border:2px solid ${BLACK};">
        <tr><td style="padding:14px 20px;font-family:${FONT};font-size:14px;font-weight:500;color:${BLACK};line-height:1.5;">Create sessions and add players by name or @username</td></tr>
        <tr><td style="padding:0 20px 14px;border-top:1px solid ${BLACK};font-family:${FONT};font-size:14px;font-weight:500;color:${BLACK};line-height:1.5;">Get balanced teams and share live sessions with friends</td></tr>
        <tr><td style="padding:0 20px 14px;border-top:1px solid ${BLACK};font-family:${FONT};font-size:14px;font-weight:500;color:${BLACK};line-height:1.5;">Award MVPs and track stats on your profile</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 32px 36px;text-align:center;">
      ${ctaButton("Open NiteRun", BLUE)}
    </td>
  </tr>`;
  return emailShell("Welcome", BLUE, inner, "You're receiving this because you just signed up for NiteRun.");
}

/* ---- Friend Request ---- */
function buildFriendRequestEmail(data) {
  const fromName = esc(data.fromName || "Someone");
  const avatar = avatarBlock(data, 64);
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      ${avatar.replace("display:block", "display:inline-block;margin:0 auto")}
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:0.02em;color:${BLACK};text-transform:uppercase;">${fromName}</p>
      ${data.fromUsername ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;font-weight:500;color:${BLUE};">@${esc(data.fromUsername)}</p>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${BLACK};">wants to be your friend on NiteRun</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButton("View Request", BLUE)}
    </td>
  </tr>`;
  return emailShell("Friend Request", BLUE, inner);
}

/* ---- Friend Accepted ---- */
function buildFriendAcceptedEmail(data) {
  const fromName = esc(data.fromName || "Someone");
  const avatar = avatarBlock(data, 64);
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <div style="display:inline-block;border:3px solid ${GREEN};">${avatar}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:0.02em;color:${BLACK};text-transform:uppercase;">${fromName}</p>
      ${data.fromUsername ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;font-weight:500;color:${BLUE};">@${esc(data.fromUsername)}</p>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${BLACK};">accepted your friend request</p>
      <p style="margin:10px 0 0;font-family:${FONT};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${GREEN};">You're now friends!</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButton("View Profile", GREEN)}
    </td>
  </tr>`;
  return emailShell("Request Accepted", GREEN, inner);
}

/* ---- Session Invite ---- */
function buildSessionInviteEmail(data) {
  const fromName = esc(data.fromName || "A player");
  const venue = esc(data.venue || "a session");
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};border:2px solid ${BLACK};">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 6px;font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BLUE};">Venue</p>
            <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:0.02em;color:${BLACK};text-transform:uppercase;">${venue}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:20px 32px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:middle;padding-right:12px;">${avatarBlock(data, 40)}</td>
          <td style="vertical-align:middle;">
            <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:700;color:${BLACK};">${fromName}</p>
            <p style="margin:2px 0 0;font-family:${FONT};font-size:12px;font-weight:500;color:${GREY};">added you to this session</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButton("View Session", BLUE)}
    </td>
  </tr>`;
  return emailShell("Session Invite", BLUE, inner);
}

/* ---- MVP Award ---- */
function buildMvpAwardEmail(data) {
  const venue = esc(data.venue || "");
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <span style="font-size:48px;line-height:1;">&#127942;</span>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:0.02em;color:${GOLD};text-transform:uppercase;">You're the MVP!</p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${BLACK};">
        ${venue ? `Your performance at <strong style="font-weight:800;">${venue}</strong> earned you the MVP award.` : "You've been selected as the Most Valuable Player."}
        <br>This badge is now on your profile.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 32px 0;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${GOLD};border:2px solid ${BLACK};">
        <tr>
          <td style="padding:10px 24px;font-family:${FONT};font-size:18px;font-weight:800;letter-spacing:0.04em;color:${BLACK};">MVP +1</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButton("View Profile", GOLD)}
    </td>
  </tr>`;
  return emailShell("MVP Award", GOLD, inner);
}

/* ---- Session Closed ---- */
function buildSessionClosedEmail(data) {
  const venue = esc(data.venue || "Session");
  const mvpName = esc(data.mvpName || "");
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${GREY};">Final Whistle</p>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:0.02em;color:${BLACK};text-transform:uppercase;">${venue}</p>
    </td>
  </tr>
  ${mvpName ? `
  <tr>
    <td style="padding:20px 32px 0;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${CREAM};border:2px solid ${BLACK};">
        <tr>
          <td style="padding:12px 20px;text-align:center;">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:${GOLD};">&#127942; MVP</p>
            <p style="margin:0;font-family:${FONT};font-size:16px;font-weight:700;color:${BLACK};">${mvpName}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ` : ""}
  <tr>
    <td style="padding:20px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${BLACK};">This session has been closed by the host. Check your stats on your profile.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButtonSecondary("View History")}
    </td>
  </tr>`;
  return emailShell("Session Ended", GREY, inner);
}

/* ---- Generic ---- */
function buildGenericEmail(data) {
  const message = esc(data.message || "You have a new notification.");
  const inner = `
  <tr>
    <td style="padding:32px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:16px;font-weight:500;line-height:1.5;color:${BLACK};">${message}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButton("Open NiteRun", BLUE)}
    </td>
  </tr>`;
  return emailShell("Notification", BLUE, inner);
}

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

module.exports = { buildEmail, getSubject, buildWelcomeEmail, PREFERENCES_URL };
