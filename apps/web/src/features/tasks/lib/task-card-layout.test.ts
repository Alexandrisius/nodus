import { describe, expect, it } from 'vitest';

import {
  BRANCH_MIN_W,
  MIN_TASK_MAIN_W,
  branchMaxWidth,
  chatColumnWidth,
  clampBranchWidth,
} from './task-card-layout.js';

describe('chatColumnWidth — чат буфер сужений', () => {
  it('сужения ряда едят чат', () => {
    expect(chatColumnWidth(900, 300, 500)).toBe(600);
  });
  it('ниже пола чат не опускается', () => {
    expect(chatColumnWidth(700, 360, 500)).toBe(500);
  });
});

describe('branchMaxWidth — предел перегородки навигатора', () => {
  it('широкий ряд: не шире половины ряда', () => {
    expect(branchMaxWidth(3000, 500)).toBe(1500);
  });
  it('средний ряд: центру остаётся его минимум при чате на полу', () => {
    const row = 1800;
    const floor = 500;
    const max = branchMaxWidth(row, floor);
    expect(max).toBe(row - MIN_TASK_MAIN_W - floor);
    expect(row - max - floor).toBe(MIN_TASK_MAIN_W);
  });
  it('тесный ряд: предел не уже минимума навигатора', () => {
    expect(branchMaxWidth(600, 500)).toBe(BRANCH_MIN_W);
  });
});

describe('clampBranchWidth', () => {
  it('держит ширину в [минимум; предел]', () => {
    expect(clampBranchWidth(10, 800)).toBe(BRANCH_MIN_W);
    expect(clampBranchWidth(5000, 800)).toBe(800);
    expect(clampBranchWidth(BRANCH_MIN_W + 50, 800)).toBe(BRANCH_MIN_W + 50);
  });
  it('вырожденный предел меньше минимума — минимум', () => {
    expect(clampBranchWidth(500, 100)).toBe(BRANCH_MIN_W);
  });
});
