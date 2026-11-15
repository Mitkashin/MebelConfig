'use client';

import { Edges, Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import * as THREE from 'three';
import { getDecor, HANDLE_FINISHES } from '@/engine/catalog';
import { isGrained } from '@/engine/cutlist';
import type { Axis, Config, HandlePlacement, Part, Vec3 } from '@/engine/types';
import { rowColor } from '@/lib/format';

const MM = 0.001;
const HDF_COLOR = '#b9a88e';
const DEG = Math.PI / 180;

export interface SceneProps {
  config: Config;
  parts: Part[];
  handles: HandlePlacement[];
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
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/**
 * One shared material per colour, grain axis and highlight. Grain is drawn
 * procedurally in object space, so it follows the part and needs no texture
 * files: narrow bands across the two axes perpendicular to the grain.
 */
function partMaterial(color: string, grain: Axis | null, highlight: string | null): THREE.MeshStandardMaterial {
  const key = `${color}|${grain}|${highlight}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
  if (highlight) {
    material.emissive = new THREE.Color(highlight);
    material.emissiveIntensity = 0.6;
  }
  if (grain !== null) {
    const names = ['x', 'y', 'z'];
    const [a, b] = [0, 1, 2].filter((k) => k !== grain) as [number, number];
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nfloat grainHash(float n){ return fract(sin(n * 127.1) * 43758.5453); }')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float gu = vLocal.${names[a]} * 0.21 + vLocal.${names[b]} * 0.17;
          float gb = floor(gu);
          float gn = mix(grainHash(gb), grainHash(gb + 1.0), smoothstep(0.0, 1.0, fract(gu)));
          float gs = sin(vLocal.${names[grain]} * 0.011 + gn * 6.2831) * 0.5 + 0.5;
          diffuseColor.rgb *= 0.9 + 0.13 * gn + 0.03 * gs;`,
        );
    };
    material.customProgramCacheKey = () => `grain-${grain}`;
  }
  materials.set(key, material);
  return material;
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

