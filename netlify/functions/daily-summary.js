const { getStore } = require("@netlify/blobs");

// Runs daily at 9pm Hawaii time (07:00 UTC)
exports.handler = async () => {
  try {
    const store = getStore({ name: "leaderboard", siteID: process.env.SITE_ID, token: process.env.NETLIFY_TOKEN });
    const data = await store.get("data", { type: "json" });

    if (!data || !data.guests || data.guests.length === 0) return { statusCode: 200, body: "No data" };

    const SLACK_WEBHOOK = process.env.WEDDING_POINTS_SLACK_WEBHOOK;
    if (!SLACK_WEBHOOK) return { statusCode: 200, body: "No webhook configured" };

    // Sort guests by points descending
    const sorted = [...data.guests].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

    const medals = ["🥇", "🥈", "🥉"];
    const top = sorted.slice(0, 3).filter(g => g.points > 0);
    const withPoints = sorted.filter(g => g.points > 0).length;
    const totalPoints = sorted.reduce((sum, g) => sum + g.points, 0);

    // Build leaderboard lines (show everyone with points, max 15)
    const lines = sorted
      .filter(g => g.points > 0)
      .slice(0, 15)
      .map((g, i) => {
        const medal = i < 3 ? medals[i] + " " : `${i + 1}. `;
        return `${medal}*${g.name}* — ${g.points} pts`;
      });

    if (lines.length === 0) {
      await fetch(SLACK_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "📊 *Daily Leaderboard Update* — No points have been claimed yet! Get out there! 🌊🦅" }),
      });
      return { statusCode: 200, body: "Posted" };
    }

    const topNames = top.map((g, i) => `${medals[i]} ${g.name}`).join("  ");

    const message = [
      `📊 *Daily Leaderboard Update — ${new Date().toLocaleDateString("en-US", { timeZone: "Pacific/Honolulu", month: "long", day: "numeric" })}*`,
      `_${withPoints} guest${withPoints !== 1 ? "s" : ""} on the board · ${totalPoints} total points claimed_`,
      "",
      lines.join("\n"),
      sorted.length > 15 ? `_…and ${sorted.filter(g => g.points > 0).length - 15} more_` : "",
      "",
      `🏆 Current leader: ${topNames}`,
      `👉 Full leaderboard: https://andrewzinniawedding.netlify.app/leaderboard.html`,
    ].filter(l => l !== undefined).join("\n");

    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    return { statusCode: 200, body: "Daily summary posted" };
  } catch (err) {
    console.error("Daily summary error:", err);
    return { statusCode: 500, body: "Error" };
  }
};
