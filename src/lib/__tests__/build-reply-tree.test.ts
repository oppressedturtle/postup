import { describe, it, expect } from 'vitest'
import { buildReplyTree } from '@/lib/build-reply-tree'
import type { Reply } from '@/types/reply'

function makeReply(overrides: Partial<Reply> & { id: string }): Reply {
  return {
    id: overrides.id,
    body: overrides.body ?? 'test body',
    isRemoved: overrides.isRemoved ?? false,
    heat: overrides.heat ?? 0,
    createdAt: overrides.createdAt ?? '2026-06-10T12:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-06-10T12:00:00Z',
    parentId: overrides.parentId ?? null,
    author: overrides.author ?? { handle: 'user', avatar: null, clout: 0 },
    _count: overrides._count ?? { children: 0 },
    children: [],
  }
}

describe('buildReplyTree', () => {
  it('returns all replies as top-level when none have parents', () => {
    const flat = [makeReply({ id: '1' }), makeReply({ id: '2' }), makeReply({ id: '3' })]
    const tree = buildReplyTree(flat)
    expect(tree).toHaveLength(3)
    expect(tree.every((r) => (r.children?.length ?? 0) === 0)).toBe(true)
  })

  it('assembles parent-child relationships correctly', () => {
    const flat = [
      makeReply({ id: 'parent', parentId: null }),
      makeReply({ id: 'child', parentId: 'parent' }),
    ]
    const tree = buildReplyTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0]!.id).toBe('parent')
    expect(tree[0]!.children).toHaveLength(1)
    expect(tree[0]!.children![0]!.id).toBe('child')
  })

  it('treats orphaned replies (parent missing) as top-level', () => {
    const flat = [makeReply({ id: 'orphan', parentId: 'nonexistent-parent' })]
    const tree = buildReplyTree(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0]!.id).toBe('orphan')
  })

  it('handles an empty flat array', () => {
    expect(buildReplyTree([])).toEqual([])
  })

  describe('sort modes', () => {
    const replies = [
      makeReply({ id: 'a', heat: 1, createdAt: '2026-06-10T10:00:00Z' }),
      makeReply({ id: 'b', heat: 10, createdAt: '2026-06-10T11:00:00Z' }),
      makeReply({ id: 'c', heat: -5, createdAt: '2026-06-10T12:00:00Z' }),
    ]

    it('sort=best orders by heat DESC then createdAt ASC', () => {
      const tree = buildReplyTree(replies, 'best')
      expect(tree[0]!.id).toBe('b') // heat 10
      expect(tree[1]!.id).toBe('a') // heat 1
      expect(tree[2]!.id).toBe('c') // heat -5
    })

    it('sort=top orders by heat DESC', () => {
      const tree = buildReplyTree(replies, 'top')
      expect(tree[0]!.id).toBe('b')
      expect(tree[tree.length - 1]!.id).toBe('c')
    })

    it('sort=new orders by createdAt DESC', () => {
      const tree = buildReplyTree(replies, 'new')
      expect(tree[0]!.id).toBe('c') // newest
      expect(tree[tree.length - 1]!.id).toBe('a') // oldest
    })

    it('sort=controversial orders by abs(heat) DESC', () => {
      const tree = buildReplyTree(replies, 'controversial')
      // abs values: b=10, c=5, a=1
      expect(tree[0]!.id).toBe('b')
      expect(tree[1]!.id).toBe('c')
      expect(tree[2]!.id).toBe('a')
    })

    it('different sorts produce different orderings', () => {
      const bestOrder = buildReplyTree(replies, 'best').map((r) => r.id).join(',')
      const newOrder = buildReplyTree(replies, 'new').map((r) => r.id).join(',')
      expect(bestOrder).not.toBe(newOrder)
    })
  })

  it('assembles deep nesting (5+ levels) without stack overflow', () => {
    // Build a chain: 1 → 2 → 3 → 4 → 5 → 6
    const flat: Reply[] = []
    let prev: string | null = null
    for (let i = 1; i <= 6; i++) {
      flat.push(makeReply({ id: String(i), parentId: prev }))
      prev = String(i)
    }

    const tree = buildReplyTree(flat)
    expect(tree).toHaveLength(1)

    // Walk the chain
    let node: Reply = tree[0]!
    for (let depth = 1; depth <= 5; depth++) {
      expect(node.children).toHaveLength(1)
      node = node.children![0]!
    }
    // Leaf has no children
    expect(node.children ?? []).toHaveLength(0)
  })

  it('defaults to best sort when no sort argument given', () => {
    const flat = [
      makeReply({ id: 'low', heat: 1 }),
      makeReply({ id: 'high', heat: 100 }),
    ]
    const tree = buildReplyTree(flat)
    expect(tree[0]!.id).toBe('high')
  })

  it('defaults author.clout to 0 when missing', () => {
    const reply = makeReply({ id: 'x' })
    // Simulate author without clout field
    ;(reply.author as any).clout = undefined
    const tree = buildReplyTree([reply])
    expect(tree[0]!.author.clout).toBe(0)
  })
})
