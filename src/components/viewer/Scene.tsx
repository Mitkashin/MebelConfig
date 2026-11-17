'use client';

import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, createContext, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { decorFinish, getDecor, HANDLE_FINISHES, type DecorFinish } from '@/engine/catalog';
import type { Config, Fitting, HandlePlacement, Part, Vec3 } from '@/engine/types';
import { rowColor } from '@/lib/format';
import type { Backdrop, WallColor } from '@/store/scene';
import { Stage, type Quality } from './Stage';

const MM = 0.001;
const HDF_COLOR = '#b9a88e';
const DEG = Math.PI / 180;
const HOVER_COLOR = '#0f6b5c';
const HDF_FINISH: DecorFinish = { roughness: 0.85, relief: 0, sheen: 0 };

export interface SceneProps {
  config: Config;
  parts: Part[];
  handles: HandlePlacement[];
  fittings: Fitting[];
  mountHeight: number;
  doorsOpen: boolean;
  /** Fronts opened or closed individually by clicking them. */
  toggled: string[];
  exploded: boolean;
  showDimensions: boolean;
  selected: string[];
  rowNoByPart: Record<string, number>;
  resetKey: number;
  ariaLabel: string;
  /** Formatted texts for the dimension labels. */
  labels: { width: string; height: string; depth: string; elements: string[] };
  onSelect: (partId: string | null) => void;
  onReady: () => void;
  backdrop: Backdrop;
  wall: WallColor;
  /** Filled by the scene with a function that renders a sharp still and returns it as a PNG data URL. */
  captureRef?: RefObject<(() => Promise<string>) | null>;
  /** Turntable in the free scene. */
  spin: boolean;
  /** Opacity of the boards when they are shown see-through (exploded view), or null for solid. */
  seeThrough: number | null;
}

/** Glass door look, passed down rather than through every part. */
const GlassContext = createContext<{ frame: string; tint: string }>({ frame: '#1e1f21', tint: 'clear' });

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
/** See-through board materials; they all share one opacity, set from the viewer's slider. */
const seeThroughMaterials = new Set<THREE.Material>();
let seeThroughOpacity = 0.4;
function setSeeThroughOpacity(opacity: number) {
  seeThroughOpacity = opacity;
  for (const m of seeThroughMaterials) m.opacity = opacity;
}

/** One shared texture per decor image, loaded the first time a part uses it. */
function decorTexture(url: string, onLoad: () => void): THREE.Texture {
  let texture = textures.get(url);
  if (!texture) {
    texture = loader.load(url, onLoad);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Mirrored repeats hide the seams of swatch photos that were not made to tile.
    texture.wrapS = THREE.MirroredRepeatWrapping;
    texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.anisotropy = 8;
    textures.set(url, texture);
  }
  return texture;
}

/** Relief from the swatch photo is kept faint: it should read as grain and pores, not as carving. */
const RELIEF_SCALE = 1.2;

/**
 * One shared material per decor, finish and highlight. The colour is the swatch
 * average, shown until the photo arrives. The finish (from the supplier's
 * structure code) sets how matt the board is, a soft sheen for super-matt
 * surfaces, and grain relief taken from the photo itself.
 */
function partMaterial(color: string, image: string | null, finish: DecorFinish, highlight: string | null, simple: boolean, onLoad: () => void, seeThrough = false): THREE.MeshStandardMaterial {
  const key = `${color}|${image}|${finish.roughness}|${finish.relief}|${finish.sheen}|${highlight}|${simple}|${seeThrough}`;
  const cached = materials.get(key);
  if (cached) return cached;
  // Without a GPU every extra shader feature costs whole seconds, so the simple tier keeps one plain material type.
  const material = simple
    ? new THREE.MeshStandardMaterial({ color, roughness: finish.roughness, metalness: 0 })
    : new THREE.MeshPhysicalMaterial({
        color,
        roughness: finish.roughness,
        metalness: 0,
        // Melamine is a thin resin layer: a faint, broad reflection on top of the print.
        specularIntensity: 0.55,
        sheen: finish.sheen,
        sheenRoughness: 0.8,
        sheenColor: new THREE.Color('#ffffff'),
      });
  const applyTexture = (texture: THREE.Texture) => {
    material.color.set('#ffffff');
    material.map = texture;
    if (finish.relief > 0 && !simple) {
      material.bumpMap = texture;
      material.bumpScale = finish.relief * RELIEF_SCALE;
    }
  };
  if (image) {
    const texture = decorTexture(image, () => {
      applyTexture(texture);
      material.needsUpdate = true;
      onLoad();
    });
    if (texture.image) applyTexture(texture);
  }
  if (highlight) {
    material.emissive = new THREE.Color(highlight);
    material.emissiveIntensity = 0.55;
  }
  if (seeThrough) {
    // No depth writes, so boards behind a see-through board still show.
    material.transparent = true;
    material.opacity = seeThroughOpacity;
    material.depthWrite = false;
    seeThroughMaterials.add(material);
  }
  materials.set(key, material);
  return material;
}

