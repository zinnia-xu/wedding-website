/**
 * admin-award.js — Slack Slash Command handler for direct point awards
 *
 * Setup in Slack:
 *   1. Go to https://api.slack.com/apps → your app → Slash Commands
 *   2. Create command: /award
 *   3. Request URL: https://YOUR-NETLIFY-SITE/.netlify/functions/admin-award
 *   4. Short description: Award points to a wedding guest
 *   5. Usage hint: [guest name] [points] [reason]
 *   6. Add env var SLACK_SIGNING_SECRET to Netlify (from Slack App Basic Info page)
 *
 * Usage (in Slack):
 *   /award Ekaterina 50 Won the sandcastle competition
 *   /award Julia 100 Helped set up decorations
 */

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");

function verifySlackSignature(signingSecret, rawBody, timestamp, signature) {
  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(baseString);
  const computed = "v0=" + hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
  const ADMIN_SLACK_USERS = (process.env.SLACK_ADMIN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);

  // Verify Slack signature if signing secret is configured
  if (SIGNING_SECRET) {
    const timestamp = event.headers["x-slack-request-timestamp"] || "";
    const signature = event.headers["x-slack-signature"] || "";
    if (!verifySlackSignature(SIGNING_SECRET, event.body, timestamp, signature)) {
      return { statusCode: 401, body: JSON.stringify({ text: "❌ Unauthorized. Invalid Slack signature." }) };
    }
  }

  // Parse Slack slash command body (application/x-www-form-urlencoded)
  const params = new URLSearchParams(event.body);
  const text = (params.get("text") || "").trim();
  const userId = params.get("user_id") || "";
  const userName = params.get("user_name") || "admin";

  // Restrict to admin users if configured
  if (ADMIN_SLACK_USERS.length > 0 && !ADMIN_SLACK_USERS.includes(userId)) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "❌ Only Zinnia and Andrew can award points directly." }),
    };
  }

  // Parse: /award [name] [points] [reason]
  // name can be multi-word, but points must be a number somewhere
  const parts = text.split(/\s+/);
  if (parts.length < 2) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "⚠️ Usage: `/award [guest name] [points] [reason]`\nExample: `/award Julia Xu 50 Won the sandcastle competition`",
      }),
    };
  }

  // Find the points value — look for an integer in the parts
  let pointsIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^-?\d+$/.test(parts[i])) { pointsIndex = i; break; }
  }

  if (pointsIndex === -1 || pointsIndex === 0) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "⚠️ Couldn't find a point value. Usage: `/award [guest name] [points] [reason]`\nExample: `/award Julia 50 Won the relay race`",
      }),
    };
  }

  const guestName = parts.slice(0, pointsIndex).join(" ");
  const points = parseInt(parts[pointsIndex], 10);
  const reason = parts.slice(pointsIndex + 1).join(" ") || "Admin award";

  if (isNaN(points)) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "⚠️ Invalid point value. Must be a whole number." }),
    };
  }

  try {
    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };

    // Find guest by name (case-insensitive, partial match)
    const nameLower = guestName.toLowerCase();
    let guest = data.guests.find((g) => g.name.toLowerCase() === nameLower);
    if (!guest) {
      // Try partial match
      guest = data.guests.find((g) => g.name.toLowerCase().includes(nameLower) || nameLower.includes(g.name.toLowerCase().split(" ")[0]));
    }

    if (!guest) {
      const suggestions = data.guests
        .map(g => g.name)
        .filter(n => n.toLowerCase().includes(nameLower.split(" ")[0]))
        .slice(0, 5)
        .map(n => `• ${n}`)
        .join("\n");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `❌ Couldn't find guest "*${guestName}*".\n${suggestions ? `Did you mean:\n${suggestions}` : "Check the spelling and try again."}`,
        }),
      };
    }

    const prevPoints = guest.points;
    guest.points += points;

    data.feed.push({
      name: guest.name,
      points,
      reason,
      timestamp: new Date().toISOString(),
      status: "approved",
      awardedBy: userName,
    });

    await store.setJSON("data", data);

    const emoji = points > 0 ? "🎉" : "📉";
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: "in_channel",
        text: `${emoji} *${guest.name}* awarded *${points > 0 ? "+" : ""}${points} points* for _${reason}_\n${prevPoints} → ${guest.points} total points`,
      }),
    };
  } catch (err) {
    console.error("admin-award error:", err);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `❌ Error: ${err.message}` }),
    };
  }
};
