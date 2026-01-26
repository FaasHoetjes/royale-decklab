import Player from './src/api/player';

async function main() {
    const playerTag = '#2QGG92L9'; // My own playertag for testing
    const player = new Player(playerTag);

    const result = await player.getPlayerData();

    console.log("Found player!");
    console.log(`Player Name: ${result.name}`);
    console.log(`Player Tag: ${result.tag}`);
    console.log(`Current Deck Cards:`, result.currentDeck);
}

main();
