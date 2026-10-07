import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Data-integrity tests for the locale files.
 * These are pure checks on locales/*.json — no browser, no server.
 */

const SCHOOL_CODES = ['C', 'P', 'G', 'E', 'S', 'X', 'I'];

function loadLocale(lang: string): any {
  const path = join(__dirname, '..', 'locales', `${lang}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const ru = loadLocale('ru');
const en = loadLocale('en');

test.describe('locale data integrity', () => {
  test('ru and en expose the same top-level keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  test('both locales define the same number of questions', () => {
    expect(en.questions).toHaveLength(ru.questions.length);
  });

  test('the quick screening has exactly 5 questions', () => {
    expect(ru.questions.filter((q: any) => q.quick)).toHaveLength(5);
  });

  test('every question has at least two options mapped to a known school', () => {
    for (const q of ru.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      for (const option of q.options) {
        expect(SCHOOL_CODES).toContain(option.school);
      }
    }
  });

  test('every school has a hero profile and recommendation text', () => {
    for (const code of SCHOOL_CODES) {
      expect(ru.schools[code]).toBeTruthy();
      expect(ru.heroes[code]).toBeTruthy();
      expect(ru.results.recommendations[code]).toBeTruthy();
    }
  });
});
