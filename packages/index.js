console.log("Server side main index.js is loaded");

mp.events.add("playerJoin", (player) => {
    player.outputChatBox(""); // empty string hides default message
    // Or add your own message
    // player.outputChatBox("Welcome to the server!");
});


// Spawn a car for a player
mp.events.addCommand("car", (player, fullText, vehicleName) => {
    vehicleName = vehicleName || "adder"; // default car
    let vehicle = mp.vehicles.new(vehicleName, player.position, {
        heading: player.heading,
        dimension: 0
    });
});