/** Small, stable offset per part so neighbouring panels do not show the same piece of the photo. */
function partOffset(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return [((h >>> 0) % 997) / 997, ((h >>> 10) % 991) / 991];
}

/**
 * Box with texture coordinates in real-world units: one swatch image covers
 * `tile` mm, and the image's vertical axis (the grain in the supplier photos)
 * runs along the part's length, the same direction the cut list uses.
 */
function partGeometry(part: Part, tile: number): THREE.BoxGeometry {
  const [sx, sy, sz] = part.size;
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const [ou, ov] = partOffset(part.id);
  for (let i = 0; i < pos.count; i++) {
    const n = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))];
    const faceAxis = n.indexOf(Math.max(...n));
    const inPlane = [0, 1, 2].filter((k) => k !== faceAxis);
    // Grain (v) follows the part's length when that axis lies in this face; on the end faces it follows the longer side.
    const v = inPlane.includes(part.lengthAxis) ? part.lengthAxis : (inPlane[1] as number);
    const u = inPlane.find((k) => k !== v) as number;
    const p = [pos.getX(i) + sx / 2, pos.getY(i) + sy / 2, pos.getZ(i) + sz / 2];
    uv.setXY(i, (p[u] as number) / tile + ou, (p[v] as number) / tile + ov);
  }
  uv.needsUpdate = true;
  return geometry;
}

const metal = new Map<string, THREE.MeshStandardMaterial>();
function handleMaterial(color: string) {
  let m = metal.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.65 });
    metal.set(color, m);
  }
  return m;
}

interface MoverSpec {
  id: string;
  parts: Part[];
  handles: HandlePlacement[];
  offset: Vec3;
  pivot: Vec3;
  rotation: [number, number];
}

function explodeOffset(part: Part, count: number, cellsInColumn: number): Vec3 {
  const spread = part.element === null ? 0 : (part.element - (count - 1) / 2) * 170;
  if (part.cell !== undefined) {
    // Wardrobe compartments also move apart vertically, so stacked carcasses separate.
    const lift = (cellsInColumn - 1 - part.cell) * 150;
    const role = part.role === 'top' ? [0, 60, 0] : part.role === 'bottom' ? [0, -60, 0] : part.role === 'side' ? [part.id.endsWith('L') ? -75 : 75, 0, 0] : part.role === 'shelf' ? [0, 0, 160] : part.role === 'back' ? [0, 0, -200] : [0, 0, 320];
    return [spread + (role[0] as number), lift + (role[1] as number), role[2] as number];
  }
  switch (part.role) {
    case 'top':
      return [0, part.id === 'top' ? 280 : 160, 0];
    case 'bottom':
      return [spread, -150, 0];
    case 'side':
      return [spread + (part.id.endsWith('L') ? -75 : 75), 0, 0];
    case 'rail':
      return [spread, 80, part.id.endsWith('F') ? 70 : -70];
    case 'shelf':
      return [spread, 0, 180];
    case 'back':
      return [spread, 0, -220];
    case 'plinth': {
      // The base drops below the carcass and opens out: front forward, back backward, ends outward.
      const side = (part.id.split('.')[1] ?? '').replace(/\d+$/, '');
      const [dx, dz] = side === 'front' ? [0, 160] : side === 'back' ? [0, -160] : side === 'left' ? [-160, 0] : side === 'right' ? [160, 0] : [0, 0];
      return [dx, -280, dz];
    }
    default:
      return [spread, 0, 340];
  }
}

