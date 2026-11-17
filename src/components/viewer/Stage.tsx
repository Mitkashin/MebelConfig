'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { useFrame, useThree } from '@react-three/fiber';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WALL_COLORS, type Backdrop, type WallColor } from '@/store/scene';

/**
 * Everything around the piece: image-based studio light, the key light that
 * casts shadows, the floor contact shadow, the backdrop (studio or room) and,
 * on desktop, ambient occlusion. Units are metres; the piece stands with its
 * back on z = 0 and its bottom on y = mountHeight.
 */

export interface StageProps {
  backdrop: Backdrop;
  wall: WallColor;
  /** Piece size in metres and how high its bottom hangs. */
  width: number;
  height: number;
  depth: number;
  mountHeight: number;
  exploded: boolean;
  /**
   * high: desktop GPU, everything on. medium: phones, no post-processing.
   * low: WebGL without a GPU, also no contact shadow and a small shadow map.
   */
  quality: Quality;
}

export type Quality = 'high' | 'medium' | 'low';

const STUDIO_TONE = '#ece8e1';
const SKIRTING_COLOR = '#f5f4f0';
/** Skirting board: 80 mm high, 15 mm thick. The piece stands against its face (z = 0). */
const SKIRTING = { height: 0.08, thickness: 0.015 };
/**
 * Render layer of the backdrop. The camera sees it; the contact-shadow camera
 * and pointer picking (layer 0 only) do not, so the wall corner never shows up
 * as a shadow and clicks on the background still clear the selection.
 */
export const BACKDROP_LAYER = 1;

/** Puts a backdrop object and its children on the backdrop layer only. */
function onBackdropLayer(object: THREE.Object3D | null) {
  object?.traverse((o) => o.layers.set(BACKDROP_LAYER));
}

// ---------------------------------------------------------------- lighting

/**
 * Soft studio light, rendered once into an environment map: a large softbox
 * above, strip lights at the sides, a weak fill from the front. In the room it
 * becomes warmer and a window on the left takes over.
 */
function StudioEnvironment({ backdrop }: { backdrop: Backdrop }) {
  const room = backdrop === 'room';
  return (
    <Environment resolution={256} frames={1} environmentIntensity={room ? 0.85 : 0.95}>
      <color attach="background" args={[room ? '#5e5650' : '#5a5856']} />
      {/* overhead softbox */}
      <Lightformer form="rect" intensity={room ? 1.6 : 2.4} color="#ffffff" position={[0, 6, 1.5]} scale={[8, 5, 1]} />
      {/* side strips, the left one stronger */}
      <Lightformer form="rect" intensity={room ? 5 : 2.2} color={room ? '#fff6ea' : '#ffffff'} position={[-5, 2, 2.5]} scale={room ? [3, 4, 1] : [1.2, 5, 1]} />
      <Lightformer form="rect" intensity={room ? 0.6 : 1.3} color={room ? '#e8eef8' : '#ffffff'} position={[5, 2, 2.5]} scale={[1.2, 5, 1]} />
      {/* front fill and a floor bounce */}
      <Lightformer form="rect" intensity={0.7} color="#ffffff" position={[0, 1.5, 7]} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={0.5} color={room ? '#e3d6c4' : '#f1ece4'} position={[0, -3, 2]} scale={[10, 10, 1]} />
      {/* In the free scene the back is on show too: a soft light behind and one each side of it. */}
      {backdrop === 'free' && (
        <>
          <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[0, 2, -6]} scale={[8, 4, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[-5, 1.5, -3]} scale={[1.2, 5, 1]} />
          <Lightformer form="rect" intensity={0.8} color="#ffffff" position={[5, 1.5, -3]} scale={[1.2, 5, 1]} />
        </>
      )}
    </Environment>
  );
}

