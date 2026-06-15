import Meta from '../api/meta';
import { DeckMeta } from '../models/models';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

interface CardVersion {
    cardId: number;
    version: 'normal' | 'evo' | 'hero';
}

interface DeckStats {
    wins: number;
    losses: number;
    cardVersions: CardVersion[];
}

export default class MetaBuilder {
    private meta: Meta;

    constructor() {
        this.meta = new Meta();
    }

    async buildMetaDatabase(): Promise<DeckMeta[]> {
        console.log('Starting meta database build...');
        const startTime = Date.now();

        try {
            const topPlayers = await this.scrapeTopPlayers();
            console.log(`Scraped ${topPlayers.length} top players from RoyaleAPI leaderboard`);

            if (topPlayers.length === 0) {
                console.warn('No top players found.');
                return [];
            }

            const deckStats = new Map<string, DeckStats>();

            const batchSize = 10;
            for (let i = 0; i < topPlayers.length; i += batchSize) {
                const batch = topPlayers.slice(i, i + batchSize);
                const promises = batch.map(tag => this.processBattleLog(tag, deckStats));

                await Promise.all(promises);
                console.log(`Processed ${Math.min(i + batchSize, topPlayers.length)}/${topPlayers.length} players`);
            }

            const metaDecks = this.aggregateDecks(deckStats);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`Meta database built in ${elapsed}s with ${metaDecks.length} unique decks`);

            return metaDecks;
        } catch (error) {
            console.error('Error building meta database:', error);
            throw error;
        }
    }

    private async scrapeTopPlayers(): Promise<string[]> {
        let browser;
        try {
            console.log('Launching browser to scrape RoyaleAPI leaderboard...');
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();

            // Capture browser console logs
            page.on('console', msg => {
                console.log(`[Browser Console] ${msg.text()}`);
            });

            await page.goto('https://royaleapi.com/players/leaderboard', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            console.log('Page loaded, extracting player links...');

            const pageData = await page.evaluate(() => {
                const tags: string[] = [];

                // Log page structure
                const title = document.title;
                const totalLinks = document.querySelectorAll('a').length;

                // Try different selectors
                const links1 = document.querySelectorAll('a[href*="/player/"]');
                const linksCount = links1.length;

                // Log first few links to see structure
                const sampleLinks: string[] = [];
                const allLinks = Array.from(document.querySelectorAll('a')).slice(0, 20);
                allLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    const text = link.textContent?.substring(0, 30);
                    if (href && href.includes('player')) {
                        sampleLinks.push(`${href} | ${text}`);
                    }
                });

                // Try to find player data in different ways
                links1.forEach((link) => {
                    const href = link.getAttribute('href');
                    if (href) {
                        const match = href.match(/\/player\/([A-Z0-9]+)/);
                        if (match && match[1]) {
                            const tag = `#${match[1]}`;
                            if (!tags.includes(tag)) {
                                tags.push(tag);
                            }
                        }
                    }
                });

                return {
                    title,
                    totalLinks,
                    linksCount,
                    sampleLinks,
                    tags
                };
            });

            console.log('Page title:', pageData.title);
            console.log('Total links on page:', pageData.totalLinks);
            console.log('Links with /player/ in href:', pageData.linksCount);
            console.log('Sample links found:', pageData.sampleLinks);
            console.log('Extracted player tags:', pageData.tags.length);

            const playerTags = pageData.tags;

            console.log(`Extracted ${playerTags.length} unique player tags`);
            return playerTags.slice(0, 200);
        } catch (error) {
            console.error('Error scraping RoyaleAPI leaderboard:', error);
            return [];
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    private async processBattleLog(playerTag: string, deckStats: Map<string, DeckStats>): Promise<void> {
        try {
            const battles = await this.meta.getPlayerBattlelog(playerTag);

            for (const battle of battles) {
                if (battle.type !== 'pathOfLegend' && battle.type !== 'rankedMatch') {
                    continue;
                }

                const playerTeam = battle.team[0];
                const playerOpponent = battle.opponent[0];
                const cardIds = playerTeam.cards.map(c => c.id);
                const deckKey = JSON.stringify(cardIds);

                const playerWon = playerTeam.crowns > playerOpponent.crowns;

                // Determine card versions based on iconUrls
                const cardVersions: CardVersion[] = playerTeam.cards.map(card => {
                    const iconUrls = (card as any).iconUrls || {};
                    let version: 'normal' | 'evo' | 'hero' = 'normal';

                    if (iconUrls.heroMedium) {
                        version = 'hero';
                    } else if (iconUrls.evolutionMedium) {
                        version = 'evo';
                    }

                    return { cardId: card.id, version };
                });

                if (!deckStats.has(deckKey)) {
                    deckStats.set(deckKey, { wins: 0, losses: 0, cardVersions });
                }

                const stats = deckStats.get(deckKey)!;
                if (playerWon) {
                    stats.wins++;
                } else {
                    stats.losses++;
                }
            }
        } catch (error) {
            console.error(`Error processing battle log for ${playerTag}:`, error);
        }
    }

    private aggregateDecks(deckStats: Map<string, DeckStats>): DeckMeta[] {
        const decks: DeckMeta[] = [];

        for (const [deckKey, stats] of deckStats) {
            const total = stats.wins + stats.losses;
            if (total < 3) {
                continue;
            }

            const cardIds = JSON.parse(deckKey) as number[];
            const winRate = stats.wins / total;

            decks.push({
                cardIds,
                winRate,
                uses: total,
                cardVersions: stats.cardVersions
            });
        }

        decks.sort((a, b) => b.winRate - a.winRate);
        return decks;
    }
}
