/**
 * Generate HTML previews of all notification emails.
 * Run: node preview-emails.js
 * Then open functions/preview/index.html in your browser.
 */
const fs = require("fs");
const path = require("path");
const { buildEmail, buildWelcomeEmail } = require("./email-templates");

const PREVIEW_DIR = path.join(__dirname, "preview");

const samples = {
  welcome: {
    displayName: "Alex",
    email: "alex@example.com",
  },
  friend_request: {
    fromName: "Alex Silva",
    fromUsername: "alexsilva",
  },
  friend_accepted: {
    fromName: "Alex Silva",
    fromUsername: "alexsilva",
  },
  session_invite: {
    fromName: "Ruben",
    fromUsername: "ruben",
    venue: "Campo da Vila",
  },
  mvp_award: {
    venue: "Campo da Vila",
  },
  session_closed: {
    venue: "Campo da Vila",
    mvpName: "João",
  },
  general: {
    message: "This is a sample notification from NiteRun.",
  },
};

const labels = {
  welcome: "Welcome (new account)",
  friend_request: "Friend Request",
  friend_accepted: "Friend Accepted",
  session_invite: "Session Invite",
  mvp_award: "MVP Award",
  session_closed: "Session Closed",
  general: "Generic Notification",
};

if (!fs.existsSync(PREVIEW_DIR)) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

const types = Object.keys(samples);
types.forEach((type) => {
  const html = type === "welcome" ? buildWelcomeEmail(samples[type]) : buildEmail(type, samples[type]);
  const filename = type === "general" ? "generic.html" : type + ".html";
  fs.writeFileSync(path.join(PREVIEW_DIR, filename), html, "utf8");
  console.log("Wrote " + filename);
});

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NiteRun email previews</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a1a; color: #e2e2e2; padding: 24px; }
    h1 { font-size: 1.25rem; margin-bottom: 16px; }
    ul { list-style: none; padding: 0; }
    li { margin-bottom: 8px; }
    a { color: #006dff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>NiteRun email designs</h1>
  <p>Click a link to open that email in the same tab (as it would look in an inbox).</p>
  <ul>
    ${types.map((type) => {
      const file = type === "general" ? "generic.html" : type + ".html";
      return `<li><a href="${file}">${labels[type]}</a></li>`;
    }).join("\n    ")}
  </ul>
</body>
</html>`;

fs.writeFileSync(path.join(PREVIEW_DIR, "index.html"), indexHtml, "utf8");
console.log("Wrote index.html");
console.log("\nOpen in browser: " + path.join(PREVIEW_DIR, "index.html").replace(/\\/g, "/"));
console.log("Or from project root: functions/preview/index.html");
