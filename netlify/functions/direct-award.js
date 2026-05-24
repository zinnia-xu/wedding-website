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
    const { who, points, reason } = JSON.parse(event.body);

    if (!who || !points || !reason) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields: who, points, reason" }),
      };
    }

    const pointsNum = parseInt(points, 10);

    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };

    // Find or create the guest
    const guest = data.guests.find((g) => g.name.toLowerCase() === who.toLowerCase());
    if (guest) {
      guest.points += pointsNum;
    } else {
      data.guests.push({ name: who, points: pointsNum });
    }

    // Add an approved feed entry directly
    data.feed.push({
      name: who,
      points: pointsNum,
      reason: reason,
      status: "approved",
      timestamp: new Date().toISOString(),
    });

    await store.setJSON("data", data);

    // Post to Slack #points-activity (skipped if DISABLE_SLACK=true)
    const SLACK_WEBHOOK = process.env.WEDDING_POINTS_SLACK_WEBHOOK;
    if (SLACK_WEBHOOK && process.env.DISABLE_SLACK !== "true") {
      const updatedGuest = data.guests.find((g) => g.name.toLowerCase() === who.toLowerCase());
      const total = updatedGuest ? updatedGuest.points : pointsNum;
      await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `🏆 *${who}* just earned *+${pointsNum} pts* for: _${reason}_ — now at *${total} pts total*`,
        }),
      }).catch(() => {});
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Points awarded!" }),
    };
  } catch (error) {
    console.error("Error awarding points:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to award points" }),
    };
  }
};
