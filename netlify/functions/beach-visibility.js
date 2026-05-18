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

  const store = getStore({ name: "beach-competition", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });

  if (event.httpMethod === "GET") {
    try {
      const config = (await store.get("config", { type: "json" })) || {};
      return { statusCode: 200, headers, body: JSON.stringify({ hidden: !!config.hidden }) };
    } catch (error) {
      console.error("beach-visibility GET error:", error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to fetch visibility" }) };
    }
  }

  if (event.httpMethod === "POST") {
    const authHeader = event.headers["authorization"] || event.headers["Authorization"] || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token || token !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    try {
      const { hidden } = JSON.parse(event.body || "{}");
      const config = (await store.get("config", { type: "json" })) || {};
      config.hidden = !!hidden;
      await store.setJSON("config", config);
      return { statusCode: 200, headers, body: JSON.stringify({ hidden: config.hidden }) };
    } catch (error) {
      console.error("beach-visibility POST error:", error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to update visibility" }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
};
