import './style.css'
import {
  buildBoth, buildCutter, buildStamp, detailPolygons, effectiveWallThickness,
  mmPerUnit, outlinePolygon, stampPlatePolygon, toEditorSpace
} from './build'
import { outlineProblems, type OutlineProblem } from './checks'
import {
  boundsOf, clone, defaultParams, deleteNode, emptyOutline, handleIsActive,
  hasSelfIntersection, initialDesign, insertNode, isCurve, nearestOnPath,
  nodeState, pointInPolygon, samplePath, segmentCount, segmentEnds,
  setNodeCorner, setNodeSmooth, smoothAll, snapValue, uid,
  type NodeState
} from './geometry'
import { narrowerThan } from './offset'
import { Preview3D, type CameraView } from './preview3d'
import { createStlBlob, meshBounds } from './solid'
import { designSvg } from './svgexport'
import type { Design, Detail, Issue, Layer, Mesh, Node2D, Path, Underlay, Vec2 } from './types'

const STORAGE_KEY = 'cookie-cutter-designer-v1'

/**
 * 画面上の大きさ(px)で決める。ズームしても掴みやすさが変わらないようにするため。
 * 見た目の丸は小さく、掴める範囲は広く。4px程度だと狙うのが苦しい。
 */
const NODE_RADIUS_PX = 4.5
const HANDLE_RADIUS_PX = 3.8
const HIT_RADIUS_PX = 11
/** 絵柄の本体を掴むときのあそび。 */
const DETAIL_SLACK_PX = 10
/** 線をダブルクリックして点を足すときの許容。 */
const INSERT_TOLERANCE_PX = 24
/** 要注意箇所の印の大きさ。 */
const PROBLEM_RADIUS_PX = 9
const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark"></span><span class="brand-text">クッキー型デザイナー</span></div>
      <input id="project-name" class="project-name" aria-label="デザイン名" />
      <button class="btn icon" id="undo" title="元に戻す (Ctrl+Z)">↶</button>
      <button class="btn icon" id="redo" title="やり直す (Ctrl+Y)">↷</button>
      <button class="btn" id="new-design">新規</button>
      <button class="btn notice" id="open-notice">
        <svg class="btn-icon" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 1.8 16.6 15H1.4Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 6.6v3.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="12.6" r="1" fill="currentColor"/></svg>
        使う前に
      </button>
      <span class="spacer"></span>
      <a class="author" href="https://oyabe-craft.com/" target="_blank" rel="noopener">オヤベクラフト</a>
      <button class="btn" id="save-json">保存</button>
      <button class="btn" id="load-json">読込</button>
      <input id="json-file" type="file" accept="application/json,.json" hidden />
      <input id="image-file" type="file" accept="image/*" hidden />
      <span class="divider"></span>
      <div class="menu" id="export-menu">
        <button class="btn primary" id="export-button" aria-haspopup="menu" aria-expanded="false">
          <svg class="btn-icon" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2.4v8.4M5.4 7.4 9 11l3.6-3.6M3.4 14.6h11.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          エクスポート
          <span class="caret" aria-hidden="true"></span>
        </button>
        <div class="menu-panel" id="export-panel" role="menu" hidden></div>
      </div>
    </header>

    <section class="workspace">
      <section class="pane">
        <div class="pane-head layer-head">
          <div class="layer-tabs" id="layer-tabs"></div>
          <span class="spacer"></span>
          <button class="btn" id="fit-view">全体表示</button>
        </div>
        <div class="pane-head tool-head">
          <span class="layer-purpose" id="layer-purpose"></span>
          <span class="spacer"></span>
          <div class="tool-tabs" id="tool-tabs"></div>
        </div>
        <div class="canvas-wrap">
          <svg id="editor-svg"></svg>
          <p class="canvas-help" id="canvas-help"></p>
        </div>
        <div class="inspector" id="inspector"></div>
        <div class="issues" id="issues"></div>
      </section>

      <section class="pane">
        <div class="pane-head">
          <span class="pane-title">3D プレビュー</span>
          <div class="tool-tabs" id="show-tabs">
            <button class="tool active" data-show="both">両方</button>
            <button class="tool" data-show="cutter"><span class="chip" style="--c:#3aa6a0"></span>枠</button>
            <button class="tool" data-show="stamp"><span class="chip" style="--c:#e08fb4"></span>スタンプ</button>
          </div>
          <span class="spacer"></span>
          <span class="head-label">視点</span>
          <div class="tool-tabs">
            <button class="tool" data-view="home">斜め</button>
            <button class="tool" data-view="top">上から</button>
            <button class="tool" data-view="front">正面</button>
          </div>
        </div>
        <div class="preview-stage">
          <div id="preview3d"></div>
          <div class="axis-label">ドラッグ: 回転 / ホイール: 拡大縮小</div>
        </div>
        <div class="properties" id="properties"></div>
      </section>
    </section>

    <div class="status" id="status"></div>

    <dialog class="notice-dialog" id="notice-dialog">
      <article>
        <h2>使う前に読んでください</h2>

        <h3>この型について</h3>
        <p>3Dプリンタで作る型は、ふつう<strong>食品衛生法の規格に適合しているか確認されていません</strong>。市販の製菓道具とは違うものだと考えてください。</p>

        <h3>自分で使う場合</h3>
        <p>食品衛生法が禁じているのは「販売」「販売用の製造」「輸入」「営業上の使用」です。<strong>自分で作って自分で使う分には、これらに当たらないと考えられます。</strong>ただし安全性を保証する人はいないので、自己責任になります。</p>

        <h3>売る場合</h3>
        <p><strong>型そのものを売る行為</strong>や、<strong>販売する食品を作るために型を使う行為</strong>は、上の禁止に当たる可能性があります。その場合、型が規格に適合している必要があります。</p>
        <p class="strong-note">売ることを考えているなら、必ず管轄の保健所に相談してください。</p>

        <h3>衛生上の注意</h3>
        <ul>
          <li>積層の溝に汚れが残りやすく、洗っても落としきれない可能性があります</li>
          <li>よく使われるPLAは60℃前後で軟らかくなるため、煮沸消毒はできません</li>
          <li>着色料や添加剤は、食品に触れる前提で評価されているとは限りません</li>
        </ul>
        <p><strong>食品用のラップやポリエチレンシートを介して使うことをおすすめします。</strong>材料は無着色のものを選び、使うたびに洗って完全に乾かしてください。</p>

        <h3>免責</h3>
        <p class="disclaimer">ここに書いた内容は、公開されている情報を調べて整理したものであり、法的な助言ではありません。作者の故意または重大な過失による場合を除き、このツールおよび出力したデータの利用によって生じた結果について、作者は責任を負いません。最終的な判断はご自身で、必要に応じて管轄の保健所に確認のうえ行ってください。</p>

        <div class="notice-actions">
          <button class="btn primary" id="close-notice">閉じる</button>
        </div>
      </article>
    </dialog>
  </main>`

const svg = document.querySelector<SVGSVGElement>('#editor-svg')!
const statusBar = document.querySelector<HTMLDivElement>('#status')!
const issuesBox = document.querySelector<HTMLDivElement>('#issues')!
const inspectorBox = document.querySelector<HTMLDivElement>('#inspector')!
const helpText = document.querySelector<HTMLParagraphElement>('#canvas-help')!
const preview = new Preview3D(document.querySelector<HTMLDivElement>('#preview3d')!)

type Tool = 'select' | 'add' | 'stroke' | 'region'
type Show = 'both' | 'cutter' | 'stamp'
type Selection = { nodeId: string; part: 'node' | 'in' | 'out' } | null
type Drag =
  | { kind: 'node'; nodeId: string; part: 'node' | 'in' | 'out'; dirty: boolean }
  | { kind: 'move'; detailId: string; origin: Vec2; base: Node2D[]; dirty: boolean }
  | { kind: 'underlay'; origin: Vec2; base: Underlay; mode: 'move' | 'scale'; dirty: boolean }
  | { kind: 'pan'; startClient: Vec2; startView: Vec2 }
  | null

let design: Design = load() ?? initialDesign()
let layer: Layer = 'outline'
let tool: Tool = 'select'
let show: Show = 'both'
let selection: Selection = null
let selectedDetailId: string | null = null
let sketch: { kind: 'stroke' | 'region'; points: Vec2[] } | null = null
/** コピーした絵柄。ページ内だけで完結する簡易なクリップボード。 */
let clipboard: Detail | null = null
/** 検査で見つかった要注意箇所。画面上に印を出すために持っておく。 */
let problems: OutlineProblem[] = []
let drag: Drag = null
let view = { x: -60, y: -45, width: 120 }
const undoStack: Design[] = []
const redoStack: Design[] = []

/** 道具のアイコン。何ができる道具かが形で分かるようにする。 */
const TOOL_ICONS: Record<Tool, string> = {
  // 矢印カーソル
  select: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4.2 2.4 4.2 14.4 7.3 11.4 9.5 16 11.7 15 9.4 10.6 13.6 10.3Z" fill="currentColor"/></svg>`,
  // 線の途中に点を足す
  add: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2 13.5C5 13.5 5.5 7 9 7s4 3.2 7 3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/><circle cx="9" cy="7" r="2.6" fill="#fff" stroke="currentColor" stroke-width="1.8"/><path d="M13.6 3.2v3.6M11.8 5h3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  // うねった1本の線（＝絵柄の線）
  stroke: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.6 13.6c2.4-6.6 5-8.2 7-5.4 1.5 2.1 2.8 3.6 5.8-1.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  // 塗られた面（＝絵柄の面）
  region: `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4 6.2 9.4 2.6 15.2 6.6 13.2 14.4 5.8 13.8Z" fill="currentColor" opacity=".3"/><path d="M4 6.2 9.4 2.6 15.2 6.6 13.2 14.4 5.8 13.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`
}

