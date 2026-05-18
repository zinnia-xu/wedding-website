const { getStore } = require("@netlify/blobs");

const css = `
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; color: #1A1A1A; padding: 1.5rem; background: #FFF8F0; }
  h1 { font-size: 1.6rem; color: #1A3C2A; margin-bottom: 0.25rem; }
  .subtitle { color: #7A7A7A; font-size: 0.9rem; margin-bottom: 2rem; }
  .card { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .field { margin-bottom: 1.2rem; }
  .field label { display: block; font-weight: 600; font-size: 0.88rem; color: #4A4A4A; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .field .value { font-size: 1rem; color: #1A1A1A; }
  .field input[type=number], .field input[type=text] {
    width: 100%; padding: 0.7rem 0.9rem; border: 2px solid #E8456B;
    border-radius: 8px; font-size: 1.1rem; font-weight: 700; color: #E8456B;
    background: #FFF0F3; outline: none; box-sizing: border-box;
  }
  .field input[type=text] { font-size: 0.95rem; font-weight: 400; color: #1A1A1A; border-color: #ccc; background: #fff; }
  .field input[type=number]:focus { box-shadow: 0 0 0 3px rgba(232,69,107,0.15); }
  .field input[type=text]:focus { box-shadow: 0 0 0 3px rgba(0,0,0,0.08); border-color: #1A3C2A; }
  .btn {
    width: 100%; padding: 0.85rem; border: none; border-radius: 8px;
    font-size: 1rem; font-weight: 700; cursor: pointer; transition: opacity 0.2s;
  }
  .btn:hover { opacity: 0.88; }
  .btn-approve { background: #E8456B; color: #fff; margin-top: 0.5rem; }
  .original { font-size: 0.85rem; color: #7A7A7A; margin-top: 0.3rem; }
  .success { text-align: center; padding: 2rem 0; }
  .success .emoji { font-size: 3rem; }
  .success h2 { color: #1A3C2A; margin: 0.5rem 0; }
  .success p { color: #4A4A4A; }
  .already { text-align: center; padding: 2rem 0; }
  .already .emoji { font-size: 3rem; }
`;

async function updateSlackMessage(token, channel, ts, who, points, reason, label, color) {
  if (!token || !channel || !ts) return;
  try {
    await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        channel, ts,
        text: `✏️ ADJUSTED: ${who} · ${points} pts · ${reason}`,
        blocks: [{
          type: "section",
          text: { type: "mrkdwn", text: `✏️ *${label}* — *${who}* · *${points} points* · _${reason}_` }
        }],
        attachments: [{ color, fallback: label }],
      }),
    });
  } catch (err) {
    console.warn("Could not update Slack message:", err.message);
  }
}