function buildMovers(p: Pick<SceneProps, 'parts' | 'handles' | 'config' | 'doorsOpen' | 'toggled' | 'exploded'>): MoverSpec[] {
  const moverOf = (part: Part) => (part.role === 'door' ? part.id : (part.group ?? part.id));
  const byId = new Map<string, MoverSpec>();
  const partById = new Map(p.parts.map((x) => [x.id, x]));
  const n = p.config.elements.length;
  for (const part of p.parts) {
    const id = moverOf(part);
    let mover = byId.get(id);
    if (!mover) {
      mover = { id, parts: [], handles: [], offset: [0, 0, 0], pivot: [0, 0, 0], rotation: [0, 0] };
      byId.set(id, mover);
    }
    mover.parts.push(part);
  }
  for (const handle of p.handles) {
    const front = partById.get(handle.frontId);
    if (front) byId.get(moverOf(front))?.handles.push(handle);
  }
  for (const mover of byId.values()) {
    const lead = mover.parts.find((x) => x.role === 'door' || x.role === 'drawerFront') ?? (mover.parts[0] as Part);
    const movable = lead.role === 'door' || lead.role === 'drawerFront';
    const open = movable && !p.exploded && p.doorsOpen !== p.toggled.includes(mover.id);
    // Everything also steps away from the wall, so the backs stay visible in front of it.
    const cells = lead.element === null ? 1 : (p.config.elements[lead.element]?.cells.length ?? 1);
    const offset: Vec3 = p.exploded ? (explodeOffset(lead, n, cells).map((v, k) => (k === 2 ? v + 280 : v)) as Vec3) : [0, 0, 0];
    if (lead.role === 'door') {
      const [x, y, z] = lead.position;
      const [w, , d] = lead.size;
      const facing = lead.facing ?? 'front';
      if (lead.hinge === 'bottom') {
        mover.pivot = [x, y, z];
        mover.rotation = [open ? 90 * DEG : 0, 0];
      } else {
        // Pivot on the vertical edge on the hinge side (as seen from in front of the door), at its inner face.
        const left = lead.hinge !== 'right';
        if (facing === 'left') mover.pivot = [x + w, y, left ? z : z + d];
        else if (facing === 'right') mover.pivot = [x, y, left ? z + d : z];
        else mover.pivot = [left ? x : x + w, y, z];
        // Turned doors stop at 90° so a door hinged on the wall side does not swing into the wall.
        const angle = facing === 'front' ? 100 : 90;
        mover.rotation = [0, open ? (left ? -angle : angle) * DEG : 0];
      }
    } else if (lead.role === 'drawerFront' && open) {
      const box = mover.parts.find((x) => x.role === 'drawerBottom');
      const pull = Math.round(Math.max(...(box?.size ?? [300, 0, 300])) * 0.7);
      if (lead.facing === 'left') offset[0] -= pull;
      else if (lead.facing === 'right') offset[0] += pull;
      else offset[2] += pull;
    }
    mover.offset = offset;
  }
  return [...byId.values()];
}

function Mover({ spec, children }: { spec: MoverSpec; children: ReactNode }) {
  const outer = useRef<THREE.Group>(null);
  const hinge = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const { offset, rotation } = spec;

  useEffect(() => invalidate(), [offset, rotation, invalidate]);

  useFrame((_, dt) => {
    const o = outer.current;
    const h = hinge.current;
    if (!o || !h) return;
    const step = Math.min(dt, 0.05);
    const targets: [THREE.Vector3 | THREE.Euler, 'x' | 'y' | 'z', number][] = [
      [o.position, 'x', offset[0]],
      [o.position, 'y', offset[1]],
      [o.position, 'z', offset[2]],
      [h.rotation, 'x', rotation[0]],
      [h.rotation, 'y', rotation[1]],
    ];
    let moving = false;
    for (const [object, key, target] of targets) {
      const current = object[key];
      if (Math.abs(current - target) < 1e-3) {
        object[key] = target;
        continue;
      }
      object[key] = THREE.MathUtils.damp(current, target, 8, step);
      moving = true;
    }
    if (moving) invalidate();
  });

  return (
    <group ref={outer}>
      <group ref={hinge} position={spec.pivot}>
        <group position={[-spec.pivot[0], -spec.pivot[1], -spec.pivot[2]]}>{children}</group>
      </group>
    </group>
  );
}

const glassMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
function glassMaterial(tint: string): THREE.MeshPhysicalMaterial {
  let m = glassMaterials.get(tint);
  if (!m) {
    const look = tint === 'dark' ? { color: '#3a4044', opacity: 0.72 } : tint === 'light' ? { color: '#9aa3a6', opacity: 0.45 } : { color: '#dfe9ea', opacity: 0.22 };
    m = new THREE.MeshPhysicalMaterial({ color: look.color, transparent: true, opacity: look.opacity, roughness: 0.08, metalness: 0, depthWrite: false });
    glassMaterials.set(tint, m);
  }
  return m;
}

/** Glass door: a tinted pane in a 20 mm aluminium frame. */
function GlassDoor({ part, highlight, onSelect }: { part: Part; highlight: string | null; seeThrough?: boolean; onSelect: (id: string) => void }) {
  const tint = useContext(GlassContext);
  const [x, y, z] = part.position;
  const [sx, sy, sz] = part.size;
  const frame = 20;
  const vertical = part.facing ? 2 : 0;
  const along = part.size[vertical];
  const bars: { pos: Vec3; size: Vec3 }[] = [
    { pos: [0, sy / 2 - frame / 2, 0], size: vertical === 0 ? [sx, frame, sz] : [sx, frame, sz] },
    { pos: [0, -sy / 2 + frame / 2, 0], size: [sx, frame, sz] },
    { pos: vertical === 0 ? [-sx / 2 + frame / 2, 0, 0] : [0, 0, -sz / 2 + frame / 2], size: vertical === 0 ? [frame, sy, sz] : [sx, sy, frame] },
    { pos: vertical === 0 ? [sx / 2 - frame / 2, 0, 0] : [0, 0, sz / 2 - frame / 2], size: vertical === 0 ? [frame, sy, sz] : [sx, sy, frame] },
  ];
  const paneSize: Vec3 = vertical === 0 ? [sx - 2 * frame, sy - 2 * frame, 4] : [4, sy - 2 * frame, along - 2 * frame];
  return (
    <group position={[x + sx / 2, y + sy / 2, z + sz / 2]} onClick={(e) => { e.stopPropagation(); onSelect(part.id); }}>
      {bars.map((b, j) => (
        <mesh key={j} position={b.pos} material={handleMaterial(highlight ?? tint.frame)} castShadow>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
      <mesh material={glassMaterial(tint.tint)}>
        <boxGeometry args={paneSize} />
      </mesh>
    </group>
  );
}

function PartMesh(props: { part: Part; highlight: string | null; simple: boolean; seeThrough: boolean; onSelect: (id: string) => void }) {
  return props.part.material === 'glass' ? <GlassDoor {...props} /> : <BoardMesh {...props} />;
}

function BoardMesh({ part, highlight, simple, seeThrough, onSelect }: { part: Part; highlight: string | null; simple: boolean; seeThrough: boolean; onSelect: (id: string) => void }) {
  const invalidate = useThree((st) => st.invalidate);
  const decor = part.decor ? getDecor(part.decor) : undefined;
  const color = part.material === 'hdf' ? HDF_COLOR : (decor?.color ?? '#cccccc');
  const finish = part.material === 'hdf' ? HDF_FINISH : decorFinish(decor);
  const material = partMaterial(color, part.material === 'hdf' ? null : (decor?.image ?? null), finish, highlight, simple, invalidate, seeThrough);
  const tile = decor?.tile ?? 600;
  const geometry = useMemo(() => partGeometry(part, tile), [part, tile]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Hover outline: shows which board a click will pick. Kept per part so only that part re-renders.
  const [hover, setHover] = useState(false);
  const [x, y, z] = part.position;
  const [sx, sy, sz] = part.size;
  return (
    <mesh
      position={[x + sx / 2, y + sy / 2, z + sz / 2]}
      geometry={geometry}
      material={material}
      castShadow={!seeThrough}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect(part.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {/* See-through boards keep stronger outlines, so their shape still reads. */}
      <Edges threshold={15} color={highlight ?? (hover ? HOVER_COLOR : '#1b2422')} transparent opacity={highlight ? 0.9 : hover ? 0.85 : seeThrough ? 0.45 : 0.07} />
    </mesh>
  );
}

function HandleMesh({ handle, color }: { handle: HandlePlacement; color: string }) {
  const [x, y, z] = handle.position;
  const [sx, sy, sz] = handle.size;
  const center: Vec3 = [x + sx / 2, y + sy / 2, z + sz / 2];
  if (handle.shape === 'knob') {
    return (
      <mesh position={center} rotation={[Math.PI / 2, 0, 0]} material={handleMaterial(color)} castShadow>
        <cylinderGeometry args={[sx / 2, sx / 2.6, sz, 24]} />
      </mesh>
    );
  }
  return (
    <mesh position={center} material={handleMaterial(color)} castShadow>
      <boxGeometry args={[sx, sy, sz]} />
    </mesh>
  );
}

function FittingMesh({ fitting, color }: { fitting: Fitting; color: string }) {
  const [x, y, z] = fitting.position;
  const [sx, sy, sz] = fitting.size;
  const center: Vec3 = [x + sx / 2, y + sy / 2, z + sz / 2];
  if (fitting.kind === 'rail') {
    return (
      <mesh position={center} rotation={[0, 0, Math.PI / 2]} material={handleMaterial('#c5c8cc')} castShadow>
        <cylinderGeometry args={[sy / 2, sy / 2, sx, 20]} />
      </mesh>
    );
  }
  return (
    <mesh position={center} material={handleMaterial(color)} castShadow>
      <cylinderGeometry args={[sx / 2, sx / 2.8, sy, 20]} />
    </mesh>
  );
}

function DimensionLine({ from, to, text, tick }: { from: Vec3; to: Vec3; text: string; tick: Vec3 }) {
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const ends = [from, to].map((p): [Vec3, Vec3] => [
    [p[0] - tick[0], p[1] - tick[1], p[2] - tick[2]],
    [p[0] + tick[0], p[1] + tick[1], p[2] + tick[2]],
  ]);
  return (
    <group>
      <Line points={[from, to]} color="#0f6b5c" lineWidth={1.5} />
      {ends.map((pts, i) => (
        <Line key={i} points={pts} color="#0f6b5c" lineWidth={1.5} />
      ))}
      <Html position={mid} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white shadow" data-testid="dimension-label">
          {text}
        </span>
      </Html>
    </group>
  );
}

function Dimensions({ config, labels }: Pick<SceneProps, 'config' | 'labels'>) {
  const { width: W, height: H, depth: D } = config;
  const gap = 70;
  let x = 0;
  return (
    <group>
      <DimensionLine from={[0, H + gap, D]} to={[W, H + gap, D]} text={labels.width} tick={[0, 22, 0]} />
      <DimensionLine from={[W + gap, 0, D]} to={[W + gap, H, D]} text={labels.height} tick={[22, 0, 0]} />
      <DimensionLine from={[W + gap, H, 0]} to={[W + gap, H, D]} text={labels.depth} tick={[22, 0, 0]} />
      {config.elements.length > 1 &&
        config.elements.map((el, i) => {
          const from = x;
          x += el.width;
          return <DimensionLine key={i} from={[from, -gap, D]} to={[x, -gap, D]} text={labels.elements[i] ?? ''} tick={[0, 18, 0]} />;
        })}
    </group>
  );
}

type Controls = {
  target: THREE.Vector3;
  update: () => void;
  getAzimuthalAngle: () => number;
  getPolarAngle: () => number;
  setAzimuthalAngle: (angle: number) => void;
  setPolarAngle: (angle: number) => void;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  addEventListener: (type: 'start' | 'end' | 'change', listener: () => void) => void;
  removeEventListener: (type: 'start' | 'end' | 'change', listener: () => void) => void;
};

const FOV = 32;
const DEFAULT_AZIMUTH = 28 * DEG;
const DEFAULT_POLAR = 76 * DEG;

/** Where the camera may go. Against a wall it stays in front; in the free scene it goes all the way round and a little below. */
function orbitLimits(free: boolean, fit: number) {
  return free
    ? { minPolar: 5 * DEG, maxPolar: 112 * DEG, minAzimuth: -Infinity, maxAzimuth: Infinity, minDistance: fit * 0.45, maxDistance: fit * 2.6 }
    : { minPolar: 18 * DEG, maxPolar: 100 * DEG, minAzimuth: -80 * DEG, maxAzimuth: 80 * DEG, minDistance: fit * 0.45, maxDistance: fit * 2.2 };
}
type Limits = ReturnType<typeof orbitLimits>;

function applyLimits(c: Controls, l: Limits | null) {
  c.minPolarAngle = l ? l.minPolar : 0;
  c.maxPolarAngle = l ? l.maxPolar : Math.PI;
  c.minAzimuthAngle = l ? l.minAzimuth : -Infinity;
  c.maxAzimuthAngle = l ? l.maxAzimuth : Infinity;
  c.minDistance = l ? l.minDistance : 0;
  c.maxDistance = l ? l.maxDistance : Infinity;
}

interface View {
  target: THREE.Vector3;
  radius: number;
  polar: number;
  azimuth: number;
}

/** Camera position for a view: azimuth 0 looks at the front, positive turns to the right. */
function placeCamera(camera: THREE.Camera, c: Controls | null, v: View) {
  const sp = Math.sin(v.polar);
  camera.position.set(v.target.x + v.radius * sp * Math.sin(v.azimuth), v.target.y + v.radius * Math.cos(v.polar), v.target.z + v.radius * sp * Math.cos(v.azimuth));
  camera.lookAt(v.target);
  if (c) c.target.copy(v.target);
}

function currentView(camera: THREE.Camera, target: THREE.Vector3): View {
  const offset = camera.position.clone().sub(target);
  const radius = Math.max(1e-3, offset.length());
  return { target: target.clone(), radius, polar: Math.acos(THREE.MathUtils.clamp(offset.y / radius, -1, 1)), azimuth: Math.atan2(offset.x, offset.z) };
}

/** Shortest signed turn from angle a to angle b. */
function turn(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Frames the piece. Keeps the viewing direction when the size changes and
 * returns to the default view on reset or when the scene changes. Moves glide
 * (in angles, so the camera swings round the piece rather than through it);
 * the first framing, reduced-motion users and a grab by the user are instant.
 */
function CameraRig({ config, mountHeight, resetKey, exploded, doorsOpen, free, spin, controls, nudgeRef }: Pick<SceneProps, 'config' | 'mountHeight' | 'resetKey' | 'exploded' | 'doorsOpen'> & { free: boolean; spin: boolean; controls: React.RefObject<Controls | null>; nudgeRef: RefObject<((azimuth: number, polar: number) => void) | null> }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const lastReset = useRef(-1);
  const lastFree = useRef(free);
  const first = useRef(true);
  const goal = useRef<{ view: View; limits: Limits } | null>(null);
  const limits = useRef<Limits | null>(null);
  const { width, height, depth } = config;

  useEffect(() => {
    const target = new THREE.Vector3(0, (mountHeight + height / 2) * MM, (depth / 2) * MM);
    const radius = 0.5 * Math.hypot(width, height, depth) * MM;
    const aspect = size.width / Math.max(1, size.height);
    const fit = (radius / Math.sin((FOV * DEG) / 2)) * (aspect < 1 ? 1.15 / aspect : 1.15) * (exploded ? 1.5 : doorsOpen ? 1.22 : 1);
    const reset = lastReset.current !== resetKey || lastFree.current !== free;
    lastReset.current = resetKey;
    lastFree.current = free;
    const state = get();
    const c = controls.current;
    const from = currentView(state.camera, c?.target ?? target);
    const view: View = { target, radius: fit, polar: reset ? DEFAULT_POLAR : from.polar, azimuth: reset ? DEFAULT_AZIMUTH : from.azimuth };
    const nextLimits = orbitLimits(free, fit);
    limits.current = nextLimits;
    if (first.current || !c || reducedMotion()) {
      first.current = false;
      goal.current = null;
      placeCamera(state.camera, c, view);
      if (c) {
        applyLimits(c, nextLimits);
        c.update();
      }
    } else {
      // Free the camera while it glides; the limits come back when it arrives.
      goal.current = { view, limits: nextLimits };
      applyLimits(c, null);
    }
    state.invalidate();
  }, [width, height, depth, mountHeight, resetKey, exploded, doorsOpen, free, size.width, size.height, get, controls]);

  // Arrow keys: glide a step from where the camera is heading, within the scene's limits.
  useEffect(() => {
    nudgeRef.current = (dAzimuth, dPolar) => {
      const state = get();
      const c = controls.current;
      const l = limits.current;
      if (!c || !l) return;
      const base = goal.current?.view ?? currentView(state.camera, c.target);
      const azimuth = THREE.MathUtils.clamp(base.azimuth + dAzimuth, l.minAzimuth, l.maxAzimuth);
      const polar = THREE.MathUtils.clamp(base.polar + dPolar, l.minPolar, l.maxPolar);
      const view: View = { ...base, target: base.target.clone(), azimuth, polar };
      if (reducedMotion()) {
        placeCamera(state.camera, c, view);
        c.update();
      } else {
        goal.current = { view, limits: l };
        applyLimits(c, null);
      }
      state.invalidate();
    };
    return () => {
      nudgeRef.current = null;
    };
  }, [nudgeRef, controls, get]);

  // A grab by the user ends a glide where it is.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const onStart = () => {
      if (!goal.current) return;
      goal.current = null;
      applyLimits(c, limits.current);
    };
    c.addEventListener('start', onStart);
    return () => c.removeEventListener('start', onStart);
  }, [controls]);

  // Turntable (switched on the controls themselves): it needs a frame every frame while on, starting now.
  useEffect(() => {
    if (free && spin) get().invalidate();
  }, [free, spin, get]);

  useFrame((state, dt) => {
    const c = controls.current;
    if (c?.autoRotate) state.invalidate();
    const g = goal.current;
    if (!g || !c) return;
    const step = Math.min(dt, 0.05);
    const from = currentView(state.camera, c.target);
    const k = 1 - Math.exp(-7 * step);
    const view: View = {
      target: from.target.lerp(g.view.target, k),
      radius: THREE.MathUtils.lerp(from.radius, g.view.radius, k),
      polar: THREE.MathUtils.lerp(from.polar, g.view.polar, k),
      azimuth: from.azimuth + turn(from.azimuth, g.view.azimuth) * k,
    };
    const done =
      view.target.distanceTo(g.view.target) < 1e-3 &&
      Math.abs(view.radius - g.view.radius) < 1e-3 &&
      Math.abs(view.polar - g.view.polar) < 1e-3 &&
      Math.abs(turn(view.azimuth, g.view.azimuth)) < 1e-3;
    placeCamera(state.camera, c, done ? g.view : view);
    if (done) {
      goal.current = null;
      applyLimits(c, g.limits);
      c.update();
    }
    state.invalidate();
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current) {
      done.current = true;
      onReady();
    }
  });
  return null;
}

let softwareCache: boolean | null = null;

/**
 * True when WebGL is emulated on the CPU (SwiftShader, llvmpipe, Microsoft
 * Basic Render Driver …). Checked once with a throwaway context before the
 * scene mounts, so the first frame is already drawn at the right quality.
 */
function softwareRendering(): boolean {
  if (softwareCache !== null) return softwareCache;
  softwareCache = false;
  try {
    const context = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (context) {
      const info = context.getExtension('WEBGL_debug_renderer_info');
      const name = String(context.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : context.RENDERER));
      softwareCache = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
      context.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // keep the default
  }
  return softwareCache;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Registers the still-image renderer: raise the pixel ratio (through the
 * canvas's own `dpr` prop, which would otherwise reset it on the next React
 * render), wait until the renderer has resized and drawn, read the pixels back,
 * then return to the normal ratio.
 */
function Capture({ captureRef, setBoost }: { captureRef: RefObject<(() => Promise<string>) | null>; setBoost: (dpr: number | null) => void }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    captureRef.current = async () => {
      const target = Math.min(3, Math.max(2, get().viewport.dpr * 1.5));
      setBoost(target);
      try {
        for (let i = 0; i < 60 && get().gl.getPixelRatio() !== target; i++) await nextFrame();
        // Two more drawn frames so shadows and the effect buffers catch up with the new size.
        for (let i = 0; i < 2; i++) {
          get().invalidate();
          await nextFrame();
        }
        return get().gl.domElement.toDataURL('image/png');
      } finally {
        setBoost(null);
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef, get, setBoost]);
  return null;
}

/** Applies the slider's opacity to every see-through board and redraws. */
function SeeThroughOpacity({ value }: { value: number | null }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (value === null) return;
    setSeeThroughOpacity(value);
    invalidate();
  }, [value, invalidate]);
  return null;
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Scene(props: SceneProps & { fallback: ReactNode }) {
  const { config, parts, handles, selected, rowNoByPart, onSelect } = props;
  const free = props.backdrop === 'free';
  // With no wall to hang on, a wall piece is shown standing on the ground.
  const mountHeight = free ? 0 : props.mountHeight;
  const controls = useRef<Controls | null>(null);
  const movers = useMemo(() => {
    const list = buildMovers({ parts, handles, config, doorsOpen: props.doorsOpen, toggled: props.toggled, exploded: props.exploded });
    if (!props.exploded) return list;
    // Lift the exploded piece so the parts that move down (bottoms, plinth) stay above the floor.
    const lowest = Math.min(...list.flatMap((m) => m.parts.map((x) => x.position[1] + m.offset[1])));
    const lift = Math.max(0, -(lowest + mountHeight));
    return lift > 0 ? list.map((m) => ({ ...m, offset: [m.offset[0], m.offset[1] + lift, m.offset[2]] as Vec3 })) : list;
  }, [parts, handles, config, props.doorsOpen, props.toggled, props.exploded, mountHeight]);
  const handleColor = HANDLE_FINISHES[config.handleFinish];
  // Lighter rendering on phones and where WebGL runs without a GPU (remote desktops, VMs, CI).
  // `?quality=high|medium|low` in the address overrides the guess.
  const software = useMemo(() => softwareRendering(), []);
  const quality = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('quality') : null;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 768;
  const tier: Quality = quality === 'high' || quality === 'medium' || quality === 'low' ? quality : software ? 'low' : narrow ? 'medium' : 'high';
  const lowPower = tier !== 'high';
  /** Temporary pixel ratio while a still image is being rendered. */
  const [boost, setBoost] = useState<number | null>(null);

  const nudge = useRef<((azimuth: number, polar: number) => void) | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 12 * DEG;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step / 2], ArrowDown: [0, step / 2] };
    const m = move[e.key];
    if (!m || !nudge.current) return;
    e.preventDefault();
    nudge.current(m[0], m[1]);
  };

  return (
    <div className="size-full touch-none outline-offset-[-2px]" role="img" aria-label={props.ariaLabel} tabIndex={0} onKeyDown={onKeyDown}>
      <Boundary fallback={props.fallback}>
        <Canvas
          shadows="percentage"
          frameloop="demand"
          dpr={boost ?? (tier === 'low' ? 1 : [1, lowPower ? 1.5 : 2])}
          camera={{ fov: FOV, near: 0.05, far: 60, position: [1.6, 1.2, 3.6] }}
          gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1 }}
          onPointerMissed={() => onSelect(null)}
        >
          <color attach="background" args={['#ece8e1']} />
          <Stage
            backdrop={props.backdrop}
            wall={props.wall}
            width={config.width * MM}
            height={config.height * MM}
            depth={config.depth * MM}
            mountHeight={mountHeight * MM}
            exploded={props.exploded}
            quality={tier}
          />
          <GlassContext.Provider value={{ frame: config.glassFrame === 'white' ? '#eeeeec' : '#1e1f21', tint: config.glassTint }}>
          <group position={[(-config.width / 2) * MM, mountHeight * MM, 0]} scale={MM}>
            {movers.map((spec) => (
              <Mover key={spec.id} spec={spec}>
                {spec.parts.map((part) => {
                  const no = rowNoByPart[part.id];
                  return <PartMesh key={part.id} part={part} highlight={selected.includes(part.id) && no ? rowColor(no) : null} simple={tier === 'low'} seeThrough={props.seeThrough !== null} onSelect={onSelect} />;
                })}
                {spec.handles.map((h) => (
                  <HandleMesh key={h.id} handle={h} color={handleColor} />
                ))}
              </Mover>
            ))}
            {props.fittings.map((f) => (
              <FittingMesh key={f.id} fitting={f} color={HANDLE_FINISHES[config.legFinish]} />
            ))}
            {props.showDimensions && <Dimensions config={config} labels={props.labels} />}
          </group>
          </GlassContext.Provider>
          {/* Orbit limits are set by CameraRig: they change with the scene and are lifted while the camera glides. */}
          <OrbitControls ref={controls as never} makeDefault enablePan={false} enableDamping dampingFactor={0.12} rotateSpeed={0.8} autoRotate={free && props.spin} autoRotateSpeed={1.2} />
          <CameraRig config={config} mountHeight={mountHeight} resetKey={props.resetKey} exploded={props.exploded} doorsOpen={props.doorsOpen} free={free} spin={props.spin} controls={controls} nudgeRef={nudge} />
          <Ready onReady={props.onReady} />
          <SeeThroughOpacity value={props.seeThrough} />
          {props.captureRef && <Capture captureRef={props.captureRef} setBoost={setBoost} />}
        </Canvas>
      </Boundary>
    </div>
  );
}
