// SERVER-SIDE VEHICLE SYSTEM
const vehicleDB = require('./vehicle-list.js');

mp.events.add('playerReady', (player) => {
    console.log(`[Server] Vehicle system ready for ${player.name}`);
});

// Get vehicle list for client
mp.events.add('getVehicleList', (player) => {
    const availableVehicles = vehicleDB.filter(veh => 
        !veh.adminOnly || player.adminLevel > 0
    );
    
    player.call('receiveVehicleList', [availableVehicles]);
    console.log(`[Server] Sent vehicle list to ${player.name}`);
});

// Spawn vehicle command (Server-side)
mp.events.addCommand('spawncar', (player, fullText, carName) => {
    if (!carName) {
        player.outputChatBox('~y~Usage: /spawncar [car-name]');
        player.outputChatBox('~y~Use /vehlist to see available cars');
        return;
    }

    const vehicle = vehicleDB.find(v => 
        v.spawnName.toLowerCase() === carName.toLowerCase() ||
        v.displayName.toLowerCase().includes(carName.toLowerCase())
    );

    if (!vehicle) {
        player.outputChatBox(`~r~Vehicle '${carName}' not found.`);
        return;
    }

    // Permission check
    if (vehicle.adminOnly && player.adminLevel === 0) {
        player.outputChatBox('~r~This vehicle is for administrators only.');
        return;
    }

    // Request client to spawn the vehicle
    player.call('clientSpawnVehicle', [vehicle.modelName]);
    console.log(`[Server] ${player.name} requested vehicle: ${vehicle.displayName}`);
});

// Admin: Spawn vehicle for another player
mp.events.addCommand('givecar', (player, fullText, targetName, carName) => {
    if (player.adminLevel === 0) {
        player.outputChatBox('~r~This command is for administrators only.');
        return;
    }

    if (!targetName || !carName) {
        player.outputChatBox('~y~Usage: /givecar [player] [car-name]');
        return;
    }

    const target = mp.players.toArray().find(p => 
        p.name.toLowerCase().includes(targetName.toLowerCase())
    );

    if (!target) {
        player.outputChatBox(`~r~Player '${targetName}' not found.`);
        return;
    }

    const vehicle = vehicleDB.find(v => 
        v.spawnName.toLowerCase() === carName.toLowerCase()
    );

    if (!vehicle) {
        player.outputChatBox(`~r~Vehicle '${carName}' not found.`);
        return;
    }

    target.call('clientSpawnVehicle', [vehicle.modelName]);
    player.outputChatBox(`~g~Gave ${vehicle.displayName} to ${target.name}`);
    console.log(`[Admin] ${player.name} gave ${vehicle.displayName} to ${target.name}`);
});

// List available vehicles
mp.events.addCommand('vehlist', (player) => {
    const availableVehicles = vehicleDB.filter(veh => 
        !veh.adminOnly || player.adminLevel > 0
    );

    player.outputChatBox('~b~=== Available Vehicles ===');
    
    // Group by category
    const categories = {};
    availableVehicles.forEach(veh => {
        if (!categories[veh.category]) categories[veh.category] = [];
        categories[veh.category].push(veh);
    });

    for (const category in categories) {
        player.outputChatBox(`~o~${category.toUpperCase()}~w~:`);
        categories[category].forEach(veh => {
            player.outputChatBox(`  /spawncar ${veh.spawnName.padEnd(12)} - ${veh.displayName}`);
        });
    }
});

// Vehicle management commands
mp.events.addCommand('vehcount', (player) => {
    const vehicleCount = mp.vehicles.toArray().length;
    player.outputChatBox(`~y~Total vehicles in world: ${vehicleCount}`);
});

mp.events.addCommand('clearvehicles', (player) => {
    if (player.adminLevel === 0) {
        player.outputChatBox('~r~This command is for administrators only.');
        return;
    }

    const vehicles = mp.vehicles.toArray();
    vehicles.forEach(vehicle => {
        if (!vehicle.player) { // Don't delete player's current vehicle
            vehicle.destroy();
        }
    });

    player.outputChatBox(`~g~Cleared all unused vehicles.`);
    console.log(`[Admin] ${player.name} cleared all vehicles`);
});

// Save player's vehicle
mp.events.addCommand('savecar', (player) => {
    const vehicle = player.vehicle;
    if (!vehicle) {
        player.outputChatBox('~r~You are not in a vehicle.');
        return;
    }

    // Here you would save to database
    player.outputChatBox(`~g~Vehicle saved! (Database integration needed)`);
});

// Vehicle info command
mp.events.addCommand('vehicleinfo', (player) => {
    const vehicle = player.vehicle;
    if (!vehicle) {
        player.outputChatBox('~r~You are not in a vehicle.');
        return;
    }

    const vehicleInfo = vehicleDB.find(v => v.modelName === vehicle.model);
    
    player.outputChatBox('~b~=== Vehicle Info ===');
    player.outputChatBox(`~w~Model: ${vehicle.model}`);
    player.outputChatBox(`~w~Health: ${Math.round(vehicle.getHealth() / 10)}%`);
    
    if (vehicleInfo) {
        player.outputChatBox(`~w~Name: ${vehicleInfo.displayName}`);
        player.outputChatBox(`~w~Category: ${vehicleInfo.category}`);
        player.outputChatBox(`~w~Max Speed: ${vehicleInfo.maxSpeed} km/h`);
    }
});

console.log('[Server] Vehicle system loaded successfully');