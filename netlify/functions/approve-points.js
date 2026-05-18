const { getStore } = require("@netlify/blobs");

// Updates the original Slack message to show ✅ Approved or ❌ Denied
async function updateSlackMessage(token, channel, ts, who, points, reason, action) {
  if (!token || !channel || !ts) return;

  const isApproved = action === "approve";
  const emoji = isApproved ? "✅" : "❌";
  const label = isApproved ? "APPROVED" : "DENIED";
  const color = isApproved ? "#2e7d32" : "#c62828";

  try {
    await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel,
        ts,
        text: `${emoji} ${label}: ${who} · ${points} pts · ${reason}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${label}* — *${who}* · *${points} points* · _${reason}_`,
            },
          },
        ],
        attachments: [
          {
            color,
            fallback: `${label} by admin`,
          },
        ],
      }),
    });
  } catch (err) {
    console.warn("Could not update Slack message:", err.message);
  }
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { who, points, reason, action, requestId } = params;

  if (!who || !points || !action) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: "<h1>Missing parameters</h1><p>Invalid approval link.</p>",
    };
  }

  const pointsNum = parseInt(points, 10);
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

  // ── Shared styles ──
  const css = `
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 80px auto; text-align: center; color: #333; padding: 1rem; }
    .emoji { font-size: 3rem; margin-bottom: 1rem; }
    h1 { color: #1A3C2A; }
    h1.deny { color: #E8456B; }
    h1.already { color: #888; }
    p { line-height: 1.6; }
  `;

  if (action === "deny") {
    const denyReason = params.denyReason || "";

    // Step 1: No reason yet — show the reason form
    if (!denyReason) {
      const formAction = `/.netlify/functions/approve-points?who=${encodeURIComponent(who)}&points=${points}&reason=${encodeURIComponent(reason)}&action=deny&requestId=${encodeURIComponent(requestId || "")}`;
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: `<html><head><style>
          ${css}
          input, textarea { width:100%; padding:0.75rem; border:1px solid #ddd; border-radius:8px; font-family:inherit; font-size:1rem; margin-top:0.5rem; box-sizing:border-box; }
          button { margin-top:1rem; padding:0.75rem 2rem; background:#E8456B; color:#fff; border:none; border-radius:8px; font-size:1rem; font-weight:600; cursor:pointer; width:100%; }
          button:hover { background:#c0392b; }
          .request-box { background:#f9f9f9; border:1px solid #eee; border-radius:8px; padding:1rem; margin-bottom:1.5rem; text-align:left; font-size:0.95rem; color:#555; }
        </style></head><body>
          <div class="emoji">❌</div>
          <h1 class="deny">Deny Request</h1>
          <div class="request-box">
            <strong>${who}</strong> requested <strong>${pointsNum} pts</strong><br>
            <em>${reason}</em>
          </div>
          <form method="GET" action="/.netlify/functions/approve-points">
            <input type="hidden" name="who" value="${who}">
            <input type="hidden" name="points" value="${points}">
            <input type="hidden" name="reason" value="${reason}">
            <input type="hidden" name="action" value="deny">
            <input type="hidden" name="requestId" value="${requestId || ""}">
            <label style="font-weight:600; display:block; text-align:left;">Reason for denial <span style="font-weight:400;color:#999">(optional)</span></label>
            <input type="text" name="denyReason" placeholder="e.g. Already claimed, insufficient evidence..." autofocus>
            <button type="submit">Confirm Denial</button>
          </form>
        </body></html>`,
      };
    }

    // Step 2: Reason provided — process the denial
    if (requestId) {
      try {
        const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
        let data = await store.get("data", { type: "json" });
        if (data) {
          const entry = data.feed.find(f => f.requestId === requestId);
          if (entry) {
            if (entry.status !== "pending") {
              return {
                statusCode: 200,
                headers: { "Content-Type": "text/html" },
                body: `<html><head><style>${css}</style></head><body>
                  <div class="emoji">⚠️</div>
                  <h1 class="already">Already Processed</h1>
                  <p>This request was already <strong>${entry.status}</strong>.</p>
                  <p style="color:#999; margin-top:2rem;">You can close this tab.</p>
                </body></html>`,
              };
            }
            entry.status = "denied";
            if (denyReason) entry.denyReason = denyReason;
            await updateSlackMessage(SLACK_BOT_TOKEN, entry.slackChannel, entry.slackTs, who, pointsNum, reason, "deny");
            await store.setJSON("data", data);
          }
        }
      } catch (err) {
        console.warn("Could not update feed entry on deny:", err.message);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `<html><head><style>${css}</style></head><body>
        <div class="emoji">❌</div>
        <h1 class="deny">Request Denied</h1>
        <p><strong>${who}</strong>'s request for <strong>${pointsNum} points</strong> has been denied.</p>
        ${denyReason ? `<p style="color:#666;">Reason: <em>${denyReason}</em></p>` : ""}
        <p style="color:#999; margin-top:2rem;">You can close this tab.</p>
      </body></html>`,
    };
  }

  if (action === "approve") {
    try {
      const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
      let data = await store.get("data", { type: "json" });

      if (!data) {
        data = { guests: [], feed: [] };
      }

      // Idempotency check: prevent double-approval
      if (requestId) {
        const existing = data.feed.find(f => f.requestId === requestId);
        if (existing && existing.status !== "pending") {
          return {
            statusCode: 200,
            headers: { "Content-Type": "text/html" },
            body: `<html><head><style>${css}</style></head><body>
              <div class="emoji">⚠️</div>
              <h1 class="already">Already Processed</h1>
              <p>This request was already <strong>${existing.status}</strong>.</p>
              <p style="color:#999; margin-top:2rem;">You can close this tab.</p>
            </body></html>`,
          };
        }
        // Mark the pending entry as approved + update Slack message
        if (existing) {
          existing.status = "approved";
          await updateSlackMessage(SLACK_BOT_TOKEN, existing.slackChannel, existing.slackTs, who, pointsNum, reason, "approve");
        }
      }

      // Find the guest and add points
      const guest = data.guests.find(
        (g) => g.name.toLowerCase() === who.toLowerCase()
      );

      if (guest) {
        guest.points += pointsNum;
      } else {
        data.guests.push({ name: who, points: pointsNum });
      }

      // If no requestId (old-style link), add a new approved feed entry
      if (!requestId) {
        data.feed.push({
          name: who,
          points: pointsNum,
          reason: reason || "Points approved",
          status: "approved",
          timestamp: new Date().toISOString(),
        });
      }

      await store.setJSON("data", data);

      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html" },
        body: `<html><head><style>${css}</style></head><body>
          <div class="emoji">✅</div>
          <h1>Points Approved!</h1>
          <p><strong>${who}</strong> has been awarded <strong>${pointsNum} points</strong>!</p>
          <p>Reason: ${reason || "—"}</p>
          <p style="color:#999; margin-top:2rem;">The leaderboard has been updated. You can close this tab.</p>
        </body></html>`,
      };
    } catch (error) {
      console.error("Error approving points:", error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/html" },
        body: "<h1>Error</h1><p>Failed to update leaderboard. Please try again.</p>",
      };
    }
  }

  return {
    statusCode: 400,
    headers: { "Content-Type": "text/html" },
    body: "<h1>Invalid action</h1><p>Use approve or deny.</p>",
  };
};
