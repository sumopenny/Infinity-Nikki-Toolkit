import { describe, expect, it } from 'vitest'
import { HomeWaterField } from '../../src/utils/homeWaterRipple'

describe('home wallpaper water field', () => {
  it('keeps an undisturbed wallpaper free of displacement', () => {
    const field = new HomeWaterField(40, 30)
    expect(field.step()).toBe(0)
    expect(field.encodeNormals().every((value) => value === 128)).toBe(true)
  })

  it('propagates a disturbance and dissipates it with the selected damping', () => {
    const field = new HomeWaterField(64, 48)
    field.disturb(0.5, 0.5, 2.8)
    expect(field.current[24 * 64 + 42]).toBe(0)
    for (let i = 0; i < 20; i++) field.step()
    expect(Math.abs(field.current[24 * 64 + 42])).toBeGreaterThan(0.001)
    expect(field.encodeNormals().some((value) => value !== 128)).toBe(true)
    for (let i = 0; i < 1400; i++) field.step()
    expect(Math.max(...field.current.map(Math.abs))).toBeLessThan(0.01)
  })

  it('bounds fast input and preserves finite values at corners', () => {
    const field = new HomeWaterField(40, 30)
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5]
    ]) {
      for (let i = 0; i < 100; i++) field.disturb(x, y, 2.8)
    }
    expect(Math.max(...field.current)).toBeLessThanOrEqual(12)
    for (let i = 0; i < 150; i++) field.step()
    expect(field.current.every(Number.isFinite)).toBe(true)
    expect(field.current[0]).toBe(0)
    expect(field.current[field.current.length - 1]).toBe(0)
    field.clear()
    expect(field.step()).toBe(0)
    expect(field.encodeNormals().every((value) => value === 128)).toBe(true)
  })
})
