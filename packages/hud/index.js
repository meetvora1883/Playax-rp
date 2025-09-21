// packages/hud/index.js
// Connects to MySQL, resolves player_id by SocialClub(rockstar_id), updates HUD.

const mysql = require("mysql2/promise");

console.log("[hud] server package loading...");

// TODO: put your DB creds here:
const DB = {
  host: "127.0.0.1",
  user: "patel",           // XAMPP default
  password: "patel",           // XAMPP default is empty
  database: "rage_mp_server",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
};

let pool;
(async () => {
  try {
    pool = await mysql.createPool(DB);
    // quick smoke test:
    await pool.query("SELECT 1");
    console.log("[hud] Database connected ✅");
  } catch (e) {
    console.log("[hud] Database connection FAILED ❌", e.message);
  }
})();

function onlineCount() { return mp.players.length; }

function broadcastOnline() {
  const count = onlineCount();
  mp.players.forEach(p => p.call("hud:setOnline", [count]));
}

function showHudFor(player) {
  const uid = player?.data?.userId || 0;
  player.call("hud:setId", [uid]);
  player.call("hud:setOnline", [onlineCount()]);
  console.log(`[hud] showHudFor → ${player.name}, userId=${uid}, online=${onlineCount()}`);
}

// === Resolve DB player_id from Social Club ID on join ===
mp.events.add("hud:identifiers", async (player, socialClubId) => {
  try {
    // Normalize value
    const sc = String(socialClubId || "").trim();
    if (!sc) {
      // nothing to resolve; still show something
      showHudFor(player);
      return;
    }

    // Query the newest identifier row and get its player_id
    const sql = `
      SELECT pi.player_id AS id
      FROM player_identifiers pi
      WHERE pi.rockstar_id = ?
      ORDER BY pi.last_seen DESC
      LIMIT 1
    `;
    const [rows] = await pool.query(sql, [sc]);

    if (rows.length > 0) {
      const id = rows[0].id;
      player.data.userId = id;              // save on player object
      player.call("hud:setId", [id]);       // push to HUD immediately
      console.log(`[hud] Resolved DB id=${id} for ${player.name} (rockstar_id=${sc})`);
    } else {
      // Not found; keep 0 until user logs in or registers
      console.log(`[hud] No DB id found for ${player.name} (rockstar_id=${sc})`);
      player.call("hud:setId", [0]);
    }

    // Also send current online count snapshot
    player.call("hud:setOnline", [onlineCount()]);
  } catch (e) {
    console.log("[hud] identifiers query error:", e.message);
  }
});

// === Player join/quit → live online updates ===
mp.events.add("playerJoin", (player) => {
  showHudFor(player);     // will show 0 until identifiers/login resolves
  broadcastOnline();
});

mp.events.add("playerQuit", (player) => {
  setTimeout(broadcastOnline, 50);
});

// === Client can ask to refresh snapshot ===
mp.events.add("hud:requestShow", (player) => {
  showHudFor(player);
});

// === Safety refresh every 30s ===
setInterval(broadcastOnline, 30000);

// OPTIONAL: If your login package calls this after success:
// mp.events.add("hud:show", (player) => {
//   showHudFor(player);
// });
