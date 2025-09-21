// EASY VEHICLE CONFIGURATION - ADD ALL YOUR CARS HERE!
const vehicleList = [
    {
        spawnName: "AD_19LEOProgenT20RB",
        modelName: "AD_19LEOProgenT20RB", 
        displayName: "Pegassi Reaper",
        price: 750000,
        maxSpeed: 215,
        category: "super",
        dataFiles: {
            vehicles: "AD_19LEOProgenT20RB/vehicles.meta",    // Individual data file paths
            variations: "AD_19LEOProgenT20RB/carvariations.meta"
        }
    },
    {
        spawnName: "elegy",
        modelName: "elegy",
        displayName: "Annis Elegy RH8",
        price: 95000,
        maxSpeed: 190,
        category: "sports",
        dataFiles: {
            vehicles: "elegy/vehicles.meta",    // Individual data file paths
            variations: "elegy/carvariations.meta"
        }
    },
    {
        spawnName: "schafter3",
        modelName: "schafter3",
        displayName: "Benefactor Schafter V12",
        price: 115000,
        maxSpeed: 230,
        category: "sedan",
        dataFiles: {
            vehicles: "schafter3/vehicles.meta",    // Individual data file paths
            variations: "schafter3/carvariations.meta"
        }
    },
    // ADD MORE CARS BELOW - JUST COPY-PASTE THE FORMAT!
    {
        spawnName: "zentorno",
        modelName: "zentorno",
        displayName: "Pegassi Zentorno",
        price: 850000,
        maxSpeed: 220,
        category: "super",
        dataFiles: {
            vehicles: "zentorno/vehicles.meta",
            variations: "zentorno/carvariations.meta"
        }
    }
    // Add your other 10-15 cars here in the same format...
];

// Don't touch below this line
mp.vehicleList = vehicleList;