const TOOLS: Record<Layer, { id: Tool; label: string }[]> = {
  outline: [
    { id: 'select', label: '選択' },
    { id: 'add', label: '点を追加' }
  ],
  detail: [
    { id: 'select', label: '選択' },
    { id: 'stroke', label: '線を描く' },
    { id: 'region', label: '面を描く' }
  ],
  // 下絵は置くだけなので道具は要らない。
  underlay: []
}

const HELP: Record<Tool, string> = {
  select: 'クリック: 選択（何もない所で解除） / ドラッグ: 移動 / 矢印キー: 少し動かす（Shiftで大きく） / ダブルクリック: 点を追加 / Del: 削除 / Ctrl+D: 複製 / ホイール: 拡大縮小',
  add: '線の上をクリック: 点を追加',
  stroke: 'クリックで点を置く / Enter または ダブルクリック: 確定 / Esc: 取り消し',
  region: 'クリックで点を置く / Enter または ダブルクリック: 確定（3点以上） / Esc: 取り消し'
}

/* ---------- 履歴 ---------- */

function snapshot() {
  undoStack.push(clone(design))
  if (undoStack.length > 60) undoStack.shift()
  redoStack.length = 0
}

function undo() {
  const previous = undoStack.pop()
  if (!previous) return
  redoStack.push(clone(design))
  design = previous
  selection = null
  refresh()
}

function redo() {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(clone(design))
  design = next
  selection = null
  refresh()
}

/* ---------- 座標変換 ---------- */

function viewBox() {
  const width = Math.max(1, svg.clientWidth)
  const height = Math.max(1, svg.clientHeight)
  return { x: view.x, y: view.y, w: view.width, h: (view.width * height) / width }
}

// 初回描画はレイアウトが確定する前に走ることがあるので、大きさが決まったら描き直す。
new ResizeObserver(() => drawEditor()).observe(svg)

function toWorld(event: { clientX: number; clientY: number }): Vec2 {
  const rect = svg.getBoundingClientRect()
  const box = viewBox()
  return {
    x: box.x + ((event.clientX - rect.left) / rect.width) * box.w,
    y: box.y + ((event.clientY - rect.top) / rect.height) * box.h
  }
}

function fitView() {
  const points = design.outline.nodes.map((n) => ({ x: n.x, y: n.y }))
  if (!points.length) return
  const box = boundsOf(points)
  const width = Math.max(box.maxX - box.minX, box.maxY - box.minY, 20) * 1.6
  view = {
    x: (box.minX + box.maxX) / 2 - width / 2,
    y: (box.minY + box.maxY) / 2 - width / 2,
    width
  }
}

/* ---------- パスの取り回し ---------- */

const selectedDetail = () => design.details.find((d) => d.id === selectedDetailId) ?? null

/** その節点が属するパスを探す。いま編集できるレイヤーのものだけ返す。 */
function pathOf(nodeId: string): Path | null {
  if (layer === 'outline') {
    return design.outline.nodes.some((n) => n.id === nodeId) ? design.outline : null
  }
  for (const detail of design.details) {
    if (detail.path.nodes.some((n) => n.id === nodeId)) return detail.path
  }
  return null
}

function detailOf(nodeId: string): Detail | null {
  return design.details.find((d) => d.path.nodes.some((n) => n.id === nodeId)) ?? null
}

function makePath(points: Vec2[], closed: boolean): Path {
  return { nodes: points.map((p) => ({ id: uid('n'), x: p.x, y: p.y, in: null, out: null })), closed }
}

/**
 * その位置にある絵柄を探す。線は太さの分だけ、面は内側もクリック範囲に含める。
 * 重なっている場合は一番近いものを返す。
 */
/** 画面上の px を、いまの表示倍率での座標の長さに直す。 */
function px(value: number) {
  return (value * viewBox().w) / Math.max(1, svg.clientWidth)
}

function detailAt(point: Vec2): Detail | null {
  const unit = mmPerUnit(design)
  const slack = px(DETAIL_SLACK_PX)
  let best: { detail: Detail; distance: number } | null = null
  for (const detail of design.details) {
    const hit = nearestOnPath(detail.path, point)
    if (!hit) continue
    const reach = detail.kind === 'stroke' ? detail.width / unit / 2 + slack : slack
    let distance = hit.distance - reach
    if (detail.kind === 'region' && pointInPolygon(samplePath(detail.path), point)) distance = -1
    if (distance <= 0 && (!best || hit.distance < best.distance)) {
      best = { detail, distance: hit.distance }
    }
  }
  return best?.detail ?? null
}

/** 絵柄を複製する。節点のidは振り直さないと元と同じものを指してしまう。 */
function copyOfDetail(detail: Detail, dx: number, dy: number): Detail {
  const path: Path = {
    closed: detail.path.closed,
    nodes: detail.path.nodes.map((node) => ({
      id: uid('n'),
      x: node.x + dx,
      y: node.y + dy,
      in: node.in ? { x: node.in.x + dx, y: node.in.y + dy } : null,
      out: node.out ? { x: node.out.x + dx, y: node.out.y + dy } : null
    }))
  }
  return detail.kind === 'stroke'
    ? { id: uid('d'), kind: 'stroke', path, width: detail.width }
    : { id: uid('d'), kind: 'region', path }
}

function deleteSelectedDetail() {
  const detail = selectedDetail()
  if (!detail) return
  snapshot()
  design.details = design.details.filter((d) => d.id !== detail.id)
  select(null)
  refresh()
}

/** 矢印キーで少しずつ動かす。点を選んでいればその点、絵柄だけならその絵柄。 */
function nudge(direction: Vec2, big: boolean, repeated: boolean) {
  const step = (design.snap ? design.grid : px(1)) * (big ? 10 : 1)
  const dx = direction.x * step
  const dy = direction.y * step

  const move = (node: Node2D) => {
    node.x += dx
    node.y += dy
    if (node.in) { node.in.x += dx; node.in.y += dy }
    if (node.out) { node.out.x += dx; node.out.y += dy }
  }

  if (selection) {
    const path = pathOf(selection.nodeId)
    const node = path?.nodes.find((n) => n.id === selection!.nodeId)
    if (!node) return
    if (!repeated) snapshot()
    if (selection.part === 'node') move(node)
    else {
      const handle = node[selection.part]
      if (handle) { handle.x += dx; handle.y += dy }
    }
    refresh()
    return
  }

  const detail = selectedDetail()
  if (detail) {
    if (!repeated) snapshot()
    detail.path.nodes.forEach(move)
    refresh()
    return
  }

  if (design.underlay && layer === 'underlay') {
    if (!repeated) snapshot()
    design.underlay.x += dx
    design.underlay.y += dy
    refresh()
  }
}

