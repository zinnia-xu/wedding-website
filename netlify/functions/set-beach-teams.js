const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token || token !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const { teams } = JSON.parse(event.body || "{}");
    if (!Array.isArray(teams)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "teams must be an array" }) };
    }

    const store = getStore({ name: "beach-competition", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    const config = (await store.get("config", { type: "json" })) || {};
    const existing = Array.isArray(config.teams) ? config.teams : [];

    // Normalize: each item can be a string (name only) or { name, members }
    // If members are not provided, preserve existing members for that index
    config.teams = teams.map((t, i) => {
      const name = typeof t === "string" ? t.trim() : String(t.name || "").trim();
      const members = Array.isArray(t.members) ? t.members.map(m => String(m).trim()).filter(Boolean)
                    : (existing[i] && Array.isArray(existing[i].members) ? existing[i].members : []);
      return { name, members };
    }).filter(t => t.name);

    // Lock teams once published (only reset-beach-teams can unlock)
    config.teamsLocked = true;

    await store.setJSON("config", config);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, teams: config.teams }) };
  } catch (error) {
    console.error("set-beach-teams error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save teams" }) };
  }
};
