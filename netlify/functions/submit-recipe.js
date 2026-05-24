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
    const { who, message } = JSON.parse(event.body);

    if (!who || !message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields." }) };
    }

    // Award 5 points via the leaderboard store
    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };

    const guest = data.guests.find((g) => g.name.toLowerCase() === who.toLowerCase());
    if (guest) {
      guest.points += 5;
    } else {
      data.guests.push({ name: who, points: 5 });
    }

    data.feed.push({
      name: who,
      points: 5,
      reason: `Shared a recipe`,
      status: "approved",
      timestamp: new Date().toISOString(),
    });

    await store.setJSON("data", data);

    // Post to #recipes Slack channel (skipped if DISABLE_SLACK=true)
    const RECIPES_WEBHOOK = process.env.WEDDING_RECIPES_SLACK_WEBHOOK || process.env.WEDDING_POINTS_SLACK_WEBHOOK;
    if (RECIPES_WEBHOOK && process.env.DISABLE_SLACK !== "true") {
      await fetch(RECIPES_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `📖 *${who}* shared a recipe:\n\n${message}\n\n_+5 pts awarded to ${who}!_`,
        }),
      }).catch(() => {});
    }

    // Also notify #points-activity if a separate recipes webhook is configured
    const POINTS_WEBHOOK = process.env.WEDDING_POINTS_SLACK_WEBHOOK;
    if (POINTS_WEBHOOK && POINTS_WEBHOOK !== RECIPES_WEBHOOK && process.env.DISABLE_SLACK !== "true") {
      await fetch(POINTS_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🍽️ *${who}* just earned *+5 pts* for sharing a recipe!`,
        }),
      }).catch(() => {});
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("submit-recipe error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to submit recipe." }) };
  }
};
