// CLIENT-SIDE VEHICLE LOADER
let vehicleModels = new Set();

// Receive vehicle list from server
mp.events.add('receiveVehicleList', (vehicleList) => {
    console.log('[Client] Received vehicle list from server');
    preloadVehicles(vehicleList);
});

// Preload all vehicles
function preloadVehicles(vehicleList) {
    console.log(`[Client] Preloading ${vehicleList.length} vehicles...`);
    
    vehicleList.forEach(vehicle => {
        const modelHash = mp.game.joaat(vehicle.modelName);
        
        if (!mp.game.streaming.hasModelLoaded(modelHash)) {
            mp.game.streaming.requestModel(modelHash);
            console.log(`[Client] Requested model: ${vehicle.modelName}`);
        }
    });
    
    // Check loading status
    checkLoadingStatus(vehicleList);
}

function checkLoadingStatus(vehicleList) {
    let loadedCount = 0;
    
    const checkInterval = setInterval(() => {
        loadedCount = 0;
        
        vehicleList.forEach(vehicle => {
            const modelHash = mp.game.joaat(vehicle.modelName);
            if (mp.game.streaming.hasModelLoaded(modelHash)) {
                vehicleModels.add(vehicle.modelName);
                loadedCount++;
            }
        });
        
        if (loadedCount === vehicleList.length) {
            clearInterval(checkInterval);
            console.log(`[Client] All ${vehicleList.length} vehicles loaded successfully!`);
        }
    }, 100);
}

// Spawn vehicle from server request
mp.events.add('clientSpawnVehicle', (modelName) => {
    const player = mp.players.local;
    const modelHash = mp.game.joaat(modelName);
    
    if (!mp.game.streaming.hasModelLoaded(modelHash)) {
        mp.game.streaming.requestModel(modelHash);
        mp.gui.chat.push(`~y~Loading vehicle, please wait...`);
        
        setTimeout(() => {
            if (mp.game.streaming.hasModelLoaded(modelHash)) {
                spawnVehicle(modelName);
            } else {
                mp.gui.chat.push(`~r~Failed to load vehicle: ${modelName}`);
            }
        }, 2000);
        return;
    }
    
    spawnVehicle(modelName);
});

function spawnVehicle(modelName) {
    const player = mp.players.local;
    const position = player.position;
    const heading = player.heading;
    const modelHash = mp.game.joaat(modelName);
    
    const spawnPos = new mp.Vector3(
        position.x + (Math.sin(heading) * 5),
        position.y + (Math.cos(heading) * 5),
        position.z + 0.5
    );
    
    try {
        const vehicle = mp.vehicles.new(modelHash, spawnPos, {
            heading: heading,
            numberPlate: 'PLAYER',
            engine: true
        });
        
        // Put player in vehicle after a short delay
        setTimeout(() => {
            if (vehicle && mp.players.local) {
                mp.players.local.putIntoVehicle(vehicle, -1);
            }
        }, 500);
        
        mp.gui.chat.push(`~g~Vehicle spawned successfully!`);
        
    } catch (error) {
        console.error('[Client] Error spawning vehicle:', error);
        mp.gui.chat.push(`~r~Error spawning vehicle: ${error}`);
    }
}

// Request vehicle list when player is ready
mp.events.add('playerReady', () => {
    console.log('[Client] Player ready, requesting vehicle list...');
    mp.events.callRemote('getVehicleList');
});

console.log('[Client] Vehicle loader initialized');