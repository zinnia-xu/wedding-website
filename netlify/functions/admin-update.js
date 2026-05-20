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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Simple admin key check
  const ADMIN_KEY = process.env.ADMIN_KEY;
  const authHeader = event.headers.authorization || "";
  const providedKey = authHeader.replace("Bearer ", "");

  if (ADMIN_KEY && providedKey !== ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const body = JSON.parse(event.body);
    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });

    // Action: "set-guests" — replace the guest list
    if (body.action === "set-guests") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      data.guests = body.guests;
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, guests: data.guests }) };
    }

    // Action: "add-points" — award points to a guest
    if (body.action === "add-points") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const guest = data.guests.find((g) => g.name.toLowerCase() === body.name.toLowerCase());
      if (guest) {
        guest.points += body.points;
      } else {
        data.guests.push({ name: body.name, points: body.points });
      }
      data.feed.push({
        name: body.name,
        points: body.points,
        reason: body.reason || "Admin award",
        timestamp: new Date().toISOString(),
      });
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    // Action: "reset" — reset all data
    if (body.action === "reset") {
      const defaultData = { guests: body.guests || [], feed: [] };
      await store.setJSON("data", defaultData);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: defaultData }) };
    }

    // Action: "get" — just read current data
    if (body.action === "get") {
      const data = await store.get("data", { type: "json" });
      return { statusCode: 200, headers, body: JSON.stringify(data || { guests: [], feed: [] }) };
    }

    // Action: "reset-points" — zero out all guest points, keep guest list and feed intact
    if (body.action === "reset-points") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      data.guests = data.guests.map((g) => ({ ...g, points: 0 }));
      data.feed.push({
        name: "System",
        points: 0,
        reason: "All points reset to 0 by admin",
        timestamp: new Date().toISOString(),
        status: "approved",
      });
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    // Action: "remove-guest" — remove a guest from the leaderboard
    if (body.action === "remove-guest") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const idx = data.guests.findIndex((g) => g.name.toLowerCase() === body.name.toLowerCase());
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Guest not found" }) };
      }
      const removed = data.guests.splice(idx, 1)[0];
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, removed: removed.name, data }) };
    }

    // Action: "reset-feed" — clear the activity feed, keep guests and points
    if (body.action === "reset-feed") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      data.feed = [];
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data }) };
    }

    // Action: "toggle-visibility" — hide or show the public leaderboard
    if (body.action === "toggle-visibility") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      data.hidden = !!body.hidden;
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, hidden: data.hidden }) };
    }

    // Action: "approve-request" — approve a pending points request (optionally with adjusted points)
    if (body.action === "approve-request") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const entry = data.feed.find(f => f.requestId === body.requestId);
      if (!entry) return { statusCode: 404, headers, body: JSON.stringify({ error: "Request not found" }) };
      if (entry.status !== "pending") return { statusCode: 409, headers, body: JSON.stringify({ error: `Already ${entry.status}` }) };
      entry.status = "approved";
      // Allow admin to override point value
      if (body.adjustedPoints !== undefined) entry.points = parseInt(body.adjustedPoints, 10);
      // Save optional admin comment to show in Points Activity
      if (body.adminComment) entry.adminComment = body.adminComment;
      const guest = data.guests.find(g => g.name.toLowerCase() === entry.name.toLowerCase());
      if (guest) { guest.points += entry.points; } else { data.guests.push({ name: entry.name, points: entry.points }); }
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, awardedPoints: entry.points }) };
    }

    // Action: "deny-request" — deny a pending points request
    if (body.action === "deny-request") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const entry = data.feed.find(f => f.requestId === body.requestId);
      if (!entry) return { statusCode: 404, headers, body: JSON.stringify({ error: "Request not found" }) };
      if (entry.status !== "pending") return { statusCode: 409, headers, body: JSON.stringify({ error: `Already ${entry.status}` }) };
      entry.status = "denied";
      if (body.denyReason) entry.denyReason = body.denyReason;
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Action: "delete-feed-entry" — remove a specific entry from the activity feed by timestamp + name
    // Also deducts the points from the guest if the entry was approved
    if (body.action === "delete-feed-entry") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const idx = data.feed.findIndex(
        f => f.timestamp === body.timestamp && f.name === body.name
      );
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Feed entry not found" }) };
      }
      const removed = data.feed.splice(idx, 1)[0];
      // Deduct points only if the entry was approved (not pending or denied)
      if (removed.status === "approved" && removed.points) {
        const guest = data.guests.find(g => g.name.toLowerCase() === removed.name.toLowerCase());
        if (guest) {
          guest.points -= removed.points;
        }
      }
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, removed, pointsDeducted: removed.status === "approved" ? removed.points : 0 }) };
    }

    // Action: "delete-feed-entry-public" — remove entry, deduct points, post a visible rejection note to feed
    if (body.action === "delete-feed-entry-public") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const idx = data.feed.findIndex(
        f => f.timestamp === body.timestamp && f.name === body.name
      );
      if (idx === -1) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Feed entry not found" }) };
      }
      const removed = data.feed.splice(idx, 1)[0];
      // Deduct points if the entry was approved
      if (removed.status === "approved" && removed.points) {
        const guest = data.guests.find(g => g.name.toLowerCase() === removed.name.toLowerCase());
        if (guest) guest.points -= removed.points;
      }
      // Add a public rejection entry to the feed
      data.feed.push({
        name: removed.name,
        points: removed.points,
        reason: removed.reason,
        status: "rejected",
        adminComment: body.comment || "Points request rejected by admin",
        timestamp: new Date().toISOString(),
      });
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Action: "add-feed-comment" — attach a comment to an existing feed entry without changing points
    if (body.action === "add-feed-comment") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const entry = data.feed.find(
        f => f.timestamp === body.timestamp && f.name === body.name
      );
      if (!entry) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Feed entry not found" }) };
      }
      entry.adminComment = body.comment;
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // Action: "edit-feed-entry" — change the points and/or reason of an existing approved entry
    if (body.action === "edit-feed-entry") {
      let data = (await store.get("data", { type: "json" })) || { guests: [], feed: [] };
      const entry = data.feed.find(
        f => f.timestamp === body.timestamp && f.name === body.name
      );
      if (!entry) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Feed entry not found" }) };
      }
      const oldPoints = entry.points || 0;
      const newPoints = parseInt(body.newPoints, 10);
      const diff = newPoints - oldPoints;
      // Update the entry
      entry.points = newPoints;
      if (body.newReason !== undefined) entry.reason = body.newReason;
      // Adjust guest total if the entry is approved
      if ((entry.status === "approved" || !entry.status) && diff !== 0) {
        const guest = data.guests.find(g => g.name.toLowerCase() === entry.name.toLowerCase());
        if (guest) guest.points += diff;
      }
      await store.setJSON("data", data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, diff }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action." }) };
  } catch (error) {
    console.error("Admin update error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
