// index.js - RAGE:MP server script with DB + commands

const mysql = require('mysql2/promise');

// MySQL connection pool
const db = mysql.createPool({
    host: 'localhost',
    user: 'patel',
    password: 'patel',
    database: 'rage_mp_server',
    waitForConnections: true,
    connectionLimit: 10
});

// When player connects, load DB info
mp.events.add('playerJoin', async (player) => {
    try {
        const rockstarId = player.socialClub; // Rockstar identifier

        const [rows] = await db.query(`
            SELECT p.id, p.username
            FROM players p
            JOIN player_identifiers i ON p.id = i.player_id
            WHERE i.rockstar_id = ?
            LIMIT 1
        `, [rockstarId]);

        if (rows.length > 0) {
            player.dbId = rows[0].id;
            player.accountName = rows[0].username;
            player.outputChatBox(`!{#2ecc71}Welcome back, ${player.accountName} [${player.dbId}]`);
        } else {
            player.dbId = null;
            player.accountName = player.name;
            player.outputChatBox(`!{#e67e22}Welcome, ${player.accountName} (not linked to DB)`);
        }
    } catch (err) {
        console.error("[DB ERROR]", err);
        player.accountName = player.name;
        player.dbId = null;
    }
});

// /settime H M S
mp.events.addCommand('settime', (player, fullText, h, m, s) => {
    const hour   = Math.max(0, Math.min(23, parseInt(h, 10) || 0));
    const minute = Math.max(0, Math.min(59, parseInt(m, 10) || 0));
    const second = Math.max(0, Math.min(59, parseInt(s, 10) || 0));

    mp.world.time.set(hour, minute, second);

    player.outputChatBox(`!{#2ecc71}Time set to ${hour}:${minute}:${second}`);
    player.outputChatBox(`!{#3498db}Command used by: ${player.accountName} [${player.dbId || "unknown"}]`);
});

// /setweather WEATHER_NAME
mp.events.addCommand('setweather', (player, fullText, weatherName) => {
    if (!weatherName) {
        player.outputChatBox("!{#e74c3c}Usage: /setweather WEATHER_NAME");
        return;
    }

    const weather = weatherName.toUpperCase();
    mp.world.weather = weather;

    player.outputChatBox(`!{#3498db}Weather set to ${weather}`);
    player.outputChatBox(`!{#3498db}Command used by: ${player.accountName} [${player.dbId || "unknown"}]`);
});


// RAGE:MP server-side script

mp.events.add("playerReady", (player) => {
    const serial = player.serial;
    console.log(`[RAGE:MP] Player connected: ${player.name} (id: ${player.id}) Serial: ${serial}`);
});