function explodeOffset(part: Part, count: number): Vec3 {
  const spread = part.element === null ? 0 : (part.element - (count - 1) / 2) * 170;
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
    const offset: Vec3 = p.exploded ? explodeOffset(lead, n) : [0, 0, 0];
    if (lead.role === 'door') {
      const [x, y, z] = lead.position;
      const [w] = lead.size;
      if (lead.hinge === 'bottom') {
        mover.pivot = [x, y, z];
        mover.rotation = [open ? 90 * DEG : 0, 0];
      } else if (lead.hinge === 'right') {
        mover.pivot = [x + w, y, z];
        mover.rotation = [0, open ? 100 * DEG : 0];
      } else {
        mover.pivot = [x, y, z];
        mover.rotation = [0, open ? -100 * DEG : 0];
      }
    } else if (lead.role === 'drawerFront' && open) {
      const box = mover.parts.find((x) => x.role === 'drawerBottom');
      offset[2] += Math.round((box?.size[2] ?? 300) * 0.7);
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

function PartMesh({ part, highlight, onSelect }: { part: Part; highlight: string | null; onSelect: (id: string) => void }) {
  const decor = part.decor ? getDecor(part.decor) : undefined;
  const color = part.material === 'hdf' ? HDF_COLOR : (decor?.color ?? '#cccccc');
  const material = partMaterial(color, isGrained(part) ? part.lengthAxis : null, highlight);
  const [x, y, z] = part.position;
  const [sx, sy, sz] = part.size;
  return (
    <mesh
      position={[x + sx / 2, y + sy / 2, z + sz / 2]}
      material={material}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect(part.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <boxGeometry args={[sx, sy, sz]} />
      <Edges threshold={15} color={highlight ?? '#1b2422'} transparent opacity={highlight ? 0.9 : 0.22} />
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
};

const FOV = 32;

/** Point the camera at the piece from `direction` (or keep the current direction) at a distance that fits it. */
function frameCamera(camera: THREE.Camera, c: Controls | null, target: THREE.Vector3, fit: number, reset: boolean) {
  let direction: THREE.Vector3;
  if (reset || !c) {
    const azimuth = 28 * DEG;
    const polar = 76 * DEG;
    direction = new THREE.Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth));
  } else {
    direction = camera.position.clone().sub(c.target).normalize();
  }
  camera.position.copy(target).addScaledVector(direction, fit);
  camera.lookAt(target);
  if (c) {
    c.target.copy(target);
    c.minDistance = fit * 0.45;
    c.maxDistance = fit * 2.2;
    c.update();
  }
}

/** Frames the piece: keeps the viewing direction when the size changes, restores the default view on reset. */
function CameraRig({ config, mountHeight, resetKey, controls }: Pick<SceneProps, 'config' | 'mountHeight' | 'resetKey'> & { controls: React.RefObject<Controls | null> }) {
  const get = useThree((s) => s.get);
  const size = useThree((s) => s.size);
  const lastReset = useRef(-1);
  const { width, height, depth } = config;

  useEffect(() => {
    const target = new THREE.Vector3(0, (mountHeight + height / 2) * MM, (depth / 2) * MM);
    const radius = 0.5 * Math.hypot(width, height, depth) * MM;
    const aspect = size.width / Math.max(1, size.height);
    const fit = (radius / Math.sin((FOV * DEG) / 2)) * (aspect < 1 ? 1.15 / aspect : 1.15);
    const reset = lastReset.current !== resetKey;
    lastReset.current = resetKey;
    const state = get();
    frameCamera(state.camera, controls.current, target, fit, reset);
    state.invalidate();
  }, [width, height, depth, mountHeight, resetKey, size.width, size.height, get, controls]);
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
  const { config, parts, handles, mountHeight, selected, rowNoByPart, onSelect } = props;
  const controls = useRef<Controls | null>(null);
  const movers = useMemo(
    () => buildMovers({ parts, handles, config, doorsOpen: props.doorsOpen, toggled: props.toggled, exploded: props.exploded }),
    [parts, handles, config, props.doorsOpen, props.toggled, props.exploded],
  );
  const handleColor = HANDLE_FINISHES[config.handleFinish];
  const lowPower = typeof window !== 'undefined' && window.innerWidth < 768;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const c = controls.current;
    if (!c) return;
    const turn = 12 * DEG;
    if (e.key === 'ArrowLeft') c.setAzimuthalAngle(c.getAzimuthalAngle() - turn);
    else if (e.key === 'ArrowRight') c.setAzimuthalAngle(c.getAzimuthalAngle() + turn);
    else if (e.key === 'ArrowUp') c.setPolarAngle(c.getPolarAngle() - turn / 2);
    else if (e.key === 'ArrowDown') c.setPolarAngle(c.getPolarAngle() + turn / 2);
    else return;
    e.preventDefault();
    c.update();
  };

  return (
    <div className="size-full touch-none outline-offset-[-2px]" role="img" aria-label={props.ariaLabel} tabIndex={0} onKeyDown={onKeyDown}>
      <Boundary fallback={props.fallback}>
        <Canvas
          shadows
          frameloop="demand"
          dpr={[1, lowPower ? 1.5 : 2]}
          camera={{ fov: FOV, near: 0.05, far: 60, position: [1.6, 1.2, 3.6] }}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
          onPointerMissed={() => onSelect(null)}
        >
          <color attach="background" args={['#ecebe6']} />
          <hemisphereLight args={['#ffffff', '#b9b3a6', 1.15]} />
          <directionalLight
            position={[2.4, 4.2, 3.4]}
            intensity={1.9}
            castShadow
            shadow-mapSize={lowPower ? [1024, 1024] : [2048, 2048]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
            shadow-camera-left={-3}
            shadow-camera-right={3}
            shadow-camera-top={3.5}
            shadow-camera-bottom={-1}
            shadow-camera-far={14}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#d6cfc1" roughness={0.95} />
          </mesh>
          <mesh position={[0, 6, -0.004]} receiveShadow>
            <planeGeometry args={[30, 12]} />
            <meshStandardMaterial color="#efede8" roughness={1} />
          </mesh>
          <group position={[(-config.width / 2) * MM, mountHeight * MM, 0]} scale={MM}>
            {movers.map((spec) => (
              <Mover key={spec.id} spec={spec}>
                {spec.parts.map((part) => {
                  const no = rowNoByPart[part.id];
                  return <PartMesh key={part.id} part={part} highlight={selected.includes(part.id) && no ? rowColor(no) : null} onSelect={onSelect} />;
                })}
                {spec.handles.map((h) => (
                  <HandleMesh key={h.id} handle={h} color={handleColor} />
                ))}
              </Mover>
            ))}
            {props.showDimensions && <Dimensions config={config} labels={props.labels} />}
          </group>
          <OrbitControls
            ref={controls as never}
            makeDefault
            enablePan={false}
            enableDamping={false}
            minPolarAngle={18 * DEG}
            maxPolarAngle={100 * DEG}
            minAzimuthAngle={-80 * DEG}
            maxAzimuthAngle={80 * DEG}
          />
          <CameraRig config={config} mountHeight={mountHeight} resetKey={props.resetKey} controls={controls} />
          <Ready onReady={props.onReady} />
        </Canvas>
      </Boundary>
    </div>
  );
}
