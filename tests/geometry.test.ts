import { describe, expect, it } from 'vitest'
import {
  handleIsActive, handleLength, isCurve, nodeState,
  sampleSegment, setNodeCorner, setNodeSmooth, smoothAll
} from '../src/geometry'
import type { Path } from '../src/types'

const square = (): Path => ({
  closed: true,
  nodes: [
    { id: 'a', x: 0, y: 0, in: null, out: null },
    { id: 'b', x: 30, y: 0, in: null, out: null },
    { id: 'c', x: 30, y: 30, in: null, out: null },
    { id: 'd', x: 0, y: 30, in: null, out: null }
  ]
})

/** 各辺が曲線（ベジェ）として扱われているか。 */
const curved = (path: Path) =>
  path.nodes.map((_, i) => isCurve(path.nodes[i], path.nodes[(i + 1) % path.nodes.length]))

/** 実際に描かれる形が直線か。サンプル点が端点を結ぶ線上に乗っているかで見る。 */
function drawsStraight(path: Path, index: number) {
  const a = path.nodes[index]
  const b = path.nodes[(index + 1) % path.nodes.length]
  const points = sampleSegment(a, b, 1)
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return points.every((p) => {
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    return Math.abs(cross) / length < 1e-9
  })
}

describe('点の状態（滑らか / 角）', () => {
  it('角にしても、隣から流れてくる曲線は残る', () => {
    const path = square()
    smoothAll(path)
    const beforeAOut = { ...path.nodes[0].out! }
    const beforeCIn = { ...path.nodes[2].in! }

    setNodeCorner(path, 1)

    // 前後の辺は曲線のまま、点1で尖る。
    expect(curved(path)).toEqual([true, true, true, true])
    expect(nodeState(path, 1)).toBe('corner')
    expect(handleLength(path.nodes[1], 'in')).toBe(0)
    expect(handleLength(path.nodes[1], 'out')).toBe(0)
    // 隣の点は座標ごとそのまま。曲線も生きている。
    expect(path.nodes[0].out).toEqual(beforeAOut)
    expect(path.nodes[2].in).toEqual(beforeCIn)
    expect(handleIsActive(path, 0, 'out')).toBe(true)
    expect(handleIsActive(path, 2, 'in')).toBe(true)
  })

  it('隣り合う2点をどちらも角にすると、その辺は直線になる', () => {
    const path = square()
    smoothAll(path)
    expect(drawsStraight(path, 0)).toBe(false)

    setNodeCorner(path, 0)
    // 片方だけではまだ曲がっている（隣のハンドルが効いている）。
    expect(drawsStraight(path, 0)).toBe(false)

    setNodeCorner(path, 1)
    // 両端の制御点が端点に重なり、ベジェが直線に退化する。
    expect(drawsStraight(path, 0)).toBe(true)
    // 反対側（点1の先）はまだ曲線のまま。
    expect(drawsStraight(path, 1)).toBe(false)
  })

  it('ハンドルを持たない点も角として扱う', () => {
    const path = square()
    expect(nodeState(path, 0)).toBe('corner')
    expect(drawsStraight(path, 0)).toBe(true)
  })

  it('角だらけのパスで1点を滑らかにしても、隣は角のまま', () => {
    const path = square()
    expect(curved(path)).toEqual([false, false, false, false])

    setNodeSmooth(path, 1)

    expect(curved(path)).toEqual([true, true, false, false])
    // 隣に足されるのは長さ0のハンドルなので、隣は角のまま。
    expect(nodeState(path, 0)).toBe('corner')
    expect(nodeState(path, 2)).toBe('corner')
    expect(handleIsActive(path, 0, 'out')).toBe(false)
    expect(handleIsActive(path, 2, 'in')).toBe(false)
    // 無関係な点は触らない。
    expect(path.nodes[3].in).toBeNull()
    expect(path.nodes[3].out).toBeNull()
  })

  it('角にした点の隣を滑らかにしても、その点は角のまま', () => {
    const path = square()
    smoothAll(path)
    setNodeCorner(path, 0)
    expect(nodeState(path, 0)).toBe('corner')

    setNodeSmooth(path, 1)

    expect(nodeState(path, 0)).toBe('corner')
    expect(handleLength(path.nodes[0], 'out')).toBe(0)
  })

  it('滑らかと角を行き来できる', () => {
    const path = square()
    smoothAll(path)
    expect(nodeState(path, 1)).toBe('smooth')
    setNodeCorner(path, 1)
    expect(nodeState(path, 1)).toBe('corner')
    setNodeSmooth(path, 1)
    expect(nodeState(path, 1)).toBe('smooth')
  })

  it('滑らかに戻したとき、隣のハンドルは元の位置のまま', () => {
    const path = square()
    smoothAll(path)
    const beforeAOut = { ...path.nodes[0].out! }
    const beforeCIn = { ...path.nodes[2].in! }

    setNodeCorner(path, 1)
    setNodeSmooth(path, 1)

    expect(path.nodes[0].out).toEqual(beforeAOut)
    expect(path.nodes[2].in).toEqual(beforeCIn)
  })

  it('小さい図形でも、ハンドルが辺より長くならない', () => {
    // 下絵をなぞって作る小さな面。以前はハンドル長に下限(3〜4)があり、
    // 辺(2)より長いハンドルが生えて曲線がループしていた。
    const tiny: Path = {
      closed: true,
      nodes: [
        { id: 'a', x: 0, y: 0, in: null, out: null },
        { id: 'b', x: 2, y: 0, in: null, out: null },
        { id: 'c', x: 2, y: 2, in: null, out: null },
        { id: 'd', x: 0, y: 2, in: null, out: null }
      ]
    }
    const longestHandle = (path: Path) => Math.max(
      ...path.nodes.flatMap((_, i) => [handleLength(path.nodes[i], 'in'), handleLength(path.nodes[i], 'out')])
    )
    const shortestEdge = (path: Path) => Math.min(
      ...path.nodes.map((n, i) => {
        const next = path.nodes[(i + 1) % path.nodes.length]
        return Math.hypot(next.x - n.x, next.y - n.y)
      })
    )

    smoothAll(tiny)
    expect(longestHandle(tiny)).toBeLessThan(shortestEdge(tiny))

    const spot: Path = structuredClone(tiny)
    setNodeSmooth(spot, 1)
    expect(longestHandle(spot)).toBeLessThan(shortestEdge(spot))
  })

  it('開いたパスの端点では、線が続いている側だけを見る', () => {
    const open: Path = {
      closed: false,
      nodes: [
        { id: 'a', x: 0, y: 0, in: null, out: null },
        { id: 'b', x: 10, y: 10, in: null, out: null },
        { id: 'c', x: 20, y: 0, in: null, out: null }
      ]
    }
    setNodeSmooth(open, 0)
    expect(open.nodes[0].in).toBeNull()
    expect(open.nodes[0].out).not.toBeNull()
    expect(nodeState(open, 0)).toBe('smooth')

    setNodeCorner(open, 0)
    expect(open.nodes[0].in).toBeNull()
    expect(handleLength(open.nodes[0], 'out')).toBe(0)
    expect(nodeState(open, 0)).toBe('corner')
  })
})