function pasteDetail() {
  if (!clipboard) return
  snapshot()
  // 真上に重ねると見分けがつかないので少しずらす。
  const offset = design.snap ? design.grid : px(14)
  const copy = copyOfDetail(clipboard, offset, offset)
  design.details.push(copy)
  select(copy.id)
  layer = 'detail'
  syncLayerTabs()
  refresh()
  showStatus(`${copy.kind === 'stroke' ? '線' : '面'}を貼り付けました。`)
}

function select(detailId: string | null, nodeSelection: Selection = null) {
  if (detailId === selectedDetailId && nodeSelection === selection) return false
  selectedDetailId = detailId
  selection = nodeSelection
  return true
}

/* ---------- 2D 描画 ---------- */

const NS = 'http://www.w3.org/2000/svg'
const el = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

function pathD(path: Path) {
  if (path.nodes.length < 2) return ''
  let d = `M ${path.nodes[0].x} ${path.nodes[0].y}`
  for (let i = 0; i < segmentCount(path); i++) {
    const [a, b] = segmentEnds(path, i)
    d += isCurve(a, b)
      ? ` C ${a.out!.x} ${a.out!.y} ${b.in!.x} ${b.in!.y} ${b.x} ${b.y}`
      : ` L ${b.x} ${b.y}`
  }
  return path.closed ? d + ' Z' : d
}

