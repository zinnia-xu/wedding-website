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

    // Generate a unique request ID to prevent double-approval
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
    const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID;
    const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
    const SITE_URL = process.env.URL || "https://your-site.netlify.app";

    const approveUrl = `${SITE_URL}/.netlify/functions/approve-points?who=${encodeURIComponent(who)}&points=${encodeURIComponent(points)}&reason=${encodeURIComponent(reason)}&action=approve&requestId=${encodeURIComponent(requestId)}`;
    const denyUrl = `${SITE_URL}/.netlify/functions/approve-points?who=${encodeURIComponent(who)}&points=${encodeURIComponent(points)}&reason=${encodeURIComponent(reason)}&action=deny&requestId=${encodeURIComponent(requestId)}`;
    const adjustUrl = `${SITE_URL}/.netlify/functions/adjust-points?who=${encodeURIComponent(who)}&points=${encodeURIComponent(points)}&reason=${encodeURIComponent(reason)}&requestId=${encodeURIComponent(requestId)}`;

    const blocks = [
      {
        type: "header",
        text: { type: "plain_text", text: "🏆 New Point Request!", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Who:*\n${who}` },
          { type: "mrkdwn", text: `*Points Requested:*\n${points}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Reason:*\n${reason}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✅ Approve", emoji: true },
            style: "primary",
            url: approveUrl,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "✏️ Adjust Points", emoji: true },
            url: adjustUrl,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "❌ Deny", emoji: true },
            style: "danger",
            url: denyUrl,
          },
        ],
      },
    ];

    let slackChannel = null;
    let slackTs = null;

    if (SLACK_BOT_TOKEN && SLACK_CHANNEL_ID) {
      // Use chat.postMessage so we get back the message ts (needed to update it later)
      const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        },
        body: JSON.stringify({
          channel: SLACK_CHANNEL_ID,
          text: `🏆 New Point Request from ${who}`,
          blocks,
        }),
      });

      const slackJson = await slackRes.json();
      if (slackJson.ok) {
        slackChannel = slackJson.channel;
        slackTs = slackJson.ts;
      } else {
        console.warn("chat.postMessage failed:", slackJson.error);
        // Fall back to webhook if available
        if (SLACK_WEBHOOK) {
          await fetch(SLACK_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: `🏆 *Point Request*`, blocks }),
          });
        }
      }
    } else if (SLACK_WEBHOOK) {
      // Legacy: incoming webhook (can't update messages later)
      const slackResponse = await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `🏆 *Point Request*`, blocks }),
      });
      if (!slackResponse.ok) {
        throw new Error(`Slack responded with ${slackResponse.status}`);
      }
    } else {
      console.warn("No Slack credentials set — logging request instead");
      console.log(`Point request: ${who} requested ${points} points for: ${reason}`);
    }

    // Save a pending feed entry to the leaderboard store (including Slack message info for later update)
    try {
      const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      data.feed.push({
        name: who,
        points: points,
        reason: reason,
        status: "pending",
        requestId: requestId,
        timestamp: new Date().toISOString(),
        slackChannel,
        slackTs,
      });
      await store.setJSON("data", data);
    } catch (blobErr) {
      console.warn("Could not save pending feed entry:", blobErr.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: "Request sent for approval!" }),
    };
  } catch (error) {
    console.error("Error submitting points:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to submit point request" }),
    };
  }
};
