const fs = require('fs-extra');
const path = require('path');
const { processText } = require('./processor');

function parseArgs(argv) {
    const args = { text: [], files: [], locations: false, coordinates: false };

    for (const arg of argv.slice(2)) {
        if (arg === '--locations') { args.locations = true; }
        else if (arg === '--coordinates') { args.coordinates = true; }
        else if (arg === '--file' || arg === '-f') { args._expectFile = true; }
        else if (args._expectFile) { args.files.push(arg); delete args._expectFile; }
        else if (arg === '--help') { args.help = true; }
        else if (arg.startsWith('-')) {
            console.log(`⚠️  Unknown flag: ${arg}`);
        }
        else { args.text.push(arg); }
    }
    delete args._expectFile;
    return args;
}

function printHelp() {
    console.log(`
🛰️  NasaGeoSpeller — Batch download NASA Landsat satellite images for any text.

Usage:
  node src/index.js "hello world"
  node src/index.js "hello world" --locations
  node src/index.js "hello world" --coordinates
  node src/index.js --file input/lyrics.txt
  node src/index.js --file input/lyrics.txt --locations --coordinates

Options:
  --locations     Include location names in the output metadata file
  --coordinates   Include geographic coordinates in the output metadata file
  --file, -f      Read text from a file instead of command-line argument
  --help          Show this help message

Batch mode (process all .txt files in /input):
  node src/index.js
  node src/index.js --locations --coordinates
`);
}

async function run() {
    const args = parseArgs(process.argv);

    if (args.text.length === 0 && args.files.length === 0) {
        if (args.help) { printHelp(); return; }

        // Batch mode: process all .txt in /input
        const inputDir = path.join(__dirname, '../input');
        await fs.ensureDir(inputDir);
        const txtFiles = (await fs.readdir(inputDir)).filter(f => f.endsWith('.txt'));

        if (txtFiles.length === 0) {
            printHelp();
            return;
        }

        console.log(`🚀 Batch mode: ${txtFiles.length} file(s) in /input`);
        for (const file of txtFiles) {
            const text = await fs.readFile(path.join(inputDir, file), 'utf-8');
            const name = file.replace('.txt', '');
            await processText(text, name, args);
        }
        console.log(`\n🎉 Batch complete!`);
        return;
    }

    // Single text mode
    const text = args.text.join(' ');

    if (args.files.length > 0) {
        for (const file of args.files) {
            const content = await fs.readFile(file, 'utf-8');
            const name = path.basename(file, '.txt');
            await processText(content, name, args);
        }
    } else {
        await processText(text, 'output', args);
    }

    console.log(`\n🎉 Done!`);
}

run();
