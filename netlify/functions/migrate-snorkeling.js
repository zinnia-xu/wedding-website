// One-time migration: update Snorkeling entries from 20pts to 45pts
// Call via: POST /.netlify/functions/migrate-snorkeling
// with body: { "adminKey": "snorkel-fix-2026" }

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    if (body.adminKey !== "snorkel-fix-2026") {
      return { statusCode: 403, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };

    let feedFixed = 0;
    let guestAdjustments = {};

    // Find all Snorkeling feed entries with 20 pts and update them
    data.feed = data.feed.map(entry => {
      if (
        entry.reason &&
        entry.reason.toLowerCase().includes("snorkeling") &&
        entry.points === 20
      ) {
        guestAdjustments[entry.name] = (guestAdjustments[entry.name] || 0) + 25; // +25 to go from 20 → 45
        feedFixed++;
        return { ...entry, points: 45, reason: "Snorkeling — 1st session (45 pts)" };
      }
      return entry;
    });

    // Adjust guest totals
    for (const [name, adjustment] of Object.entries(guestAdjustments)) {
      const guest = data.guests.find(g => g.name.toLowerCase() === name.toLowerCase());
      if (guest) {
        guest.points += adjustment;
      }
    }

    await store.setJSON("data", data);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Updated ${feedFixed} snorkeling entries from 20pts to 45pts`,
        adjustments: guestAdjustments,
      }),
    };
  } catch (error) {
    console.error("Migration error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Migration failed", details: error.message }),
    };
  }
};