/** Key light from the upper left, with a soft shadow fitted around the piece. */
function KeyLight({ backdrop, width, height, mountHeight, exploded, quality }: StageProps) {
  const lowPower = quality !== 'high';
  const light = useRef<THREE.DirectionalLight>(null);
  const invalidate = useThree((s) => s.invalidate);
  const room = backdrop === 'room';
  const top = mountHeight + height;
  const half = Math.max(width, top) / 2 + (exploded ? 1.2 : 0.8);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.5;
    cam.far = 16;
    cam.updateProjectionMatrix();
    l.target.position.set(0, top / 2, 0.2);
    l.target.updateMatrixWorld();
    l.shadow.needsUpdate = true;
    invalidate();
  }, [half, top, invalidate]);

  return (
    <directionalLight
      ref={light}
      position={room ? [-3.6, 3.4 + top / 2, 3.2] : [-2.6, 3.8 + top / 2, 3.6]}
      intensity={room ? 2.4 : 1.9}
      color={room ? '#fff8f0' : '#ffffff'}
      castShadow
      shadow-mapSize={quality === 'low' ? [512, 512] : lowPower ? [1024, 1024] : [2048, 2048]}
      shadow-radius={lowPower ? 4 : 7}
      shadow-intensity={room ? 0.85 : 0.75}
      shadow-bias={-0.0002}
      shadow-normalBias={0.008}
    />
  );
}

// ---------------------------------------------------------------- backdrops

/**
 * A strip of surface following a profile in the (z, y) plane, extruded along x.
 * Vertex colours carry a gentle light falloff so the backdrop has no flat look.
 */
