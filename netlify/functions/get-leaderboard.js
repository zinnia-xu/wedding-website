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

  try {
    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    const data = await store.get("data", { type: "json" });

    if (!data) {
      // Initialize with default data if none exists
      const defaultData = {
        guests: [
          { name: "Guest 1", points: 0 },
          { name: "Guest 2", points: 0 },
          { name: "Guest 3", points: 0 },
          { name: "Guest 4", points: 0 },
          { name: "Guest 5", points: 0 },
          { name: "Guest 6", points: 0 },
          { name: "Guest 7", points: 0 },
          { name: "Guest 8", points: 0 },
          { name: "Guest 9", points: 0 },
          { name: "Guest 10", points: 0 },
          { name: "Guest 11", points: 0 },
          { name: "Guest 12", points: 0 },
          { name: "Guest 13", points: 0 },
          { name: "Guest 14", points: 0 },
          { name: "Guest 15", points: 0 },
          { name: "Guest 16", points: 0 },
          { name: "Guest 17", points: 0 },
          { name: "Guest 18", points: 0 },
          { name: "Guest 19", points: 0 },
          { name: "Guest 20", points: 0 },
        ],
        feed: [],
      };
      await store.setJSON("data", defaultData);
      return { statusCode: 200, headers, body: JSON.stringify(defaultData) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to fetch leaderboard data" }),
    };
  }
};
