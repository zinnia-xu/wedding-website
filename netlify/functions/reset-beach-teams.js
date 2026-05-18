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
    const store = getStore({ name: "beach-competition", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    const config = (await store.get("config", { type: "json" })) || {};
    config.teams = [];
    config.teamsLocked = false;
    await store.setJSON("config", config);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: "Teams reset and unlocked" }) };
  } catch (error) {
    console.error("reset-beach-teams error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to reset teams" }) };
  }
};
