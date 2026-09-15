import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Mesh } from './types'

export type CameraView = 'home' | 'top' | 'front'

export type PreviewPart = { mesh: Mesh; color: string }

export class Preview3D {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000)
  private controls: OrbitControls
  private model = new THREE.Group()
  private span = 100
  private lastView: CameraView = 'home'
  /** 一度でも自分で視点を動かしたら、こちらから勝手に戻さない。 */
  private userMoved = false

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    host.append(this.renderer.domElement)
    this.scene.background = new THREE.Color('#f4f6fa')
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7a8699', 2.4))
    const key = new THREE.DirectionalLight('#ffffff', 2.6)
    key.position.set(120, 180, 220)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight('#ffffff', 0.8)
    fill.position.set(-160, -60, 90)
    this.scene.add(fill)
    this.scene.add(this.model)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.addEventListener('change', () => this.render())
    this.controls.addEventListener('start', () => { this.userMoved = true })
    new ResizeObserver(() => this.resize()).observe(host)
    this.resize()
    this.animate()
  }

  update(parts: PreviewPart[]) {
    this.model.clear()
    let span = 60
    for (const part of parts) {
      if (!part.mesh.triangles.length) continue
      const material = new THREE.MeshStandardMaterial({
        color: part.color,
        roughness: 0.45,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
      this.model.add(new THREE.Mesh(toGeometry(part.mesh), material))
      for (const [x, y] of part.mesh.positions) span = Math.max(span, Math.abs(x) * 2, Math.abs(y) * 2)
    }
    this.span = span
    const grid = new THREE.GridHelper(Math.ceil(span / 10) * 20, Math.ceil(span / 10) * 2, '#c3cddb', '#dde4ee')
    // 3D表示は上方向がY、書き出しは上方向がZ。モデル側を寝かせて向きを合わせる。
    grid.position.y = 0
    this.scene.remove(this.scene.getObjectByName('grid') as THREE.Object3D)
    grid.name = 'grid'
    this.scene.add(grid)
    this.model.rotation.x = -Math.PI / 2
    this.render()
  }

  setView(view: CameraView) {
    this.lastView = view
    this.userMoved = false
    // 縦長・横長どちらのペインでもはみ出さないよう、狭いほうの画角に合わせて引く。
    const vertical = (this.camera.fov * Math.PI) / 180
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect)
    const size = (this.span * 0.62) / Math.tan(Math.min(vertical, horizontal) / 2)
    this.controls.target.set(0, this.span * 0.12, 0)
    if (view === 'top') this.camera.position.set(0, size, 0.01)
    else if (view === 'front') this.camera.position.set(0, this.span * 0.2, size)
    else this.camera.position.set(size * 0.52, size * 0.5, size * 0.68)
    this.controls.update()
    this.render()
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth)
    const height = Math.max(1, this.host.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // 初回描画はレイアウト確定前に走ることがある。まだ触られていなければ距離を取り直す。
    if (!this.userMoved) this.setView(this.lastView)
    else this.render()
  }

  private animate = () => {
    requestAnimationFrame(this.animate)
    if (this.controls.update()) this.render()
  }

  private render() {
    this.renderer.render(this.scene, this.camera)
  }
}

function toGeometry(mesh: Mesh) {
  const positions = new Float32Array(mesh.positions.length * 3)
  mesh.positions.forEach((point, index) => positions.set(point, index * 3))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(mesh.triangles.flat())
  geometry.computeVertexNormals()
  return geometry
}
