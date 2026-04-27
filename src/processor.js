const { createCanvas, loadImage } = require('canvas');
const fs = require('fs-extra');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets');
const OUTPUT_DIR = path.join(__dirname, '../output');
const META_PATH = path.join(ASSETS_DIR, 'metadata.json');

async function loadMetadata() {
    try {
        return await fs.readJson(META_PATH);
    } catch {
        return [];
    }
}

async function processText(text, outputName, options = {}) {
    console.log(`\n🛰️  Processing: "${outputName}"`);

    if (!(await fs.pathExists(ASSETS_DIR))) {
        throw new Error('No assets found. Run `npm run setup` first.');
    }

    const metadata = (options.locations || options.coordinates) ? await loadMetadata() : [];
    const metaMap = {};
    for (const entry of metadata) {
        metaMap[entry.id] = entry;
    }

    const stripped = text.replace(/[a-zA-Z\s]/g, '');
    if (stripped.length > 0) {
        const bad = [...new Set(stripped.split(''))].join(' ');
        console.log(`❌ Invalid character(s): ${bad}`);
        console.log(`   Only letters a–z are allowed. Remove everything else and try again.`);
        return;
    }

    const cleanText = text.toLowerCase().replace(/\s+/g, ' ').trim();
    const words = cleanText.split(/\s+/).filter(w => w.length > 0);

    if (words.length === 0) {
        console.log('⚠️  No letters found in input.');
        return;
    }

    // Discover available variants per letter from assets/{letter}/ folders
    const variantMap = {};
    const letterDirs = await fs.readdir(ASSETS_DIR);
    for (const dir of letterDirs) {
        const dirPath = path.join(ASSETS_DIR, dir);
        if (!(await fs.stat(dirPath)).isDirectory()) continue;
        if (!/^[a-z]$/.test(dir)) continue;
        const files = await fs.readdir(dirPath);
        const indices = files
            .filter(f => /^\d+\.jpg$/.test(f))
            .map(f => parseInt(f.replace('.jpg', ''), 10))
            .sort((a, b) => a - b);
        if (indices.length > 0) variantMap[dir] = indices;
    }

    const outputFolder = path.join(OUTPUT_DIR, outputName);
    await fs.ensureDir(outputFolder);

    const letterCursor = {};
    const usedImages = [];

    for (const word of words) {
        const letterImgs = [];
        const letterIds = [];

        for (const c of word.split('')) {
            const variants = variantMap[c];
            if (!variants || variants.length === 0) {
                console.log(`  ⚠️  No image for "${c.toUpperCase()}"`);
                continue;
            }

            if (!letterCursor[c]) letterCursor[c] = 0;
            const pick = variants[letterCursor[c] % variants.length];
            letterCursor[c]++;

            try {
                const img = await loadImage(path.join(ASSETS_DIR, `${c}/${pick}.jpg`));
                letterImgs.push(img);
                letterIds.push(`${c}_${pick}`);
            } catch {
                console.log(`  ⚠️  Could not load ${c}/${pick}.jpg`);
            }
        }

        if (letterImgs.length === 0) continue;

        // Stitch all letter tiles into one PNG with 1% gap
        const tileW = letterImgs[0].width;
        const tileH = letterImgs[0].height;
        const gap = Math.round(tileW * 0.05);
        const canvas = createCanvas(letterImgs.length * tileW + (letterImgs.length - 1) * gap, tileH);
        const ctx = canvas.getContext('2d');

        letterImgs.forEach((img, idx) => {
            ctx.drawImage(img, idx * (tileW + gap), 0);
        });

        const pngPath = path.join(outputFolder, `${word}.png`);
        await fs.writeFile(pngPath, canvas.toBuffer('image/png'));

        usedImages.push(...letterIds);
        console.log(`  🖼️  ${word}.png (${letterImgs.length} tiles)`);
    }

    // Generate metadata file if requested
    if (options.locations || options.coordinates) {
        const lines = [];
        for (const imgId of usedImages) {
            const entry = metaMap[imgId];
            const parts = [imgId];
            if (options.locations && entry) parts.push(entry.location);
            if (options.coordinates && entry) parts.push(entry.coordinates);
            lines.push(parts.join(' | '));
        }

        const metaFile = path.join(outputFolder, 'locations.txt');
        await fs.writeFile(metaFile, lines.join('\n') + '\n');
        console.log(`📋 Metadata written to locations.txt (${lines.length} entries)`);
    }

    console.log(`✅ ${words.length} word(s) saved to ./output/${outputName}/`);
}

module.exports = { processText };
