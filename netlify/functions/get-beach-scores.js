const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const store = getStore({ name: "beach-competition", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    const [data, config] = await Promise.all([
      store.get("scores", { type: "json" }).then(d => d || { scores: [] }),
      store.get("config", { type: "json" }).then(c => c || {}),
    ]);

    // Sort by totalScore descending, then by timestamp ascending (earlier = better tiebreak)
    const sorted = [...data.scores].sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        scores: sorted,
        hidden: !!config.hidden,
        teams: config.teams || [],
        teamsLocked: !!config.teamsLocked,
        standings: config.standings || null,
        standingsUpdated: config.standingsUpdated || null,
      }),
    };
  } catch (error) {
    console.error("get-beach-scores error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to fetch scores" }),
    };
  }
};
