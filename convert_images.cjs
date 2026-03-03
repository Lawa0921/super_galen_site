const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ensure cwebp is installed
try {
  execSync('which cwebp');
} catch (e) {
  console.log('Installing webp tools...');
  execSync('sudo apt-get update && sudo apt-get install -y webp');
}

const inputDir = '/tmp/file_attachments';
const outputDir = 'public/assets/guild/asingingwind';

// Map specific filenames to semantic names based on visual analysis from previous memory
const fileMapping = {
  '358164767_1091883335006009_8775360335359905751_n.jpg': 'avatar.webp',
  '619261898_17941021437106924_7871537298666239167_n.jpg': 'image1.webp',
  '619849298_17941021455106924_7495161656715489197_n.jpg': 'image2.webp',
  '619898388_17941021446106924_8382153263027701778_n.jpg': 'image3.webp'
};

const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.jpg'));

for (const file of files) {
  const inputFile = path.join(inputDir, file);
  const outputFilename = fileMapping[file] || file.replace('.jpg', '.webp');
  const outputFile = path.join(outputDir, outputFilename);

  console.log(`Converting ${file} to ${outputFilename}...`);
  try {
    execSync(`cwebp -q 85 "${inputFile}" -o "${outputFile}"`);
    console.log(`Success: ${outputFilename}`);
  } catch (error) {
    console.error(`Error converting ${file}:`, error.message);
  }
}
