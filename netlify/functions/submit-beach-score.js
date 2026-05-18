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
    const {
      teamName,
      triviaScore,
      section3Score,
      section5Score,
      spagramElapsedSec,
      spagramHints,
      wordleElapsedSec,
      wordleGuesses,
      wordleSolved,
      connElapsedSec,
      connWrongCount,
    } = JSON.parse(event.body || "{}");

    if (!teamName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing teamName" }) };
    }

    const store = getStore({ name: "beach-competition", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    let data = (await store.get("scores", { type: "json" })) || { scores: [] };

    data.scores.push({
      teamName,
      triviaScore:      triviaScore      ?? 0,
      section3Score:    section3Score    ?? 0,
      section5Score:    section5Score    ?? 0,
      spagramElapsedSec: spagramElapsedSec ?? null,
      spagramHints:     spagramHints     ?? 0,
      wordleElapsedSec: wordleElapsedSec ?? null,
      wordleGuesses:    wordleGuesses    ?? null,
      wordleSolved:     wordleSolved     ?? false,
      connElapsedSec:   connElapsedSec   ?? null,
      connWrongCount:   connWrongCount   ?? 0,
      timestamp: new Date().toISOString(),
    });

    await store.setJSON("scores", data);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("submit-beach-score error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to save score" }),
    };
  }
};
