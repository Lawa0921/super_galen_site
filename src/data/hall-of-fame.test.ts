import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

interface Tag {
  id: string;
  label: string;
}

interface Member {
  id: string;
  name: string;
  avatar: string;
  page: string;
  tags: Tag[];
}

interface HallOfFame {
  members: Member[];
}

describe('Hall of Fame YAML', () => {
  let data: HallOfFame;
  let guildHtmlFiles: string[];

  beforeAll(() => {
    const ymlPath = path.join(__dirname, 'hall-of-fame.yml');
    const content = fs.readFileSync(ymlPath, 'utf-8');
    data = yaml.load(content) as HallOfFame;

    const guildDir = path.join(__dirname, '..', 'content', 'guild');
    guildHtmlFiles = fs
      .readdirSync(guildDir)
      .filter((f) => f.endsWith('.html') && !f.includes('.'))
      .filter((f) => !f.includes('.'));
  });

  it('should have a members array', () => {
    expect(Array.isArray(data.members)).toBe(true);
    expect(data.members.length).toBeGreaterThan(0);
  });

  it('should have unique member ids', () => {
    const ids = data.members.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('every member should have required fields', () => {
    for (const member of data.members) {
      expect(member.id, `member missing id`).toBeTruthy();
      expect(member.name, `${member.id} missing name`).toBeTruthy();
      expect(member.avatar, `${member.id} missing avatar`).toBeTruthy();
      expect(member.page, `${member.id} missing page`).toBeTruthy();
      expect(member.tags, `${member.id} missing tags`).toBeDefined();
      expect(member.tags.length, `${member.id} should have at least 1 tag`).toBeGreaterThanOrEqual(1);
      expect(member.tags.length, `${member.id} should have at most 4 tags`).toBeLessThanOrEqual(4);
    }
  });

  it('every guild HTML page should have a corresponding entry in hall-of-fame.yml', () => {
    const ymlPages = data.members.map((m) => {
      const match = m.page.match(/\/guild\/(.+)\.html$/);
      return match ? match[1] : null;
    }).filter(Boolean);

    const guildDir = path.join(__dirname, '..', 'content', 'guild');
    const htmlFiles = fs
      .readdirSync(guildDir)
      .filter((f) => f.endsWith('.html') && !f.includes('.ja.') && !f.includes('.en.') && !f.includes('.ko.') && !f.includes('.zh-cn.'))
      .map((f) => f.replace('.html', ''));

    const missingInYml = htmlFiles.filter((f) => !ymlPages.includes(f));
    expect(missingInYml, `These guild pages are missing from hall-of-fame.yml: ${missingInYml.join(', ')}`).toEqual([]);
  });

  it('every hall-of-fame entry page file should exist', () => {
    const guildDir = path.join(__dirname, '..', 'content', 'guild');

    for (const member of data.members) {
      const match = member.page.match(/\/guild\/(.+\.html)$/);
      if (match) {
        const filePath = path.join(guildDir, match[1]);
        expect(fs.existsSync(filePath), `${member.id} page file not found: ${match[1]}`).toBe(true);
      }
    }
  });

  it('every hall-of-fame entry avatar file should exist', () => {
    const publicDir = path.join(__dirname, '..', '..', 'public');

    for (const member of data.members) {
      const avatarPath = path.join(publicDir, member.avatar);
      expect(fs.existsSync(avatarPath), `${member.id} avatar not found: ${member.avatar}`).toBe(true);
    }
  });
});
