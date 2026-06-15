import { describe, it, expect } from 'vitest'
import { hotScore, wilsonScore, isRising } from '@/lib/ranking'

// The PostUp epoch used inside hotScore
const EPOCH_MS = new Date('2026-06-01T00:00:00Z').getTime()

// Helper: create a Date relative to the epoch
function epochPlus(ms: number): Date {
  return new Date(EPOCH_MS + ms)
}

describe('wilsonScore', () => {
  it('returns 0 when there are no votes', () => {
    expect(wilsonScore(0, 0)).toBe(0)
  })

  it('returns a high score for 100 ups and 0 downs', () => {
    const score = wilsonScore(100, 0)
    expect(score).toBeGreaterThan(0.9)
  })

  it('returns a value in [0, 1]', () => {
    const score = wilsonScore(50, 50)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('50 ups 50 downs scores lower than 100 ups 0 downs', () => {
    const mixed = wilsonScore(50, 50)
    const allUp = wilsonScore(100, 0)
    expect(mixed).toBeLessThan(allUp)
  })

  it('more ups with zero downs gives higher score than fewer ups', () => {
    expect(wilsonScore(1000, 0)).toBeGreaterThan(wilsonScore(10, 0))
  })

  it('returns a number in all cases', () => {
    expect(typeof wilsonScore(0, 0)).toBe('number')
    expect(typeof wilsonScore(1, 0)).toBe('number')
    expect(typeof wilsonScore(0, 1)).toBe('number')
  })
})

describe('hotScore', () => {
  it('always returns a number', () => {
    const score = hotScore(0, epochPlus(0))
    expect(typeof score).toBe('number')
  })

  it('higher heat produces higher score when age is equal', () => {
    const age = epochPlus(3_600_000) // 1 hour after epoch
    const lowHeat = hotScore(1, age)
    const highHeat = hotScore(100, age)
    expect(highHeat).toBeGreaterThan(lowHeat)
  })

  it('newer drop scores higher than older drop with same heat', () => {
    const heat = 10
    const older = hotScore(heat, epochPlus(1_000))       // 1 s after epoch
    const newer = hotScore(heat, epochPlus(3_600_000))   // 1 h after epoch
    expect(newer).toBeGreaterThan(older)
  })

  it('handles zero heat (sign = 0)', () => {
    const score = hotScore(0, epochPlus(3_600_000))
    expect(Number.isFinite(score)).toBe(true)
  })

  it('negative heat produces lower score than positive heat of same magnitude', () => {
    const age = epochPlus(3_600_000)
    const neg = hotScore(-10, age)
    const pos = hotScore(10, age)
    expect(pos).toBeGreaterThan(neg)
  })
})

describe('isRising', () => {
  it('returns true for positive heat created less than 24 h ago', () => {
    const recentDate = new Date(Date.now() - 60 * 60 * 1000) // 1 h ago
    expect(isRising(5, recentDate)).toBe(true)
  })

  it('returns false when heat is 0', () => {
    const recentDate = new Date(Date.now() - 60 * 60 * 1000)
    expect(isRising(0, recentDate)).toBe(false)
  })

  it('returns false when heat is negative', () => {
    const recentDate = new Date(Date.now() - 60 * 60 * 1000)
    expect(isRising(-1, recentDate)).toBe(false)
  })

  it('returns false when drop is older than 24 h even with positive heat', () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 h ago
    expect(isRising(100, oldDate)).toBe(false)
  })

  it('returns false for a drop exactly at the 24 h boundary', () => {
    const boundaryDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
    // At exactly 24 h the age equals the limit so it is NOT strictly less
    expect(isRising(1, boundaryDate)).toBe(false)
  })
})
