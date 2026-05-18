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
    const { index, newName } = JSON.parse(event.body || "{}");
    if (typeof index !== "number" || !newName || !String(newName).trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid input: index (number) and newName (string) required" }) };
    }
    const name = String(newName).trim().slice(0, 60);
    const store = getStore({ name: "beach-competition", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });

    const [config, scoresData] = await Promise.all([
      store.get("config", { type: "json" }).then(c => c || {}),
      store.get("scores", { type: "json" }).then(d => d || { scores: [] }),
    ]);

    if (!Array.isArray(config.teams) || config.teams.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "No teams have been set yet" }) };
    }
    if (index < 0 || index >= config.teams.length) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid team index" }) };
    }

    // Get the old name so we can rename matching score submissions
    const existing = config.teams[index];
    const oldName = typeof existing === "string" ? existing : (existing && existing.name) || "";

    // Update team name in config (handle both old string format and new object format)
    if (typeof existing === "string") {
      config.teams[index] = { name, members: [] };
    } else {
      config.teams[index] = { ...existing, name };
    }

    // Rename matching entries in score submissions so auto-population keeps working
    let scoresChanged = false;
    if (oldName && oldName.toLowerCase() !== name.toLowerCase() && Array.isArray(scoresData.scores)) {
      scoresData.scores = scoresData.scores.map(s => {
        if ((s.teamName || "").trim().toLowerCase() === oldName.trim().toLowerCase()) {
          scoresChanged = true;
          return { ...s, teamName: name };
        }
        return s;
      });
    }

    // Write both blobs (scores only if changed)
    const writes = [store.setJSON("config", config)];
    if (scoresChanged) writes.push(store.setJSON("scores", scoresData));
    await Promise.all(writes);

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, teams: config.teams }) };
  } catch (error) {
    console.error("update-team-name error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to update team name" }) };
  }
};
