/**
 * YAML 到 TypeScript 翻譯檔案轉換腳本
 * 將 Jekyll 的 _data/i18n/*.yml 轉換為 Astro 的 src/i18n/translations/*.ts
 *
 * 使用方式：npx tsx scripts/convert-i18n.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

// ES Module 路徑解析
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 來源和目標路徑
const JEKYLL_I18N_DIR = path.resolve(__dirname, '../../my-portfolio-blog/_data/i18n');
const ASTRO_I18N_DIR = path.resolve(__dirname, '../src/i18n/translations');

// 支援的語言
const LANGUAGES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
type Language = (typeof LANGUAGES)[number];

/**
 * 遞歸處理 YAML 物件，轉換為安全的 TypeScript 字串
 */
function objectToTsString(obj: unknown, indent: number = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'string') {
    // 轉義特殊字元
    const escaped = obj
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `'${escaped}'`;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map((item) => objectToTsString(item, indent + 1));
    return `[\n${spaces}  ${items.join(`,\n${spaces}  `)}\n${spaces}]`;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}';

    const lines = entries.map(([key, value]) => {
      // 處理包含特殊字元的 key
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`;
      return `${spaces}  ${safeKey}: ${objectToTsString(value, indent + 1)}`;
    });

    return `{\n${lines.join(',\n')}\n${spaces}}`;
  }

  return String(obj);
}

/**
 * 將 YAML 檔案轉換為 TypeScript 模組
 */
function convertYamlToTs(lang: Language): void {
  const yamlPath = path.join(JEKYLL_I18N_DIR, `${lang}.yml`);
  const tsPath = path.join(ASTRO_I18N_DIR, `${lang}.ts`);

  console.log(`Converting ${lang}.yml -> ${lang}.ts`);

  try {
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    const data = yaml.load(yamlContent) as Record<string, unknown>;

    const tsContent = `/**
 * ${lang} 翻譯檔案
 * 由 scripts/convert-i18n.ts 自動生成，請勿手動編輯
 * 來源：_data/i18n/${lang}.yml
 */

export const ${lang.replace('-', '_')} = ${objectToTsString(data)} as const;

export default ${lang.replace('-', '_')};
`;

    fs.writeFileSync(tsPath, tsContent, 'utf8');
    console.log(`  ✓ Created ${tsPath}`);
  } catch (error) {
    console.error(`  ✗ Error converting ${lang}:`, error);
    throw error;
  }
}

/**
 * 生成統一的翻譯入口檔案
 */
function generateIndexFile(): void {
  const indexPath = path.join(ASTRO_I18N_DIR, 'index.ts');

  const imports = LANGUAGES.map((lang) => {
    const varName = lang.replace('-', '_');
    return `import { ${varName} } from './${lang}';`;
  }).join('\n');

  const exportObj = LANGUAGES.map((lang) => {
    const varName = lang.replace('-', '_');
    return `  '${lang}': ${varName}`;
  }).join(',\n');

  const content = `/**
 * 翻譯檔案統一入口
 * 由 scripts/convert-i18n.ts 自動生成
 */

${imports}

export const translations = {
${exportObj}
} as const;

export type Translations = typeof translations;
export type Language = keyof Translations;

export default translations;
`;

  fs.writeFileSync(indexPath, content, 'utf8');
  console.log(`✓ Created translations index file`);
}

/**
 * 主函數
 */
async function main(): Promise<void> {
  console.log('🌐 Starting i18n conversion...\n');

  // 確保目標目錄存在
  if (!fs.existsSync(ASTRO_I18N_DIR)) {
    fs.mkdirSync(ASTRO_I18N_DIR, { recursive: true });
    console.log(`Created directory: ${ASTRO_I18N_DIR}\n`);
  }

  // 轉換每個語言檔案
  for (const lang of LANGUAGES) {
    convertYamlToTs(lang);
  }

  console.log('');

  // 生成索引檔案
  generateIndexFile();

  console.log('\n✅ i18n conversion complete!');
}

main().catch((error) => {
  console.error('❌ Conversion failed:', error);
  process.exit(1);
});
