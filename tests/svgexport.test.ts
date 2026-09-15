import { describe, expect, it } from 'vitest'
import { designSvg } from '../src/svgexport'
import { initialDesign } from '../src/geometry'

describe('設計図のSVG書き出し', () => {
  it('実寸(mm)で、輪郭と絵柄を別のグループに出す', () => {
    const design = initialDesign()
    const svg = designSvg(design)!

    expect(svg).toContain('<svg')
    // 単位はmm。読み込んだ側で原寸になる。
    expect(svg).toMatch(/width="[\d.]+mm" height="[\d.]+mm"/)
    expect(svg).toMatch(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/)
    // 片方だけ取り出せるように分ける。
    expect(svg).toContain('<g id="outline"')
    expect(svg).toContain('<g id="details"')
  })

  it('輪郭は閉じた1本のパスになる', () => {
    const svg = designSvg(initialDesign())!
    const outline = svg.split('<g id="outline"')[1].split('</g>')[0]
    const paths = outline.match(/<path /g) ?? []
    expect(paths).toHaveLength(1)
    expect(outline).toMatch(/d="M [^"]*Z"/)
  })

  it('図面の大きさは 指定サイズ + 余白×2 になる', () => {
    const design = initialDesign()
    design.params.size = 60
    const svg = designSvg(design)!
    const [, width] = svg.match(/width="([\d.]+)mm"/)!
    // 見本は正方形に収まる形なので、最長辺 60 + 余白4×2 = 68
    expect(Number(width)).toBeCloseTo(68, 1)
  })

  it('線の絵柄は mm の線幅で出る（太らせ量も含む）', () => {
    const design = initialDesign()
    design.params.detailThicken = 0.5
    const stroke = design.details.find((d) => d.kind === 'stroke')!
    const svg = designSvg(design)!
    const expected = stroke.kind === 'stroke' ? stroke.width + 0.5 * 2 : 0
    expect(svg).toContain(`stroke-width="${expected}"`)
  })

  it('面の絵柄は塗りつぶしで出る', () => {
    const svg = designSvg(initialDesign())!
    const details = svg.split('<g id="details"')[1]
    expect(details).toContain('fill="#000000" stroke="none"')
  })

  it('輪郭だけ・絵柄だけを取り出せる', () => {
    const design = initialDesign()

    const outlineOnly = designSvg(design, { outline: true, details: false })!
    expect(outlineOnly).toContain('<g id="outline"')
    expect(outlineOnly).not.toContain('<g id="details"')

    const detailsOnly = designSvg(design, { outline: false, details: true })!
    expect(detailsOnly).toContain('<g id="details"')
    expect(detailsOnly).not.toContain('<g id="outline"')
  })

  it('絵柄だけを出すときは、絵柄の範囲に合わせて縮む', () => {
    const design = initialDesign()
    const whole = Number(designSvg(design)!.match(/width="([\d.]+)mm"/)![1])
    const detailsOnly = Number(
      designSvg(design, { outline: false, details: true })!.match(/width="([\d.]+)mm"/)![1])
    expect(detailsOnly).toBeLessThan(whole)
  })

  it('絵柄が無いのに絵柄だけを求めたら null', () => {
    const design = initialDesign()
    design.details = []
    expect(designSvg(design, { outline: false, details: true })).toBeNull()
    // 輪郭は残っているので、そちらは出せる。
    expect(designSvg(design, { outline: true, details: false })).not.toBeNull()
  })

  it('点が1つしかないときは null を返す', () => {
    const design = initialDesign()
    design.outline.nodes = design.outline.nodes.slice(0, 1)
    expect(designSvg(design)).toBeNull()
  })

  it('2点でもハンドルがあれば閉じた形になるので出力する', () => {
    // 点2つ＋ハンドルはレンズ型の閉曲線として成立する。
    const design = initialDesign()
    design.outline.nodes = design.outline.nodes.slice(0, 2)
    expect(designSvg(design)).not.toBeNull()
  })
})
