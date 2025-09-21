// packages/login-system/index.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

console.log('[login-system] server index.js loaded');

const DB = {
  host: 'localhost',
  user: 'patel',     // ← your MySQL username
  password: 'patel', // ← your MySQL password
  database: 'rage_mp_server',
  waitForConnections: true,
  connectionLimit: 10,
};

let pool;
(async () => {
  try {
    pool = mysql.createPool(DB);
    const c = await pool.getConnection();
    c.release();
    console.log('[login-system] Database connected successfully ✅');
  } catch (e) {
    console.error('[login-system] Database connection FAILED ❌', e);
  }
})();

// ===== Helpers =====
const normalizePhpBcrypt = (h) => (h && h.startsWith('$2y$') ? h.replace('$2y$', '$2a$') : h);

async function getIdentifierRow(playerId) {
  try {
    const [rows] = await pool.query('SELECT id, rockstar_id, device_id, ip_address FROM player_identifiers WHERE player_id = ? LIMIT 1', [playerId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function upsertIdentifier(playerId, rockstarId, deviceId, ip) {
  try {
    const row = await getIdentifierRow(playerId);
    if (!row) {
      await pool.query(
        'INSERT INTO player_identifiers (player_id, rockstar_id, device_id, ip_address) VALUES (?,?,?,?)',
        [playerId, String(rockstarId || ''), String(deviceId || ''), String(ip || '')]
      );
    } else {
      await pool.query(
        'UPDATE player_identifiers SET rockstar_id=?, device_id=?, ip_address=?, last_seen=NOW() WHERE player_id=?',
        [String(rockstarId || ''), String(deviceId || ''), String(ip || ''), playerId]
      );
    }
  } catch (e) {
    console.warn('[login-system] upsertIdentifier skipped:', e.message);
  }
}

async function countAccountsForRockstar(rockstarId) {
  try {
    const [rows] = await pool.query('SELECT COUNT(DISTINCT player_id) AS cnt FROM player_identifiers WHERE rockstar_id = ?', [String(rockstarId || '')]);
    return rows[0]?.cnt || 0;
  } catch {
    return 0;
  }
}

// ===== Handshake: UI on join =====
mp.events.add('playerJoin', (player) => {
  console.log(`[login-system] playerJoin -> ${player.name}`);
  // Fallback: show UI after a brief delay
  setTimeout(() => { try { player.call('auth:showUI'); } catch {} }, 1500);
});

// Also allow client to ask explicitly
mp.events.add('auth:clientReady', (player) => {
  console.log(`[login-system] auth:clientReady from ${player.name} -> show UI`);
  player.call('auth:showUI');
});

// ===== LOGIN =====
mp.events.add('auth:attemptLogin', async (player, email, plainPw) => {
  console.log(`[login-system] Login attempt by ${player.name} email="${email}"`);
  try {
    email   = String(email || '').trim().toLowerCase();
    plainPw = String(plainPw || '');

    if (!email && !plainPw) return player.call('auth:loginResponse', [JSON.stringify({ success:false, message:'missing_email_password' })]);
    if (!email)              return player.call('auth:loginResponse', [JSON.stringify({ success:false, message:'missing_email' })]);
    if (!plainPw)            return player.call('auth:loginResponse', [JSON.stringify({ success:false, message:'missing_password' })]);

    const [rows] = await pool.query('SELECT * FROM players WHERE email = ? LIMIT 1', [email]);
    if (!rows.length) return player.call('auth:loginResponse', [JSON.stringify({ success:false, message:'invalid_credentials' })]);

    const user = rows[0];
    const ok = await bcrypt.compare(plainPw, normalizePhpBcrypt(user.password));
    if (!ok) return player.call('auth:loginResponse', [JSON.stringify({ success:false, message:'invalid_credentials' })]);

    // Save identifiers on successful login
    const rgsc   = player.rgscId;
    const serial = player.serial;
    const ip     = player.ip;
    await upsertIdentifier(user.id, rgsc, serial, ip);

    // Update last login + history
    await pool.query('UPDATE players SET last_login = NOW() WHERE id = ?', [user.id]);
    await pool.query('INSERT INTO login_history (player_id, ip_address, device_id, successful) VALUES (?,?,?,TRUE)', [user.id, ip || '', serial || '']);

    // Success
    player.setVariable('loggedIn', true);
    player.data.userId = user.id;

    player.call('auth:loginResponse', [JSON.stringify({
      success: true,
      message: 'ok',
      user: { id: user.id, username: user.username, email: user.email }
    })]);

    console.log(`[login-system] Login success -> ${user.username} (${user.email})`);
  } catch (e) {
    console.error('[login-system] Login error:', e);
    player.call('auth:loginResponse', [JSON.stringify({ success:false, message:'server_error' })]);
  }
});

// ===== REGISTER (limit: max 2 accounts per same Rockstar ID) =====
mp.events.add('auth:attemptRegister', async (player, username, email, password, confirm) => {
  console.log(`[login-system] Register attempt by ${player.name} email="${email}"`);
  try {
    username = String(username || '').trim();
    email    = String(email || '').trim().toLowerCase();
    password = String(password || '');
    confirm  = String(confirm || '');

    if (!username || !email || !password || !confirm) {
      return player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'missing_fields' })]);
    }
    if (password !== confirm) {
      return player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'password_mismatch' })]);
    }

    // First Last, letters only, >= 3 each
    const parts = username.split(' ').filter(Boolean);
    const nameOk = (parts.length === 2 && /^[A-Za-z]{3,}$/.test(parts[0]) && /^[A-Za-z]{3,}$/.test(parts[1]));
    if (!nameOk) return player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'bad_username' })]);

    // Strong password & blacklist
    const blacklist = new Set(['12345678','11111111','2121212121','abcdabcd']);
    const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (blacklist.has(password) || !strong.test(password)) {
      return player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'weak_password' })]);
    }

    // Rockstar limit: max 2 accounts per same rockstar_id
    const rgsc = player.rgscId;
    if (rgsc) {
      const count = await countAccountsForRockstar(rgsc);
      if (count >= 2) {
        return player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'rockstar_limit' })]);
      }
    }

    // Email duplicate?
    const [dupe] = await pool.query('SELECT id FROM players WHERE email = ? LIMIT 1', [email]);
    if (dupe.length) return player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'email_exists' })]);

    // Create user
    const hash = await bcrypt.hash(password, 10);
    const [res] = await pool.query('INSERT INTO players (username, email, password) VALUES (?,?,?)', [username, email, hash]);

    // Save identifiers
    await upsertIdentifier(res.insertId, rgsc, player.serial, player.ip);

    player.call('auth:registerResponse', [JSON.stringify({ success:true, message:'ok', user_id: res.insertId })]);
    console.log(`[login-system] Registration success -> ${username} (${email}) id=${res.insertId}`);
  } catch (e) {
    console.error('[login-system] Register error:', e);
    player.call('auth:registerResponse', [JSON.stringify({ success:false, message:'server_error' })]);
  }
});