function profileGeometry(profile: [number, number][], halfWidth: number, shade: (z: number, y: number) => number) {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  profile.forEach(([z, y]) => {
    const c = shade(z, y);
    for (const x of [-halfWidth, halfWidth]) {
      positions.push(x, y, z);
      colors.push(c, c, c);
    }
  });
  for (let i = 0; i < profile.length - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geometry.setIndex(index);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Photo-studio backdrop: floor and wall in one warm tone, so the corner reads as
 * a soft change of light rather than a line. (A rounded cove would look nicer
 * still, but pieces stand with their back on the wall and would cut into it.)
 */
function StudioBackdrop() {
  const geometry = useMemo(() => {
    const profile: [number, number][] = [];
    for (let z = 14; z > 0; z -= z > 3 ? 1 : 0.25) profile.push([z, 0]);
    for (let y = 0; y < 12; y += y < 3 ? 0.25 : 1) profile.push([0, y]);
    profile.push([0, 12]);
    // Slightly darker high on the wall and far towards the viewer, like light falling off from a softbox.
    return profileGeometry(profile, 15, (z, y) => 1 - 0.14 * smooth(1.2, 5, y) - 0.08 * smooth(2.5, 9, z));
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh ref={onBackdropLayer} geometry={geometry} receiveShadow>
      <meshStandardMaterial color={STUDIO_TONE} vertexColors roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Light oak planks drawn once into a canvas: 180 mm boards with staggered joints and a faint grain. */
function plankTexture(): THREE.CanvasTexture {
  const px = 1024;
  const metres = 1.08; // six boards across, so the texture tiles seamlessly
  const boards = 6;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const bw = px / boards;
  for (let b = 0; b < boards; b++) {
    const x0 = b * bw;
    // Two joints per column, at different heights per board.
    const joint = rand() * px;
    const pieces: [number, number][] = [[joint - px, joint], [joint, joint + px]];
    for (const [y0, y1] of pieces) {
      const tint = 0.9 + rand() * 0.16;
      const r = Math.round(196 * tint);
      const gg = Math.round(170 * tint);
      const bl = Math.round(136 * tint);
      g.fillStyle = `rgb(${r},${gg},${bl})`;
      g.fillRect(x0, y0, bw, y1 - y0);
      g.fillRect(x0, y0 + px, bw, y1 - y0);
      g.fillRect(x0, y0 - px, bw, y1 - y0);
      // grain: long, slightly wavy strokes along the board
      for (let k = 0; k < 26; k++) {
        const gx = x0 + 3 + rand() * (bw - 6);
        const dark = rand() < 0.5;
        g.strokeStyle = dark ? `rgba(110,78,45,${0.05 + rand() * 0.1})` : `rgba(255,236,205,${0.04 + rand() * 0.08})`;
        g.lineWidth = 0.6 + rand() * 1.6;
        g.beginPath();
        const amp = 1 + rand() * 3;
        const phase = rand() * 10;
        for (let y = 0; y <= px; y += 16) {
          const xx = gx + Math.sin(y / 90 + phase) * amp;
          if (y === 0) g.moveTo(xx, y);
          else g.lineTo(xx, y);
        }
        g.stroke();
      }
      // joint
      g.fillStyle = 'rgba(70,50,30,0.55)';
      g.fillRect(x0, ((y1 % px) + px) % px - 1, bw, 2);
    }
    // long edge between boards
    g.fillStyle = 'rgba(70,50,30,0.5)';
    g.fillRect(x0, 0, 1.5, px);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.repeat.set(30 / metres, 30 / metres);
  return texture;
}

/** A room corner: painted wall, white skirting board, oak floor. */
function RoomBackdrop({ wall }: { wall: WallColor }) {
  const floor = useMemo(() => plankTexture(), []);
  useEffect(() => () => floor.dispose(), [floor]);
  const back = -SKIRTING.thickness;
  return (
    <group ref={onBackdropLayer}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 15 + back]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial map={floor} roughness={0.5} envMapIntensity={0.8} />
      </mesh>
      <mesh position={[0, 6, back]} receiveShadow>
        <planeGeometry args={[30, 12]} />
        <meshStandardMaterial color={WALL_COLORS[wall]} roughness={0.92} />
      </mesh>
      <mesh position={[0, SKIRTING.height / 2, back + SKIRTING.thickness / 2]} receiveShadow castShadow>
        <boxGeometry args={[30, SKIRTING.height, SKIRTING.thickness]} />
        <meshStandardMaterial color={SKIRTING_COLOR} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Gradient "sky" around the free scene: light above, a soft warm grey below the horizon. */
function freeSkyGeometry() {
  const geometry = new THREE.SphereGeometry(25, 48, 24);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const top = new THREE.Color('#f6f4f0');
  const horizon = new THREE.Color('#e9e5de');
  const bottom = new THREE.Color('#cfc9bf');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 25; // -1 … 1
    if (h >= 0) c.copy(horizon).lerp(top, smooth(0, 0.6, h));
    else c.copy(horizon).lerp(bottom, smooth(0, 0.5, -h));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * No wall, no floor: a gradient all round and an invisible ground that only
 * shows the shadow, so the piece can be turned the whole way round and seen
 * from slightly below.
 */
function FreeBackdrop() {
  const sky = useMemo(() => freeSkyGeometry(), []);
  useEffect(() => () => sky.dispose(), [sky]);
  return (
    <group ref={onBackdropLayer}>
      <mesh geometry={sky}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[12, 64]} />
        <shadowMaterial transparent opacity={0.22} color="#2a221b" />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- effects

/** Ambient occlusion and a faint vignette; desktop only. Tone mapping moves into the effect chain. */
function Effects() {
  // The effect composer switches the renderer's auto-clear off. The contact
  // shadow renders into its own target before the composer and needs it on,
  // or every frame of a door swing stays in the shadow.
  useFrame(({ gl }) => {
    gl.autoClear = true;
  }, -1);
  return (
    <EffectComposer multisampling={4}>
      <N8AO halfRes quality="medium" aoRadius={0.14} distanceFalloff={0.5} intensity={3.2} color="#1e1a16" />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.32} />
    </EffectComposer>
  );
}

// ---------------------------------------------------------------- stage

export function Stage(props: StageProps) {
  const { backdrop, wall, width, depth, mountHeight, exploded, quality } = props;
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.layers.enable(BACKDROP_LAYER);
  }, [camera]);
  // Against a wall the shadow only reaches forward; in the free scene it surrounds the piece.
  const reach = depth + (exploded ? 1.2 : 0.8) + (backdrop === 'free' ? 0.8 : 0);
  const shadowZ = backdrop === 'free' ? depth / 2 + (exploded ? 0.2 : 0) : reach / 2;
  return (
    <>
      {/* Without a GPU an environment-map lookup per pixel is too slow; a plain sky light stands in. */}
      {quality !== 'low' && <StudioEnvironment backdrop={backdrop} />}
      <hemisphereLight args={['#ffffff', backdrop === 'room' ? '#b89c78' : '#d9d2c6', quality === 'low' ? 2.1 : 0.35]} />
      <KeyLight {...props} />
      {backdrop === 'room' ? <RoomBackdrop wall={wall} /> : backdrop === 'free' ? <FreeBackdrop /> : <StudioBackdrop />}
      {mountHeight === 0 && quality !== 'low' && (
        <ContactShadows
          position={[0, 0.0015, shadowZ]}
          scale={[width + 1.4, reach]}
          resolution={quality === 'high' ? 512 : 256}
          blur={2.2}
          far={0.5}
          opacity={backdrop === 'room' ? 0.5 : 0.6}
          color="#2a221b"
        />
      )}
      {quality === 'high' && <Effects />}
    </>
  );
}
