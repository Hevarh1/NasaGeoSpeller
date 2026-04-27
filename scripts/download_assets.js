const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const BASE_URL = 'https://science.nasa.gov/specials/your-name-in-landsat/images/';
const ASSETS_DIR = path.join(__dirname, '../assets');
const META_PATH = path.join(ASSETS_DIR, 'metadata.json');

// Known variant counts per letter (from NASA's interactive).
// If NASA adds more, the probe below will find them.
const KNOWN_MAX = {
    a: 5, b: 2, c: 3, d: 2, e: 4, f: 2, g: 1, h: 2,
    i: 5, j: 3, k: 2, l: 4, m: 3, n: 3, o: 2, p: 2,
    q: 2, r: 4, s: 3, t: 2, u: 3, v: 4, w: 2, x: 3,
    y: 3, z: 2
};

async function downloadAlphabet() {
    console.log('🛰️  Downloading NASA Landsat letter images...');
    await fs.ensureDir(ASSETS_DIR);

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    let newCount = 0;
    let cachedCount = 0;

    for (const char of letters) {
        const letterDir = path.join(ASSETS_DIR, char);
        await fs.ensureDir(letterDir);

        const probeLimit = (KNOWN_MAX[char] || 1) + 2;
        let consecutiveMisses = 0;
        let letterTotal = 0;

        for (let idx = 0; consecutiveMisses < 2 && idx < probeLimit; idx++) {
            const filename = `${idx}.jpg`;
            const dest = path.join(letterDir, filename);

            if (await fs.pathExists(dest)) {
                letterTotal++;
                cachedCount++;
                consecutiveMisses = 0;
                continue;
            }

            try {
                const url = `${BASE_URL}${char}_${idx}.jpg`;
                const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
                await fs.writeFile(dest, response.data);
                newCount++;
                letterTotal++;
                consecutiveMisses = 0;
                console.log(`  ✅ ${char.toUpperCase()}/${idx} (new)`);
            } catch (err) {
                if (err.response && (err.response.status === 404 || err.response.status === 403)) {
                    consecutiveMisses++;
                } else {
                    const reason = ['ECONNREFUSED','ENOTFOUND','ETIMEDOUT'].includes(err.code)
                        ? 'no internet?'
                        : err.message;
                    console.log(`  ⚠️  ${char.toUpperCase()}/${idx} — ${reason}`);
                    consecutiveMisses++;
                }
            }
        }

        if (letterTotal > 0) {
            console.log(`📦 ${char.toUpperCase()}: ${letterTotal} variant(s)`);
        } else {
            console.log(`❌ ${char.toUpperCase()}: no images found`);
        }
    }

    console.log(`\n🎉 Done! ${newCount} new, ${cachedCount} cached.`);

    await refreshMetadata();
}

async function refreshMetadata() {
    try {
        console.log('\n📡 Refreshing metadata from NASA...');
        const jsUrl = 'https://science.nasa.gov/specials/your-name-in-landsat/assets/main.min.js';
        const response = await axios.get(jsUrl, { timeout: 15000 });
        const js = response.data;

        const entries = [];
        const regex = /"([a-z]_\d+)"==x\.alt&&\(locationTitle\.innerHTML="([^"]*)"[^]*?locationCoordinates\.innerHTML="([^"]*)"/g;

        let match;
        while ((match = regex.exec(js)) !== null) {
            entries.push({
                id: match[1],
                location: match[2],
                coordinates: match[3]
            });
        }

        if (entries.length > 0) {
            await fs.writeFile(META_PATH, JSON.stringify(entries, null, 2));
            console.log(`📋 Metadata refreshed: ${entries.length} entries`);
        } else {
            console.log('📋 Could not parse metadata — keeping existing file');
        }
    } catch (err) {
        console.log('📋 Could not refresh metadata — keeping existing file');
    }
}

downloadAlphabet();
