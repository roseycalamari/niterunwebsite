/**
 * NiteRun email templates — same design as app/website.
 * Cream background, black borders, 5px offset shadow, Poppins, uppercase, blue primary buttons.
 * No Firebase dependencies.
 */
const APP_URL = "https://niterun.app";
/** Where users can turn off notification emails (Settings in app) */
const PREFERENCES_URL = APP_URL + "/app.html#settings";

function getSubject(type, data) {
  switch (type) {
    case "session_invite":
      return "You've been added to a session" + (data.venue ? " at " + data.venue : "");
    case "mvp_award":
      return "You were voted MVP!";
    case "session_closed":
      return "Session ended" + (data.venue ? " at " + data.venue : "");
    case "friend_request":
      return (data.fromName || "Someone") + " wants to be your friend";
    case "friend_accepted":
      return (data.fromName || "Someone") + " accepted your friend request";
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
  const initial = fromName ? fromName.charAt(0).toUpperCase() : "?";
  if (data.fromPhoto) {
    return `<img src="${data.fromPhoto}" alt="" width="${s}" height="${s}" style="width:${s}px;height:${s}px;object-fit:cover;display:block;border:2px solid ${BLACK};" />`;
  }
  return `<div style="width:${s}px;height:${s}px;background:${BLACK};color:${CREAM};font-family:${FONT};font-size:${Math.round(s * 0.4)}px;font-weight:700;line-height:${s}px;text-align:center;border:2px solid ${BLACK};">${initial}</div>`;
}

/* Shell: cream page, black header bar "NITE-RUN", card with 2px black border + 5px offset "shadow" */
function emailShell(title, accent, innerHtml) {
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
<!-- Offset shadow: 5px right+down via padding on a black cell -->
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${BLACK};" align="center">
<tr><td style="padding:0 5px 5px 0;">
<!-- Card: cream, 2px black border (same as .card) -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background-color:${CREAM};border:2px solid ${BLACK};">
  <!-- Header bar: black with cream text (like app sidebar) -->
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
        You're receiving this because you have a NiteRun account.<br>
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

/* Primary button: colored bg, cream text, 2px black border (like .btn--primary) */
function ctaButton(label, color) {
  return `<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:${color};color:${CREAM};font-family:${FONT};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BLACK};">${label}</a>`;
}
/* Secondary: cream bg, black text (like .btn--secondary) */
function ctaButtonSecondary(label) {
  return `<a href="${APP_URL}" target="_blank" style="display:inline-block;padding:14px 32px;background-color:${CREAM};color:${BLACK};font-family:${FONT};font-size:13px;font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:0.06em;border:2px solid ${BLACK};">${label}</a>`;
}

function buildFriendRequestEmail(data) {
  const fromName = data.fromName || "Someone";
  const avatar = avatarBlock(data, 64);
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      ${avatar.replace("display:block", "display:inline-block;margin:0 auto")}
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:20px;font-weight:700;color:${BLACK};">${fromName}</p>
      ${data.fromUsername ? `<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;font-weight:500;color:${BLUE};">@${data.fromUsername}</p>` : ""}
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

function buildFriendAcceptedEmail(data) {
  const fromName = data.fromName || "Someone";
  const avatar = avatarBlock(data, 64);
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <div style="display:inline-block;border:3px solid ${GREEN};">${avatar}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:20px;font-weight:700;color:${BLACK};">${fromName}</p>
      ${data.fromUsername ? `<p style="margin:4px 0 0;font-family:${FONT};font-size:13px;font-weight:500;color:${BLUE};">@${data.fromUsername}</p>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${BLACK};">accepted your friend request</p>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;color:${GREEN};font-weight:700;">You're now friends!</p>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 32px 32px;text-align:center;">
      ${ctaButton("View Profile", GREEN)}
    </td>
  </tr>`;
  return emailShell("Request Accepted", GREEN, inner);
}

function buildSessionInviteEmail(data) {
  const fromName = data.fromName || "A player";
  const venue = data.venue || "a session";
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};border:2px solid ${BLACK};">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${BLUE};">Venue</p>
            <p style="margin:0;font-family:${FONT};font-size:18px;font-weight:800;color:${BLACK};text-transform:uppercase;">${venue}</p>
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
            <p style="margin:0;font-family:${FONT};font-size:14px;font-weight:600;color:${BLACK};">${fromName}</p>
            <p style="margin:2px 0 0;font-family:${FONT};font-size:12px;color:${GREY};">added you to this session</p>
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

function buildMvpAwardEmail(data) {
  const venue = data.venue || "";
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <span style="font-size:48px;line-height:1;">&#127942;</span>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:22px;font-weight:800;color:${GOLD};text-transform:uppercase;letter-spacing:0.04em;">You're the MVP!</p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:15px;font-weight:500;line-height:1.5;color:${BLACK};">
        ${venue ? `Your performance at <strong>${venue}</strong> earned you the MVP award.` : "You've been selected as the Most Valuable Player."}
        <br>This badge is now on your profile.
      </p>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 32px 0;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;background-color:${GOLD};border:2px solid ${BLACK};">
        <tr>
          <td style="padding:10px 24px;font-family:${FONT};font-size:18px;font-weight:800;color:${BLACK};letter-spacing:0.04em;">MVP +1</td>
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

function buildSessionClosedEmail(data) {
  const venue = data.venue || "Session";
  const mvpName = data.mvpName || "";
  const inner = `
  <tr>
    <td style="padding:28px 32px 0;text-align:center;">
      <p style="margin:0;font-family:${FONT};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${GREY};">Final Whistle</p>
      <p style="margin:8px 0 0;font-family:${FONT};font-size:20px;font-weight:800;color:${BLACK};text-transform:uppercase;">${venue}</p>
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

function buildGenericEmail(data) {
  const message = data.message || "You have a new notification.";
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
    default:                 return buildGenericEmail(data);
  }
}

module.exports = { buildEmail, getSubject, PREFERENCES_URL };