function drawEditor() {
  const box = viewBox()
  svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`)
  svg.replaceChildren()

  // グリッド
  const step = design.grid > 0 ? design.grid : 5
  const gridGroup = el('g', {})
  const from = (value: number) => Math.floor(value / step) * step
  for (let x = from(box.x); x < box.x + box.w; x += step) {
    gridGroup.append(el('line', {
      x1: x, y1: box.y, x2: x, y2: box.y + box.h,
      class: Math.abs(x) < 1e-6 ? 'grid-axis' : 'grid-line'
    }))
  }
  for (let y = from(box.y); y < box.y + box.h; y += step) {
    gridGroup.append(el('line', {
      x1: box.x, y1: y, x2: box.x + box.w, y2: y,
      class: Math.abs(y) < 1e-6 ? 'grid-axis' : 'grid-line'
    }))
  }
  svg.append(gridGroup)

  // 下絵。線より先に置いて、常に背面にする。
  const under = design.underlay
  if (under) {
    const editable = layer === 'underlay'
    const image = el('image', {
      href: under.dataUrl, x: under.x, y: under.y,
      width: under.width, height: under.height,
      opacity: under.opacity,
      preserveAspectRatio: 'none',
      class: `underlay${editable ? ' editable' : ''}`
    })
    if (editable) {
      image.addEventListener('pointerdown', (event) => startUnderlayDrag(event as PointerEvent, 'move'))
    }
    svg.append(image)
    if (editable) {
      svg.append(el('rect', {
        x: under.x, y: under.y, width: under.width, height: under.height, class: 'underlay-frame'
      }))
      const grip = el('circle', {
        cx: under.x + under.width, cy: under.y + under.height,
        r: (box.w / Math.max(1, svg.clientWidth)) * 7, class: 'underlay-grip'
      })
      grip.addEventListener('pointerdown', (event) => startUnderlayDrag(event as PointerEvent, 'scale'))
      svg.append(grip)
    }
  }

  // 輪郭。編集対象でないときは薄く出して、位置の目安にする。
  // ここで作る要素は再描画のたびに消えるので、操作のリスナーは svg 側に置く。
  svg.append(el('path', {
    d: pathD(design.outline),
    class: layer === 'outline' ? 'outline-shape' : 'outline-shape dim'
  }))

  // 絵柄
  const unit = mmPerUnit(design)
  for (const detail of design.details) {
    const active = layer === 'detail'
    const selected = detail.id === selectedDetailId
    if (detail.kind === 'stroke') {
      svg.append(el('path', {
        d: pathD(detail.path),
        class: `detail-stroke${active ? '' : ' dim'}${selected ? ' selected' : ''}`,
        'stroke-width': detail.width / unit
      }))
    } else {
      svg.append(el('path', {
        d: pathD(detail.path),
        class: `detail-region${active ? '' : ' dim'}${selected ? ' selected' : ''}`
      }))
    }
  }

  // 描きかけ
  if (sketch && sketch.points.length) {
    const d = sketch.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
    svg.append(el('path', { d: sketch.kind === 'region' ? d + ' Z' : d, class: 'sketch' }))
    for (const point of sketch.points) {
      svg.append(el('circle', { cx: point.x, cy: point.y, r: box.w / 220, class: 'sketch-dot' }))
    }
  }

  // 要注意箇所の印。どこを直せばいいかが分かるように、線の上に重ねる。
  for (const problem of problems) {
    svg.append(el('circle', {
      cx: problem.point.x, cy: problem.point.y,
      r: (box.w / Math.max(1, svg.clientWidth)) * PROBLEM_RADIUS_PX,
      class: `problem ${problem.kind}`
    }))
  }

  // 節点とハンドルは、編集できるレイヤーのものだけ出す。
  const editable: Path[] =
    layer === 'outline' ? [design.outline]
    : layer === 'detail' ? design.details.filter((d) => !selectedDetailId || d.id === selectedDetailId).map((d) => d.path)
    : []

  const unitsPerPx = box.w / Math.max(1, svg.clientWidth)
  const hitRadius = HIT_RADIUS_PX * unitsPerPx

  // 見た目の丸は小さいままにして、掴める範囲だけ透明な丸で広げる。
  const hit = (center: Vec2, nodeId: string, part: 'node' | 'in' | 'out') => {
    const area = el('circle', { cx: center.x, cy: center.y, r: hitRadius, class: 'hit' })
    area.addEventListener('pointerdown', (event) => startDrag(event as PointerEvent, nodeId, part))
    return area
  }

  const handleHits: SVGCircleElement[] = []
  const nodeHits: SVGCircleElement[] = []

  for (const path of editable) {
    path.nodes.forEach((node, index) => {
      for (const part of ['in', 'out'] as const) {
        const handle = node[part]
        // 効いていないハンドルは出さない。直線の脇に動かないハンドルが残ると紛らわしい。
        if (!handle || !handleIsActive(path, index, part)) continue
        svg.append(el('line', { x1: node.x, y1: node.y, x2: handle.x, y2: handle.y, class: 'handle-line' }))
        svg.append(el('circle', { cx: handle.x, cy: handle.y, r: HANDLE_RADIUS_PX * unitsPerPx, class: 'handle' }))
        handleHits.push(hit(handle, node.id, part))
      }
    })
    for (const node of path.nodes) {
      const selected = selection?.nodeId === node.id && selection.part === 'node'
      svg.append(el('circle', {
        cx: node.x, cy: node.y, r: NODE_RADIUS_PX * unitsPerPx,
        class: `node${selected ? ' selected' : ''}`
      }))
      nodeHits.push(hit(node, node.id, 'node'))
    }
  }
  // 重なったときはハンドルより節点を優先したいので、節点の判定を後から重ねる。
  svg.append(...handleHits, ...nodeHits)
}

/* ---------- 操作 ---------- */

function startDrag(event: PointerEvent, nodeId: string, part: 'node' | 'in' | 'out') {
  if (sketch) return
  event.stopPropagation()
  if (tool !== 'select') return
  // 履歴は実際に動かしたときだけ残す。掴んだだけで Undo が積まれると使いにくい。
  select(detailOf(nodeId)?.id ?? selectedDetailId, { nodeId, part })
  drag = { kind: 'node', nodeId, part, dirty: false }
  svg.setPointerCapture(event.pointerId)
  drawEditor()
  renderInspector()
}

function startUnderlayDrag(event: PointerEvent, mode: 'move' | 'scale') {
  if (!design.underlay) return
  event.stopPropagation()
  drag = { kind: 'underlay', origin: toWorld(event), base: { ...design.underlay }, mode, dirty: false }
  svg.setPointerCapture(event.pointerId)
}

/**
 * 下絵を読み込む。大きい画像をそのまま持つと localStorage に入らないので、
 * 長辺 1400px までに縮めてから取り込む。なぞるだけなら十分な解像度。
 */
async function loadUnderlay(file: File) {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした。')) }
    image.src = url
  })

  const limit = 1400
  const scale = Math.min(1, limit / Math.max(source.naturalWidth, source.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  // 透過を保ちたいので PNG のまま出す。
  const dataUrl = canvas.toDataURL('image/png')

  // 枠と同じくらいの大きさで、中央に置く。
  const bounds = boundsOf(design.outline.nodes.map((n) => ({ x: n.x, y: n.y })))
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 20)
  const width = span * 1.1
  const height = (width * canvas.height) / canvas.width

  snapshot()
  design.underlay = {
    dataUrl,
    x: (bounds.minX + bounds.maxX) / 2 - width / 2,
    y: (bounds.minY + bounds.maxY) / 2 - height / 2,
    width,
    height,
    opacity: 0.45
  }
  layer = 'underlay'
  syncLayerTabs()
  refresh()
  showStatus(`下絵を読み込みました（${canvas.width} × ${canvas.height} px）。位置と大きさを合わせてから、枠や絵柄でなぞってください。`)
}

function finishSketch() {
  if (!sketch) return
  const minimum = sketch.kind === 'region' ? 3 : 2
  if (sketch.points.length >= minimum) {
    snapshot()
    const detail: Detail = sketch.kind === 'stroke'
      ? { id: uid('d'), kind: 'stroke', path: makePath(sketch.points, false), width: 1.5 }
      : { id: uid('d'), kind: 'region', path: makePath(sketch.points, true) }
    design.details.push(detail)
    selectedDetailId = detail.id
  }
  sketch = null
  tool = 'select'
  renderToolTabs()
  refresh()
}

svg.addEventListener('pointerdown', (event) => {
  const point = toWorld(event)
  const snapped = design.snap
    ? { x: snapValue(point.x, design.grid), y: snapValue(point.y, design.grid) }
    : point

  if (tool === 'stroke' || tool === 'region') {
    if (!sketch) sketch = { kind: tool, points: [] }
    sketch.points.push(snapped)
    drawEditor()
    return
  }

  if (tool === 'add' && layer === 'outline') {
    const hit = nearestOnPath(design.outline, point)
    if (hit) {
      snapshot()
      const created = insertNode(design.outline, hit.index, hit.t)
      created.x = snapped.x
      created.y = snapped.y
      selection = { nodeId: created.id, part: 'node' }
      refresh()
      return
    }
  }

  // 節点そのものを掴んだときは startDrag 側で処理済み。ここに来るのは背景か絵柄の本体。
  if (tool === 'select') {
    if (layer === 'detail') {
      const hit = detailAt(point)
      if (hit) {
        // 別の絵柄をクリックしたら選択を切り替え、そのままドラッグで動かせるようにする。
        if (select(hit.id)) refresh()
        drag = {
          kind: 'move',
          detailId: hit.id,
          origin: point,
          base: clone(hit.path.nodes),
          dirty: false
        }
        svg.setPointerCapture(event.pointerId)
        return
      }
    }
    // 何もないところをクリックしたら選択を解除する。
    if (select(null)) refresh()
  }

  drag = { kind: 'pan', startClient: { x: event.clientX, y: event.clientY }, startView: { x: view.x, y: view.y } }
  svg.setPointerCapture(event.pointerId)
})

svg.addEventListener('dblclick', (event: MouseEvent) => {
  if (sketch) { finishSketch(); return }
  if (tool !== 'select' || layer === 'underlay') return
  const point = toWorld(event)
  const tolerance = px(INSERT_TOLERANCE_PX)
  const targets: Path[] = layer === 'outline'
    ? [design.outline]
    : design.details.map((d) => d.path)
  let best: { path: Path; index: number; t: number; distance: number } | null = null
  for (const path of targets) {
    const hit = nearestOnPath(path, point)
    if (hit && (!best || hit.distance < best.distance)) best = { path, ...hit }
  }
  if (!best || best.distance > tolerance) return
  snapshot()
  const created = insertNode(best.path, best.index, best.t)
  selection = { nodeId: created.id, part: 'node' }
  refresh()
})

svg.addEventListener('pointermove', (event) => {
  const active = drag
  if (!active) return
  if (active.kind === 'pan') {
    const rect = svg.getBoundingClientRect()
    const box = viewBox()
    view.x = active.startView.x - ((event.clientX - active.startClient.x) / rect.width) * box.w
    view.y = active.startView.y - ((event.clientY - active.startClient.y) / rect.height) * box.h
    drawEditor()
    return
  }
  if (active.kind === 'underlay') {
    if (!design.underlay) return
    const point = toWorld(event)
    let dx = point.x - active.origin.x
    let dy = point.y - active.origin.y
    if (design.snap) {
      dx = snapValue(dx, design.grid)
      dy = snapValue(dy, design.grid)
    }
    if (!dx && !dy) return
    if (!active.dirty) { snapshot(); active.dirty = true }
    if (active.mode === 'move') {
      design.underlay.x = active.base.x + dx
      design.underlay.y = active.base.y + dy
    } else {
      // 縦横比は保つ。横のドラッグ量を基準にする。
      const width = Math.max(4, active.base.width + dx)
      design.underlay.width = width
      design.underlay.height = (width * active.base.height) / active.base.width
    }
    refresh()
    return
  }

  if (active.kind === 'move') {
    const detail = design.details.find((d) => d.id === active.detailId)
    if (!detail) return
    const point = toWorld(event)
    let dx = point.x - active.origin.x
    let dy = point.y - active.origin.y
    if (design.snap) {
      dx = snapValue(dx, design.grid)
      dy = snapValue(dy, design.grid)
    }
    if (!dx && !dy) return
    if (!active.dirty) { snapshot(); active.dirty = true }
    // 掴んだ時点の座標を基準に置き直す。差分を足し続けるとズレが溜まる。
    detail.path.nodes.forEach((node, index) => {
      const base = active.base[index]
      if (!base) return
      node.x = base.x + dx
      node.y = base.y + dy
      node.in = base.in ? { x: base.in.x + dx, y: base.in.y + dy } : null
      node.out = base.out ? { x: base.out.x + dx, y: base.out.y + dy } : null
    })
    refresh()
    return
  }

  const path = pathOf(active.nodeId)
  const node = path?.nodes.find((n) => n.id === active.nodeId)
  if (!node) return
  const point = toWorld(event)
  const x = design.snap ? snapValue(point.x, design.grid) : point.x
  const y = design.snap ? snapValue(point.y, design.grid) : point.y
  if (active.part === 'node' && x === node.x && y === node.y) return
  if (!active.dirty) { snapshot(); active.dirty = true }
  if (active.part === 'node') {
    const dx = x - node.x
    const dy = y - node.y
    node.x = x
    node.y = y
    // ハンドルは点にぶら下がっているので一緒に動かす。
    if (node.in) { node.in.x += dx; node.in.y += dy }
    if (node.out) { node.out.x += dx; node.out.y += dy }
  } else {
    node[active.part] = { x, y }
  }
  refresh()
})

const endDrag = (event: PointerEvent) => {
  if (drag && svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId)
  drag = null
}
svg.addEventListener('pointerup', endDrag)
svg.addEventListener('pointercancel', endDrag)

svg.addEventListener('wheel', (event) => {
  event.preventDefault()
  const before = toWorld(event)
  const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12
  view.width = Math.min(1200, Math.max(8, view.width * factor))
  const after = toWorld(event)
  view.x += before.x - after.x
  view.y += before.y - after.y
  drawEditor()
}, { passive: false })

addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  // 注意書きを開いている間は、背後の編集操作を動かさない。
  // Esc は dialog 自身が閉じるので、ここでは何もしない。
  if (document.querySelector<HTMLDialogElement>('#notice-dialog')?.open) return
  const meta = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  // Ctrl+Shift+Z も「やり直す」。Ctrl+Y と並ぶ一般的な割り当て。
  if (meta && key === 'z' && event.shiftKey) { event.preventDefault(); redo(); return }
  if (meta && key === 'z') { event.preventDefault(); undo(); return }
  if (meta && key === 'y') { event.preventDefault(); redo(); return }
  if (meta && key === 's') {
    // ブラウザの保存ダイアログを止めて、こちらのJSON保存にする。
    event.preventDefault()
    saveJson()
    return
  }

  if (meta && (key === 'c' || key === 'x')) {
    const detail = selectedDetail()
    if (!detail) return
    event.preventDefault()
    clipboard = copyOfDetail(detail, 0, 0)
    if (key === 'x') deleteSelectedDetail()
    else showStatus(`${detail.kind === 'stroke' ? '線' : '面'}をコピーしました。Ctrl+V で貼り付けます。`)
    return
  }
  if (meta && key === 'v') {
    if (!clipboard) return
    event.preventDefault()
    pasteDetail()
    return
  }
  if (meta && key === 'd') {
    const detail = selectedDetail()
    if (!detail) return
    event.preventDefault()
    clipboard = copyOfDetail(detail, 0, 0)
    pasteDetail()
    return
  }

  if (event.key === 'Enter' && sketch) { event.preventDefault(); finishSketch(); return }
  if (event.key === 'Escape') {
    if (sketch) { sketch = null; tool = 'select'; renderToolTabs(); refresh() }
    else if (select(null)) refresh()
    return
  }

  const arrows: Record<string, Vec2> = {
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }
  }
  const direction = arrows[event.key]
  if (direction) {
    event.preventDefault()
    // 押しっぱなしの繰り返しでは履歴を増やさない。60件の履歴がすぐ埋まってしまう。
    nudge(direction, event.shiftKey, event.repeat)
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    // 節点を選んでいればその点を、絵柄だけを選んでいれば絵柄ごと消す。
    if (selection) {
      event.preventDefault()
      const path = pathOf(selection.nodeId)
      if (!path) return
      const owner = detailOf(selection.nodeId)
      const minimum = path.closed ? 3 : 2
      // これ以上減らせない絵柄は、点ではなく絵柄ごと消す。
      if (owner && path.nodes.length <= minimum) {
        select(owner.id)
        deleteSelectedDetail()
        return
      }
      snapshot()
      deleteNode(path, selection.nodeId)
      selection = null
      refresh()
      return
    }
    if (selectedDetailId) {
      event.preventDefault()
      deleteSelectedDetail()
    }
  }
})

/* ---------- タブ ---------- */

function renderToolTabs() {
  const host = document.querySelector<HTMLDivElement>('#tool-tabs')!
  host.replaceChildren()
  // 選択中の道具はレイヤーの色で示す。いまどのモードの道具かが結びつく。
  const active = LAYERS.find((item) => item.id === layer)!
  host.style.setProperty('--layer', active.color)
  host.style.setProperty('--layer-soft', active.soft)
  for (const item of TOOLS[layer]) {
    const button = document.createElement('button')
    // 「描く」道具は作る操作なので、選択より目立たせる。
    const creates = item.id !== 'select'
    button.className = `tool icon-tool${creates ? ' creates' : ''}${item.id === tool ? ' active' : ''}`
    button.innerHTML = TOOL_ICONS[item.id]
    button.append(Object.assign(document.createElement('span'), { textContent: item.label }))
    button.addEventListener('click', () => {
      if (sketch) sketch = null
      tool = item.id
      renderToolTabs()
      drawEditor()
    })
    host.append(button)
  }
  helpText.textContent = layer === 'underlay'
    ? '画像をドロップ、または「画像を読み込む」/ ドラッグで移動 / 右下の丸で拡大縮小 / 濃さを下げてから枠タブでなぞります'
    : HELP[tool]
}

/**
 * レイヤーは最上位のモードなので、道具のタブとは見た目を明確に分ける。
 * 色はキャンバス上のその要素の色と揃えてある（枠=青、絵柄=ピンク、下絵=紫）。
 */
const LAYERS: { id: Layer; label: string; color: string; soft: string; purpose: string; icon: string }[] = [
  {
    id: 'outline', label: '枠', color: '#2767ae', soft: '#e8f0fa',
    purpose: 'クッキーの外形。抜き枠とスタンプ板の両方がこの線から作られます。',
    icon: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6c4 0 7.4 3.3 7.4 7.4S14 17.4 10 17.4 2.6 14.1 2.6 10 6 2.6 10 2.6Z" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`
  },
  {
    id: 'detail', label: '絵柄', color: '#c2508a', soft: '#fbeaf3',
    purpose: 'スタンプに浮き出る模様。枠の内側に描きます。抜き枠には影響しません。',
    icon: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.6c4 0 7.4 3.3 7.4 7.4S14 17.4 10 17.4 2.6 14.1 2.6 10 6 2.6 10 2.6Z" fill="currentColor" opacity=".16"/><path d="M10 2.6c4 0 7.4 3.3 7.4 7.4S14 17.4 10 17.4 2.6 14.1 2.6 10 6 2.6 10 2.6Z" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".5"/><circle cx="7.4" cy="8.2" r="1.25" fill="currentColor"/><circle cx="12.6" cy="8.2" r="1.25" fill="currentColor"/><path d="M6.8 12.2c1 1.4 5.4 1.4 6.4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`
  },
  {
    id: 'underlay', label: '下絵', color: '#7c3aed', soft: '#f1e9fe',
    purpose: 'なぞる元にする画像。立体には一切影響しません。',
    icon: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.6" y="4" width="14.8" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="8.2" r="1.4" fill="currentColor"/><path d="M3.6 14.4 7.8 10.6l2.6 2.4 3.2-3.4 2.8 3.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  }
]

function renderLayerTabs() {
  const host = document.querySelector<HTMLDivElement>('#layer-tabs')!
  host.replaceChildren()
  for (const item of LAYERS) {
    // 下絵は設計そのものではなく補助なので、少し離して置く。
    if (item.id === 'underlay') {
      const divider = document.createElement('span')
      divider.className = 'layer-divider'
      host.append(divider)
    }
    const tab = document.createElement('button')
    tab.className = `layer-tab${item.id === layer ? ' active' : ''}`
    tab.dataset.layer = item.id
    tab.style.setProperty('--layer', item.color)
    tab.innerHTML = item.icon
    tab.append(Object.assign(document.createElement('span'), { textContent: item.label }))
    tab.addEventListener('click', () => {
      if (layer === item.id) return
      layer = item.id
      tool = 'select'
      sketch = null
      selection = null
      syncLayerTabs()
      refresh()
    })
    host.append(tab)
  }
  const purpose = document.querySelector<HTMLSpanElement>('#layer-purpose')!
  const active = LAYERS.find((item) => item.id === layer)!
  purpose.textContent = active.purpose
  purpose.style.setProperty('--layer', active.color)
}

function syncLayerTabs() {
  renderLayerTabs()
  renderToolTabs()
}

document.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((button) => {
  button.addEventListener('click', () => {
    show = button.dataset.show as Show
    document.querySelectorAll('[data-show]').forEach((other) => other.classList.toggle('active', other === button))
    refresh()
  })
})

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => preview.setView(button.dataset.view as CameraView))
})

document.querySelector('#fit-view')!.addEventListener('click', () => { fitView(); drawEditor() })
document.querySelector('#undo')!.addEventListener('click', undo)
document.querySelector('#redo')!.addEventListener('click', redo)

document.querySelector('#new-design')!.addEventListener('click', () => {
  snapshot()
  design.outline = emptyOutline()
  design.details = []
  selection = null
  selectedDetailId = null
  fitView()
  refresh()
})

/* ---------- 選択中の要素 ---------- */

function button(label: string, onClick: () => void) {
  const node = document.createElement('button')
  node.className = 'btn'
  node.textContent = label
  node.addEventListener('click', onClick)
  return node
}

function renderInspector() {
  inspectorBox.replaceChildren()
  const detail = selectedDetail()

  if (layer === 'underlay') {
    const under = design.underlay
    const label = document.createElement('span')
    label.className = 'inspector-label'
    label.textContent = under
      ? 'ドラッグで移動 / 右下の丸で拡大縮小'
      : 'なぞりたい画像を読み込みます（キャンバスにドロップしてもOK）'
    inspectorBox.append(label)
    inspectorBox.append(button(under ? '画像を差し替え' : '画像を読み込む', () => imageInput.click()))
    if (under) {
      const opacity = document.createElement('label')
      opacity.className = 'field inline'
      opacity.textContent = '濃さ'
      const slider = document.createElement('input')
      slider.type = 'range'
      slider.min = '0.05'
      slider.max = '1'
      slider.step = '0.05'
      slider.value = String(under.opacity)
      slider.addEventListener('input', () => {
        under.opacity = Number(slider.value)
        drawEditor()
        save()
      })
      opacity.append(slider)
      inspectorBox.append(opacity)
      inspectorBox.append(button('枠に合わせる', () => {
        const bounds = boundsOf(design.outline.nodes.map((n) => ({ x: n.x, y: n.y })))
        const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 20) * 1.1
        snapshot()
        const ratio = under.height / under.width
        under.width = span
        under.height = span * ratio
        under.x = (bounds.minX + bounds.maxX) / 2 - under.width / 2
        under.y = (bounds.minY + bounds.maxY) / 2 - under.height / 2
        refresh()
      }))
      inspectorBox.append(button('下絵を外す', () => {
        snapshot()
        design.underlay = null
        refresh()
      }))
    }
    return
  }

  if (layer === 'detail' && detail) {
    const label = document.createElement('span')
    label.className = 'inspector-label'
    label.textContent = detail.kind === 'stroke' ? '選択中: 線' : '選択中: 面'
    inspectorBox.append(label)

    if (detail.kind === 'stroke') {
      const widthLabel = document.createElement('label')
      widthLabel.className = 'field inline'
      widthLabel.textContent = '線の幅 (mm)'
      const input = document.createElement('input')
      input.type = 'number'
      input.min = '0.4'
      input.max = '10'
      input.step = '0.1'
      input.value = String(detail.width)
      input.addEventListener('change', () => {
        snapshot()
        detail.width = Math.min(10, Math.max(0.4, Number(input.value) || 1.5))
        input.value = String(detail.width)
        refresh()
      })
      widthLabel.append(input)
      inspectorBox.append(widthLabel)
    }

    // 絵柄まるごとの切り替え。1点ずつと同じアイコンを使う。
    inspectorBox.append(tag('全体'))
    inspectorBox.append(nodeShapeGroup(wholePathState(detail.path), (state) => {
      snapshot()
      if (state === 'smooth') smoothAll(detail.path)
      else for (let i = 0; i < detail.path.nodes.length; i++) setNodeCorner(detail.path, i)
      refresh()
    }))

    inspectorBox.append(button('複製 (Ctrl+D)', () => {
      clipboard = copyOfDetail(detail, 0, 0)
      pasteDetail()
    }))
    inspectorBox.append(button('削除 (Del)', deleteSelectedDetail))
    // 点を選んでいれば、その1点だけの切り替えも出す。
    appendNodeShapeButtons()
    return
  }

  if (layer === 'detail') {
    const label = document.createElement('span')
    label.className = 'inspector-label'
    label.textContent = design.details.length
      ? '絵柄をクリックすると選べます'
      : '「線を描く」「面を描く」で絵柄を追加します'
    inspectorBox.append(label)
    return
  }

  const label = document.createElement('span')
  label.className = 'inspector-label'
  label.textContent = selection ? '選択中: 枠の点' : '枠の点をドラッグして形を整えます'
  inspectorBox.append(label)
  appendNodeShapeButtons()
}

const SHAPE_OPTIONS: { state: NodeState; text: string; hint: string }[] = [
  { state: 'smooth', text: '滑らか', hint: '前後がなめらかにつながります' },
  { state: 'corner', text: '角', hint: 'ここで尖ります。隣り合う2点を角にすると、その辺は直線になります' }
]

function tag(text: string) {
  const node = document.createElement('span')
  node.className = 'inspector-label'
  node.textContent = text
  return node
}

/** 滑らか／角のアイコン付きトグル。1点用と絵柄全体用で同じ見た目を使う。 */
function nodeShapeGroup(current: NodeState | null, onPick: (state: NodeState) => void) {
  const group = document.createElement('div')
  group.className = 'tool-tabs'
  for (const option of SHAPE_OPTIONS) {
    const item = document.createElement('button')
    item.className = `tool icon-tool${option.state === current ? ' active' : ''}`
    item.title = option.hint
    item.innerHTML = NODE_ICONS[option.state]
    item.append(Object.assign(document.createElement('span'), { textContent: option.text }))
    item.addEventListener('click', () => onPick(option.state))
    group.append(item)
  }
  return group
}

/** パス全体の状態。点によって違えば null（どちらも選ばれていない表示にする）。 */
function wholePathState(path: Path): NodeState | null {
  if (!path.nodes.length) return null
  const first = nodeState(path, 0)
  return path.nodes.every((_, i) => nodeState(path, i) === first) ? first : null
}

/** 選択中の1点だけを角／滑らかに切り替える。前後の点のハンドルは壊さない。 */
function appendNodeShapeButtons() {
  if (!selection) return
  const path = pathOf(selection.nodeId)
  if (!path) return
  const index = path.nodes.findIndex((n) => n.id === selection!.nodeId)
  if (index < 0) return

  const current = nodeState(path, index)
  inspectorBox.append(tag('この点'))
  inspectorBox.append(nodeShapeGroup(current, (state) => {
    snapshot()
    if (state === 'smooth') setNodeSmooth(path, index)
    else setNodeCorner(path, index)
    refresh()
  }))
  inspectorBox.append(tag(SHAPE_OPTIONS.find((o) => o.state === current)!.hint))
}

/**
 * 点の状態を形そのもので示すアイコン。言葉より見た目のほうが伝わる。
 * 線は currentColor なので、選択中は強調色になる。
 */
const NODE_ICONS: Record<NodeState, string> = {
  // 両側が曲線。点は丸。
  smooth: `<svg class="node-icon" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M2 16 C2 11 4.5 5.5 9 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M9 4.5 C13.5 5.5 16 11 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="9" cy="4.5" r="2.4" fill="#fff" stroke="currentColor" stroke-width="2"/>
  </svg>`,
  // 両側が直線。点は四角。
  corner: `<svg class="node-icon" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M2 16 L9 4.5 L16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="6.7" y="2.2" width="4.6" height="4.6" rx=".7" fill="#fff" stroke="currentColor" stroke-width="2"/>
  </svg>`
}

/* ---------- パラメータ ---------- */

type FieldSpec = { key: keyof Design['params']; label: string; min: number; max: number; step: number }

const FIELD_GROUPS: { title: string; color?: string; fields: FieldSpec[] }[] = [
  {
    title: '全体',
    fields: [
      { key: 'size', label: '大きさ 最長辺 (mm)', min: 10, max: 200, step: 1 },
      { key: 'nozzleWidth', label: 'ノズル幅 (mm)', min: 0.1, max: 1.2, step: 0.05 }
    ]
  },
  {
    title: '抜き枠', color: '#3aa6a0',
    fields: [
      { key: 'wallHeight', label: '壁の高さ (mm)', min: 3, max: 40, step: 0.5 },
      { key: 'wallThickness', label: '壁の厚み (mm)', min: 0.4, max: 4, step: 0.1 },
      { key: 'bladeThickness', label: '刃先の厚み (mm)', min: 0.2, max: 2, step: 0.1 },
      { key: 'bladeTaperHeight', label: '刃のテーパー高さ (mm)', min: 0, max: 10, step: 0.5 },
      { key: 'flangeWidth', label: 'ツバの幅 (mm)', min: 0, max: 15, step: 0.5 },
      { key: 'flangeHeight', label: 'ツバの厚み (mm)', min: 0.5, max: 10, step: 0.5 },
      { key: 'flangeSlope', label: 'ツバ裏の傾き (度)', min: 0, max: 80, step: 5 }
    ]
  },
  {
    title: '曲げの限界',
    fields: [
      { key: 'minAngle', label: '許容する最小の角度 (度)', min: 0, max: 90, step: 1 },
      { key: 'minBendRadius', label: '許容する最小の曲率半径 (mm)', min: 0, max: 10, step: 0.1 }
    ]
  },
  {
    title: 'スタンプ', color: '#e08fb4',
    fields: [
      { key: 'plateThickness', label: '板の厚み (mm)', min: 1, max: 10, step: 0.5 },
      { key: 'stampClearance', label: '枠との隙間 (mm)', min: 0.2, max: 3, step: 0.1 },
      { key: 'ribHeight', label: '凸リブの高さ (mm)', min: 0.3, max: 5, step: 0.1 },
      { key: 'ribDraft', label: '凸リブの抜き勾配 (度)', min: 0, max: 30, step: 1 },
      { key: 'detailThicken', label: '絵柄を太らせる (mm)', min: 0, max: 2, step: 0.1 }
    ]
  }
]

function numberField(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void) {
  const field = document.createElement('label')
  field.className = 'field'
  field.textContent = label
  const input = document.createElement('input')
  input.type = 'number'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  input.addEventListener('change', () => {
    const parsed = Number(input.value)
    if (!Number.isFinite(parsed)) { input.value = String(value); return }
    const clamped = Math.min(max, Math.max(min, parsed))
    input.value = String(clamped)
    onChange(clamped)
  })
  field.append(input)
  return field
}

function checkField(label: string, key: 'outlineRib' | 'mirrorStamp') {
  const field = document.createElement('label')
  field.className = 'check full'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = design.params[key]
  input.addEventListener('change', () => {
    snapshot()
    design.params[key] = input.checked
    refresh()
  })
  field.append(input, document.createTextNode(' ' + label))
  return field
}

function renderProperties() {
  const host = document.querySelector<HTMLDivElement>('#properties')!
  host.replaceChildren()
  for (const group of FIELD_GROUPS) {
    const title = document.createElement('div')
    title.className = 'group-title'
    title.textContent = group.title
    // 部品の色と対応させて、どの立体の設定かを一目で分かるようにする。
    if (group.color) title.style.setProperty('--group', group.color)
    host.append(title)
    for (const field of group.fields) {
      host.append(numberField(field.label, design.params[field.key] as number, field.min, field.max, field.step, (value) => {
        snapshot()
        ;(design.params[field.key] as number) = value
        refresh()
      }))
    }
    if (group.title === 'スタンプ') {
      host.append(checkField('外周リブを付ける', 'outlineRib'))
      host.append(checkField('絵柄を左右反転する（押すと正しい向きになる）', 'mirrorStamp'))
    }
  }

  const editTitle = document.createElement('div')
  editTitle.className = 'group-title'
  editTitle.textContent = '編集'
  host.append(editTitle)
  host.append(numberField('グリッド (mm)', design.grid, 1, 50, 1, (value) => {
    design.grid = value
    refresh()
  }))
  const snapLabel = document.createElement('label')
  snapLabel.className = 'check'
  const snapInput = document.createElement('input')
  snapInput.type = 'checkbox'
  snapInput.checked = design.snap
  snapInput.addEventListener('change', () => { design.snap = snapInput.checked })
  snapLabel.append(snapInput, document.createTextNode(' グリッドにスナップ'))
  host.append(snapLabel)
}

/* ---------- 検査 ---------- */

function inspect(): Issue[] {
  const issues: Issue[] = []
  problems = []
  const polygon = outlinePolygon(design)
  if (polygon.length < 3) {
    issues.push({ level: 'error', message: '枠の点が足りません。' })
    return issues
  }

  // 鋭すぎる角と小さすぎる曲率。刃が欠けやすく、将来ステンレスにするときも曲げられない。
  const found = outlineProblems(polygon, {
    minAngle: design.params.minAngle,
    minRadius: design.params.minBendRadius,
    window: 2
  })
  const back = toEditorSpace(design)
  if (back) problems = found.map((item) => ({ ...item, point: back(item.point) }))
  const sharp = found.filter((item) => item.kind === 'sharp')
  const tight = found.filter((item) => item.kind === 'tight')
  if (sharp.length) {
    issues.push({
      level: 'warn',
      message: `${design.params.minAngle}° より鋭い角が ${sharp.length} 箇所あります（最小 ${Math.round(Math.min(...sharp.map((s) => s.value)))}°）。刃が欠けやすく、ステンレスでは曲げられません。`
    })
  }
  if (tight.length) {
    issues.push({
      level: 'warn',
      message: `曲率半径 ${design.params.minBendRadius}mm より小さい箇所が ${tight.length} 箇所あります（最小 ${Math.min(...tight.map((t) => t.value)).toFixed(2)}mm）。`
    })
  }
  if (hasSelfIntersection(polygon)) {
    issues.push({ level: 'error', message: '枠の線が自分自身と交差しています。壁が正しく作れません。' })
  }
  const wall = effectiveWallThickness(design)
  if (Math.abs(wall - design.params.wallThickness) > 1e-6) {
    issues.push({
      level: 'warn',
      message: `壁の厚みを ${wall.toFixed(2)}mm に丸めました（ノズル幅 ${design.params.nozzleWidth}mm の整数倍）。半端な厚みは層に空隙ができて刃が割れます。`
    })
  }
  const neck = wall * 2 + 1.5
  if (narrowerThan(polygon, neck)) {
    issues.push({ level: 'warn', message: `${neck.toFixed(1)}mm より細いくびれがあります。壁どうしがぶつかって潰れる可能性があります。` })
  }
  if (!stampPlatePolygon(design)) {
    issues.push({ level: 'warn', message: '枠が細すぎて、スタンプの板が作れません。' })
  }

  // 絵柄が細すぎると、焼いたときに模様が消える。
  const minimum = Math.max(design.params.nozzleWidth * 3, 1.2)
  const thin = detailPolygons(design).filter((ring) => narrowerThan(ring, minimum)).length
  if (thin) {
    issues.push({
      level: 'warn',
      message: `${minimum.toFixed(1)}mm より細い絵柄が ${thin} 箇所あります。焼くと模様が消えます。「絵柄を太らせる」で一括して直せます。`
    })
  }
  return issues
}

function renderIssues(issues: Issue[]) {
  issuesBox.replaceChildren()
  if (!issues.length) {
    const row = document.createElement('div')
    row.className = 'issue ok'
    row.textContent = '✓ 問題は見つかりませんでした'
    issuesBox.append(row)
    return
  }
  for (const issue of issues) {
    const row = document.createElement('div')
    row.className = `issue ${issue.level}`
    row.textContent = `${issue.level === 'error' ? '✕' : '!'} ${issue.message}`
    issuesBox.append(row)
  }
}

/* ---------- 更新 ---------- */

const CUTTER_COLOR = '#3aa6a0'
const STAMP_COLOR = '#e08fb4'

function refresh() {
  // 検査を先に走らせる。印は drawEditor が描くので、順番を逆にすると1回ぶん古い印が残る。
  const issues = inspect()
  drawEditor()
  renderProperties()
  renderInspector()
  renderIssues(issues)

  // 「両方」は印刷するときと同じ並びで出す。スタンプは反転してあるので、
  // 枠に重ねて表示すると左右が食い違って見えてしまう。
  const parts: { mesh: Mesh; color: string }[] = []
  if (show === 'both') {
    const [cutter, stamp] = buildBoth(design)
    if (cutter) parts.push({ mesh: cutter, color: CUTTER_COLOR })
    if (stamp) parts.push({ mesh: stamp, color: STAMP_COLOR })
  } else if (show === 'cutter') {
    const mesh = buildCutter(design)
    if (mesh) parts.push({ mesh, color: CUTTER_COLOR })
  } else {
    const mesh = buildStamp(design)
    if (mesh) parts.push({ mesh, color: STAMP_COLOR })
  }
  preview.update(parts)

  const cutter = buildCutter(design)
  if (cutter) {
    const box = meshBounds(cutter)
    const triangles = parts.reduce((total, part) => total + part.mesh.triangles.length, 0)
    showStatus(
      `枠の外形 ${(box.maxX - box.minX).toFixed(1)} × ${(box.maxY - box.minY).toFixed(1)} mm / ` +
      `高さ ${(design.params.wallHeight + design.params.flangeHeight).toFixed(1)} mm / ` +
      `絵柄 ${design.details.length} 個 / 三角形 ${triangles.toLocaleString()}`
    )
  }
  save()
}

function showStatus(message: string, isError = false) {
  statusBar.textContent = message
  statusBar.classList.toggle('error', isError)
}

/* ---------- 保存・書き出し ---------- */

let storageWarned = false

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(design))
    storageWarned = false
  } catch {
    // 下絵の画像が大きいと入りきらないことがある。黙って消えるより伝えたほうがよい。
    if (!storageWarned) {
      storageWarned = true
      showStatus('自動保存できませんでした（下絵の画像が大きい可能性があります）。「保存」でJSONを書き出してください。', true)
    }
  }
}

function load(): Design | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Design
    if (parsed?.version !== 1 || !parsed.outline?.nodes?.length) return null
    parsed.details ??= []
    parsed.underlay ??= null
    parsed.params = { ...defaultParams(), ...parsed.params }
    return parsed
  } catch { return null }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const safeName = () => (design.name.trim() || 'cookie-cutter').replace(/[\\/:*?"<>|]/g, '_')

/* ---------- 書き出しメニュー ---------- */

type ExportItem = { label: string; note: string; color?: string; run: () => void }

function saveSvg(parts: { outline: boolean; details: boolean }, suffix: string, what: string) {
  const svgText = designSvg(design, parts)
  if (!svgText) { showStatus(`${what}が作れていません。`, true); return }
  downloadBlob(new Blob([svgText], { type: 'image/svg+xml' }), `${safeName()}${suffix}.svg`)
  showStatus(`${what}のSVGを書き出しました（実寸1:1）。`)
}

const EXPORT_GROUPS: { title: string; items: ExportItem[] }[] = [
  {
    title: '3Dプリント用（STL）',
    items: [
      {
        label: '両方まとめて',
        note: '枠とスタンプを並べた1ファイル。ふつうはこれを選びます。',
        run: () => {
          const meshes = buildBoth(design)
          if (!meshes.length) { showStatus('形が作れていません。', true); return }
          downloadBlob(createStlBlob(meshes), `${safeName()}.stl`)
          showStatus(`${meshes.length === 2 ? '枠とスタンプを並べた' : '枠の'}STLを書き出しました。`)
        }
      },
      {
        label: '枠だけ',
        note: '刃を下にして印刷してください。',
        color: '#3aa6a0',
        run: () => {
          const mesh = buildCutter(design)
          if (!mesh) { showStatus('枠が作れていません。', true); return }
          downloadBlob(createStlBlob([mesh]), `${safeName()}_枠.stl`)
          showStatus('抜き枠のSTLを書き出しました。')
        }
      },
      {
        label: 'スタンプだけ',
        note: '模様の面を上にして印刷してください。',
        color: '#e08fb4',
        run: () => {
          const mesh = buildStamp(design)
          if (!mesh) { showStatus('スタンプが作れていません。枠が細すぎる可能性があります。', true); return }
          downloadBlob(createStlBlob([mesh]), `${safeName()}_スタンプ.stl`)
          showStatus('スタンプのSTLを書き出しました。')
        }
      }
    ]
  },
  {
    title: '設計図（SVG）',
    items: [
      {
        label: 'すべて',
        note: '輪郭と絵柄。実寸1:1の線データ。',
        run: () => saveSvg({ outline: true, details: true }, '', '設計図')
      },
      {
        label: '枠の輪郭だけ',
        note: '閉じた1本の線。型を作り直したい人向け。',
        color: '#2767ae',
        run: () => saveSvg({ outline: true, details: false }, '_枠', '輪郭')
      },
      {
        label: '絵柄だけ',
        note: '模様の線と面。別の型に使い回せます。',
        color: '#c2508a',
        run: () => saveSvg({ outline: false, details: true }, '_絵柄', '絵柄')
      }
    ]
  }
]

/* ---------- 使う前の注意 ---------- */

const noticeDialog = document.querySelector<HTMLDialogElement>('#notice-dialog')!
document.querySelector('#open-notice')!.addEventListener('click', () => noticeDialog.showModal())
document.querySelector('#close-notice')!.addEventListener('click', () => noticeDialog.close())
// 背景をクリックしても閉じる。
noticeDialog.addEventListener('click', (event) => {
  if (event.target === noticeDialog) noticeDialog.close()
})

const exportButton = document.querySelector<HTMLButtonElement>('#export-button')!
const exportPanel = document.querySelector<HTMLDivElement>('#export-panel')!

for (const group of EXPORT_GROUPS) {
  const heading = document.createElement('div')
  heading.className = 'menu-heading'
  heading.textContent = group.title
  exportPanel.append(heading)
  for (const item of group.items) {
    const entry = document.createElement('button')
    entry.className = 'menu-item'
    entry.setAttribute('role', 'menuitem')
    const mark = document.createElement('span')
    mark.className = item.color ? 'chip' : 'chip blank'
    if (item.color) mark.style.setProperty('--c', item.color)
    const text = document.createElement('span')
    text.append(
      Object.assign(document.createElement('strong'), { textContent: item.label }),
      Object.assign(document.createElement('small'), { textContent: item.note })
    )
    entry.append(mark, text)
    entry.addEventListener('click', () => {
      closeExportMenu()
      item.run()
    })
    exportPanel.append(entry)
  }
}

function openExportMenu() {
  exportPanel.hidden = false
  exportButton.setAttribute('aria-expanded', 'true')
  // 開いた後に付ける。今回のクリックで即座に閉じてしまわないように。
  setTimeout(() => document.addEventListener('pointerdown', onOutsidePointer), 0)
}

function closeExportMenu() {
  exportPanel.hidden = true
  exportButton.setAttribute('aria-expanded', 'false')
  document.removeEventListener('pointerdown', onOutsidePointer)
}

function onOutsidePointer(event: PointerEvent) {
  if (!(event.target instanceof Node)) return
  if (!document.querySelector('#export-menu')!.contains(event.target)) closeExportMenu()
}

exportButton.addEventListener('click', () => {
  if (exportPanel.hidden) openExportMenu()
  else closeExportMenu()
})

addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !exportPanel.hidden) closeExportMenu()
})

function saveJson() {
  downloadBlob(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), `${safeName()}.json`)
  showStatus('デザインをJSONで保存しました。')
}

document.querySelector('#save-json')!.addEventListener('click', saveJson)

const fileInput = document.querySelector<HTMLInputElement>('#json-file')!
document.querySelector('#load-json')!.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0]
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text()) as Design
    if (parsed?.version !== 1 || !parsed.outline?.nodes?.length) throw new Error('形式が違います')
    parsed.details ??= []
    snapshot()
    design = parsed
    selection = null
    selectedDetailId = null
    nameInput.value = design.name
    fitView()
    refresh()
    showStatus(`${file.name} を読み込みました。`)
  } catch (error) {
    showStatus(error instanceof Error ? error.message : '読み込みに失敗しました。', true)
  }
  fileInput.value = ''
})

const imageInput = document.querySelector<HTMLInputElement>('#image-file')!
imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0]
  if (file) {
    try { await loadUnderlay(file) }
    catch (error) { showStatus(error instanceof Error ? error.message : '画像を読み込めませんでした。', true) }
  }
  imageInput.value = ''
})

// キャンバスに直接ドロップしても読み込めるようにする。
svg.addEventListener('dragover', (event) => { event.preventDefault() })
svg.addEventListener('drop', async (event) => {
  event.preventDefault()
  const file = [...(event.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (!file) return
  try { await loadUnderlay(file) }
  catch (error) { showStatus(error instanceof Error ? error.message : '画像を読み込めませんでした。', true) }
})

const nameInput = document.querySelector<HTMLInputElement>('#project-name')!
nameInput.value = design.name
nameInput.addEventListener('input', () => { design.name = nameInput.value; save() })

/* ---------- 起動 ---------- */

syncLayerTabs()
fitView()
refresh()
preview.setView('home')
