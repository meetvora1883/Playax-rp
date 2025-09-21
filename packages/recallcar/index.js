// server-files/packages/recallcar/index.js
// Uses existing players table in rage_mp_server
// No new tables created.

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'patel',
  password: 'patel',
  database: 'rage_mp_server',
  waitForConnections: true,
  connectionLimit: 10
});

// Attach DB info on join
mp.events.add("playerJoin", async (player) => {
  try {
    // Try to match DB row by username = player.name
    const [rows] = await pool.execute(
      "SELECT id, username FROM players WHERE username = ? LIMIT 1",
      [player.name]
    );

    if (rows.length > 0) {
      player._dbId = rows[0].id;
      player._dbName = rows[0].username;
    } else {
      // Fallback: no DB row found, mark temp
      player._dbId = player.id;
      player._dbName = player.name;
    }
  } catch (e) {
    console.error("[recallcar] DB load error:", e);
    player._dbId = player.id;
    player._dbName = player.name;
  }

  player._singleCar = null;
  player._multiCars = [];
});

function destroyVehicleSafe(veh) {
  try {
    if (!veh) return;
    if (mp.vehicles.exists && mp.vehicles.exists(veh)) veh.destroy();
    else if (veh.destroy) veh.destroy();
  } catch (e) { console.error("[recallcar] destroy error:", e); }
}

function seatDriver(player, vehicle) {
  [200, 400, 650].forEach(delay => {
    setTimeout(() => {
      try { player.putIntoVehicle(vehicle, -1); } catch (_) {}
    }, delay);
  });
}

function spawnVehicleNearPlayer(player, model) {
  const pos = player.position;
  const fwd = player.getForwardVector ? player.getForwardVector() : { x: 1, y: 0, z: 0 };
  const spawnPos = new mp.Vector3(
    pos.x + (fwd.x || 1) * 2.5,
    pos.y + (fwd.y || 0) * 2.5,
    pos.z
  );
  return mp.vehicles.new(mp.joaat(model), spawnPos, {
    numberPlate: "Admin",
    dimension: player.dimension
  });
}

// /car
mp.events.addCommand("car", (player, fullText, modelArg) => {
  try {
    if (!modelArg) {
      player.outputChatBox(`[ERROR] ${player._dbName} [${player._dbId}] Usage: /car [model]`);
      return;
    }
    const model = modelArg.trim();
    if (player._singleCar) { destroyVehicleSafe(player._singleCar); player._singleCar = null; }

    const veh = spawnVehicleNearPlayer(player, model);
    player._singleCar = veh;
    seatDriver(player, veh);

    player.outputChatBox(`[car] ${player._dbName} [${player._dbId}] spawned: ${model}`);
  } catch (e) {
    console.error("[car] error:", e);
    player.outputChatBox(`[ERROR] ${player._dbName} [${player._dbId}] Failed to use /car`);
  }
});

// /carn
mp.events.addCommand("carn", (player, fullText, modelArg) => {
  try {
    if (!modelArg) {
      player.outputChatBox(`[ERROR] ${player._dbName} [${player._dbId}] Usage: /carn [model]`);
      return;
    }
    const model = modelArg.trim();
    const veh = spawnVehicleNearPlayer(player, model);
    if (!Array.isArray(player._multiCars)) player._multiCars = [];
    player._multiCars.push(veh);
    seatDriver(player, veh);

    player.outputChatBox(`[carn] ${player._dbName} [${player._dbId}] spawned: ${model}`);
  } catch (e) {
    console.error("[carn] error:", e);
    player.outputChatBox(`[ERROR] ${player._dbName} [${player._dbId}] Failed to use /carn`);
  }
});

// /removecar
mp.events.addCommand("removecar", (player) => {
  try {
    if (player._singleCar) { destroyVehicleSafe(player._singleCar); player._singleCar = null; }
    if (player._multiCars?.length) {
      for (const v of player._multiCars) destroyVehicleSafe(v);
      player._multiCars = [];
    }
    player.outputChatBox(`[car] ${player._dbName} [${player._dbId}] removed all cars`);
  } catch (e) {
    console.error("[removecar] error:", e);
    player.outputChatBox(`[ERROR] ${player._dbName} [${player._dbId}] Failed to use /removecar`);
  }
});

// Cleanup
mp.events.add("playerQuit", (player) => {
  try {
    if (player._singleCar) destroyVehicleSafe(player._singleCar);
    if (Array.isArray(player._multiCars)) {
      for (const v of player._multiCars) destroyVehicleSafe(v);
    }
  } catch (e) { console.error("[quit] cleanup error:", e); }
});