exports.handler = async (event) => {
  const headers = { "Content-Type": "text/html" };
  const params = event.queryStringParameters || {};
  const { who, points, reason, requestId } = params;

  if (!who || !reason || !requestId) {
    return { statusCode: 400, headers, body: `<html><head><style>${css}</style></head><body><h1>Invalid link</h1></body></html>` };
  }

  const originalPoints = parseInt(points, 10) || 0;

  // ── GET: Show the adjustment form ──
  if (event.httpMethod === "GET") {
    // Check if already processed
    try {
      const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
      const data = await store.get("data", { type: "json" });
      if (data) {
        const entry = data.feed.find(f => f.requestId === requestId);
        if (entry && entry.status !== "pending") {
          return {
            statusCode: 200, headers,
            body: `<html><head><style>${css}</style></head><body>
              <div class="already"><div class="emoji">⚠️</div>
              <h2>Already Processed</h2>
              <p>This request was already <strong>${entry.status}</strong> (${entry.points} pts).</p>
              <p style="color:#999;margin-top:1rem;">You can close this tab.</p></div>
            </body></html>`,
          };
        }
      }
    } catch (e) { /* ignore, show form anyway */ }

    return {
      statusCode: 200, headers,
      body: `<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
      <body>
        <h1>✏️ Adjust Points</h1>
        <p class="subtitle">Review and set the final points for this request before approving.</p>
        <div class="card">
          <div class="field"><label>Who</label><div class="value">${who}</div></div>
          <div class="field"><label>Reason</label><div class="value">${reason}</div></div>
          <div class="field">
            <label>Points to Award</label>
            <input type="number" id="pts" value="${originalPoints}" step="1" autofocus>
            <div class="original">Original request: ${originalPoints} pts · Negative values allowed</div>
          </div>
          <div class="field">
            <label>Comment <span style="font-weight:400;color:#999">(optional — shown in Points Activity)</span></label>
            <input type="text" id="comment" placeholder="e.g. Partial credit — great effort though!">
          </div>
          <button class="btn btn-approve" onclick="submitAdjust()">✅ Approve with Adjusted Points</button>
          <div id="status" style="margin-top:1rem;text-align:center;color:#7A7A7A;font-size:0.9rem;"></div>
        </div>
        <script>
          function submitAdjust() {
            const pts = parseInt(document.getElementById('pts').value, 10);
            const comment = document.getElementById('comment').value.trim();
            if (isNaN(pts) || pts === 0) { document.getElementById('status').textContent = 'Please enter a non-zero number of points.'; return; }
            document.querySelector('.btn-approve').disabled = true;
            document.getElementById('status').textContent = 'Saving…';
            fetch(window.location.href, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adjustedPoints: pts, adminComment: comment || undefined })
            })
            .then(r => r.json())
            .then(d => {
              if (d.success) {
                document.querySelector('.card').innerHTML = '<div class="success"><div class="emoji">✅</div><h2>Points Awarded!</h2><p><strong>${who}</strong> received <strong>' + pts + ' points</strong>.<br>Reason: ${reason}</p><p style="color:#999;margin-top:1.5rem;">You can close this tab.</p></div>';
              } else {
                document.getElementById('status').textContent = d.error || 'Something went wrong.';
                document.querySelector('.btn-approve').disabled = false;
              }
            })
            .catch(() => {
              document.getElementById('status').textContent = 'Network error. Please try again.';
              document.querySelector('.btn-approve').disabled = false;
            });
          }
        </script>
      </body></html>`,
    };
  }

  // ── POST: Process the adjusted approval ──
  if (event.httpMethod === "POST") {
    const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
    try {
      const body = JSON.parse(event.body || "{}");
      const adjustedPoints = parseInt(body.adjustedPoints, 10);
      const adminComment = body.adminComment || null;
      if (isNaN(adjustedPoints) || adjustedPoints === 0) {
        return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ error: "Invalid points value — must be a non-zero number" }) };
      }

      const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };

      // Idempotency check
      const entry = data.feed.find(f => f.requestId === requestId);
      if (entry && entry.status !== "pending") {
        return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ error: `Already ${entry.status}` }) };
      }

      // Update the feed entry
      if (entry) {
        entry.status = "approved";
        entry.points = adjustedPoints;
        if (adminComment) entry.adminComment = adminComment;
        const slackLabel = adminComment
          ? `ADJUSTED & APPROVED (was ${originalPoints} pts) — ${adminComment}`
          : `ADJUSTED & APPROVED (was ${originalPoints} pts)`;
        await updateSlackMessage(
          process.env.SLACK_BOT_TOKEN,
          entry.slackChannel, entry.slackTs,
          who, adjustedPoints, reason,
          slackLabel,
          "#1565c0"
        );
      }

      // Award points to guest
      const guest = data.guests.find(g => g.name.toLowerCase() === who.toLowerCase());
      if (guest) {
        guest.points += adjustedPoints;
      } else {
        data.guests.push({ name: who, points: adjustedPoints });
      }

      await store.setJSON("data", data);
      return { statusCode: 200, headers: jsonHeaders, body: JSON.stringify({ success: true }) };
    } catch (err) {
      console.error("adjust-points error:", err);
      return { statusCode: 500, headers: jsonHeaders, body: JSON.stringify({ error: "Failed to adjust points" }) };
    }
  }

  return { statusCode: 405, headers, body: "<h1>Method not allowed</h1>" };
};
