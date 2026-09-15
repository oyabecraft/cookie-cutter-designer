import { exportTransform } from './build'
import { isCurve, samplePath, segmentCount, segmentEnds } from './geometry'
import type { Design, Path, Vec2 } from './types'

/** 図面の余白(mm)。 */
const MARGIN = 4

const round = (value: number) => Number(value.toFixed(3))

type Transform = (point: Vec2) => Vec2

/**
 * パスを SVG の d 属性にする。ベジェは折れ線に落とさず曲線のまま出す。
 * 読み込んだ側で点を打ち直さずに済む。
 */
function pathData(path: Path, to: Transform) {
  if (path.nodes.length < 2) return ''
  const start = to(path.nodes[0])
  let d = `M ${round(start.x)} ${round(start.y)}`
  for (let i = 0; i < segmentCount(path); i++) {
    const [a, b] = segmentEnds(path, i)
    const end = to(b)
    if (isCurve(a, b)) {
      const c1 = to(a.out!)
      const c2 = to(b.in!)
      d += ` C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`
    } else {
      d += ` L ${round(end.x)} ${round(end.y)}`
    }
  }
  return path.closed ? `${d} Z` : d
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string)

/**
 * 設計を実寸(mm)のSVGにする。
 *
 * 出すのは**設計の線そのもの**で、立体の投影ではない。
 * 読み込んだ人は自分の壁厚で立ち上げ直すはずなので、こちらが決めた厚みの断面を
 * 渡しても使いにくい。輪郭と絵柄を別のグループに分けてあるので、片方だけ取り出せる。
 */
export type SvgParts = { outline: boolean; details: boolean }

export function designSvg(
  design: Design,
  parts: SvgParts = { outline: true, details: true }
): string | null {
  const to = exportTransform(design)
  if (!to) return null
  if (parts.details && !parts.outline && !design.details.length) return null

  // 範囲は曲線の膨らみも含めたいので、折れ線に落としたものから取る。
  const points: Vec2[] = parts.outline ? samplePath(design.outline).map(to) : []
  if (parts.details) {
    for (const detail of design.details) {
      const half = (detail.kind === 'stroke' ? detail.width : 0) / 2 + design.params.detailThicken
      for (const point of samplePath(detail.path).map(to)) {
        points.push({ x: point.x - half, y: point.y - half }, { x: point.x + half, y: point.y + half })
      }
    }
  }
  if (points.length < 2) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs) - MARGIN
  const minY = Math.min(...ys) - MARGIN
  const width = Math.max(...xs) - Math.min(...xs) + MARGIN * 2
  const height = Math.max(...ys) - Math.min(...ys) + MARGIN * 2

  const groups: string[] = []
  if (parts.outline) {
    groups.push(`  <g id="outline" fill="none" stroke="#000000" stroke-width="0.2">
    <path d="${pathData(design.outline, to)}"/>
  </g>`)
  }
  if (parts.details) {
    const details = design.details.map((detail) => {
      const d = pathData(detail.path, to)
      if (detail.kind === 'stroke') {
        // 線幅はmmで持っているので、mm座標系のSVGにそのまま乗る。
        const strokeWidth = round(detail.width + design.params.detailThicken * 2)
        return `    <path d="${d}" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
      }
      return `    <path d="${d}" fill="#000000" stroke="none"/>`
    })
    groups.push(`  <g id="details">\n${details.join('\n')}\n  </g>`)
  }

  const name = design.name.trim() || 'クッキー型'
  const outerWidth = round(Math.max(...xs) - Math.min(...xs))
  const outerHeight = round(Math.max(...ys) - Math.min(...ys))
  const contents = [parts.outline && 'outline=枠の輪郭', parts.details && 'details=絵柄']
    .filter(Boolean).join('、')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${round(width)}mm" height="${round(height)}mm"
     viewBox="${round(minX)} ${round(minY)} ${round(width)} ${round(height)}">
  <title>${escapeXml(name)}</title>
  <desc>実寸 1:1 (mm)。外形 ${outerWidth} × ${outerHeight} mm。${contents}。</desc>
${groups.join('\n')}
</svg>
`
}
