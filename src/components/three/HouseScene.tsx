"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import type { Plan, Point } from "@/lib/plan-core";
import { ROOM_TYPE_INFO, bbox, centroid, edges, outwardNormal, signedArea } from "@/lib/plan-core";
import { buildScene, type MatKey, type Prim } from "@/lib/three/scene";

export type Colors = Partial<Record<MatKey, { color: string; roughness?: number }>>;

const FIXED: Record<MatKey, { color: string; roughness: number; opacity?: number; metalness?: number }> = {
  floor: { color: "#d9d4ca", roughness: 0.6 },
  floor_outdoor: { color: "#b9b6ae", roughness: 0.9 },
  ext_wall: { color: "#f4f2ec", roughness: 0.9 },
  int_wall: { color: "#fafaf7", roughness: 0.9 },
  roof: { color: "#4b4f54", roughness: 0.85 },
  roof_slab: { color: "#d4d2cc", roughness: 0.9 },
  glass: { color: "#9fc6dd", roughness: 0.05, opacity: 0.35, metalness: 0.1 },
  window_frame: { color: "#f2f2f2", roughness: 0.4 },
  door: { color: "#e9e1d3", roughness: 0.7 },
  water: { color: "#3ba3d8", roughness: 0.1, opacity: 0.85 },
  railing: { color: "#555a60", roughness: 0.4, metalness: 0.5 },
};

function useMaterials(colors: Colors) {
  const mats = useMemo(() => {
    const out = {} as Record<MatKey, THREE.MeshStandardMaterial>;
    (Object.keys(FIXED) as MatKey[]).forEach((k) => {
      const f = FIXED[k];
      out[k] = new THREE.MeshStandardMaterial({
        color: f.color,
        roughness: f.roughness,
        metalness: f.metalness ?? 0,
        transparent: f.opacity !== undefined,
        opacity: f.opacity ?? 1,
        side: k === "roof" || k === "ext_wall" ? THREE.DoubleSide : THREE.FrontSide,
      });
    });
    return out;
  }, []);
  // update colours in place so changing a material does not rebuild geometry
  useEffect(() => {
    (Object.keys(colors) as MatKey[]).forEach((k) => {
      const c = colors[k];
      if (!c) return;
      mats[k].color.set(c.color);
      if (c.roughness !== undefined) mats[k].roughness = c.roughness;
    });
  }, [colors, mats]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

function MeshPrimitive({ prim, material }: { prim: Extract<Prim, { kind: "mesh" }>; material: THREE.Material }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(prim.positions, 3));
    g.setIndex(prim.indices);
    g.computeVertexNormals();
    return g;
  }, [prim]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <mesh geometry={geom} material={material} castShadow receiveShadow />;
}

function Building({ plan, colors, showLevel }: { plan: Plan; colors: Colors; showLevel: number | "all" }) {
  const scene = useMemo(() => buildScene(plan), [plan]);
  const mats = useMaterials(colors);
  const visible = scene.prims.filter((p) => (showLevel === "all" ? true : p.level <= showLevel && !p.roof));
  const [ox, oy] = plan.building.origin;
  return (
    <group position={[ox, 0, -oy]} rotation={[0, (plan.building.rotationDeg * Math.PI) / 180, 0]}>
      {visible.map((p, i) =>
        p.kind === "box" ? (
          <mesh key={i} position={p.center} material={mats[p.mat]} castShadow={p.mat !== "glass"} receiveShadow>
            <boxGeometry args={p.size} />
          </mesh>
        ) : (
          <MeshPrimitive key={i} prim={p} material={mats[p.mat]} />
        ),
      )}
    </group>
  );
}

function shapeFrom(points: Point[]) {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

function Site({ plan }: { plan: Plan }) {
  const { plot, roads } = useMemo(() => {
    const b = plan.site.boundary;
    const ccw = signedArea(b) >= 0;
    const roads = plan.site.roads.flatMap((r) => {
      const e = edges(b)[r.edgeIndex];
      if (!e) return [];
      const n0 = outwardNormal(e);
      const n: Point = ccw ? n0 : [-n0[0], -n0[1]];
      return [shapeFrom([e[0], e[1], [e[1][0] + n[0] * r.widthM, e[1][1] + n[1] * r.widthM], [e[0][0] + n[0] * r.widthM, e[0][1] + n[1] * r.widthM]])];
    });
    return { plot: shapeFrom(b), roads };
  }, [plan.site]);
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0, -0.02]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#9fb88a" roughness={1} />
      </mesh>
      <mesh position={[0, 0, -0.01]} receiveShadow>
        <shapeGeometry args={[plot]} />
        <meshStandardMaterial color="#b7cc98" roughness={1} />
      </mesh>
      {roads.map((s, i) => (
        <mesh key={i} position={[0, 0, -0.005]} receiveShadow>
          <shapeGeometry args={[s]} />
          <meshStandardMaterial color="#8d8f92" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** First-person walking: click to lock the mouse, WASD/arrows to move, Esc to release. */
function Walker({ start }: { start: THREE.Vector3 }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    camera.position.copy(start);
    camera.lookAt(start.x, start.y, start.z - 5);
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [camera, start]);
  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.ShiftLeft ? 4 : 2) * dt;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(fwd, speed);
    if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(fwd, -speed);
    if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(right, speed);
    if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(right, -speed);
  });
  // only clicks on the 3D view start walking — otherwise every sidebar click would grab the mouse
  return <PointerLockControls selector="#house-3d canvas" />;
}

export interface HouseSceneProps {
  plan: Plan;
  colors: Colors;
  mode: "orbit" | "walk";
  showLevel: number | "all";
  /** Called with the canvas once rendered (used later for quotation snapshots). */
  onCanvas?: (canvas: HTMLCanvasElement) => void;
}

export default function HouseScene({ plan, colors, mode, showLevel, onCanvas }: HouseSceneProps) {
  const { center, radius, walkStart } = useMemo(() => {
    const s = buildScene(plan);
    const [ox, oy] = plan.building.origin;
    const c = new THREE.Vector3((s.bounds.min[0] + s.bounds.max[0]) / 2 + ox, (s.bounds.max[1]) / 3, (s.bounds.min[2] + s.bounds.max[2]) / 2 - oy);
    const r = Math.max(s.bounds.max[0] - s.bounds.min[0], s.bounds.max[2] - s.bounds.min[2], s.bounds.max[1]);
    // walk start: centre of the largest enclosed ground-floor room
    const rooms = plan.levels[0].rooms.filter((x) => !ROOM_TYPE_INFO[x.type].outdoor);
    const big = rooms.sort((a, b) => bbox(b.polygon).width * bbox(b.polygon).height - bbox(a.polygon).width * bbox(a.polygon).height)[0];
    const p = big ? centroid(big.polygon) : ([0, 0] as Point);
    return { center: c, radius: r, walkStart: new THREE.Vector3(p[0] + ox, 1.6, -(p[1] + oy)) };
  }, [plan]);

  // front of the plot (edge 0) is at plan y = 0 → look at the house from the front-right, above
  const camPos: [number, number, number] = [center.x + radius * 0.9, radius * 0.8, center.z + radius * 1.3];

  return (
    <Canvas
      shadows
      camera={{ position: camPos, fov: 45, near: 0.1, far: 1000 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ gl }) => onCanvas?.(gl.domElement)}
      style={{ background: "linear-gradient(#cfe3f3, #f4f7fa)" }}
    >
      <hemisphereLight args={["#ffffff", "#8a9a7a", 1.3]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[center.x - radius, radius * 1.5, center.z + radius * 0.8]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-radius * 1.5}
        shadow-camera-right={radius * 1.5}
        shadow-camera-top={radius * 1.5}
        shadow-camera-bottom={-radius * 1.5}
      />
      <Site plan={plan} />
      <Building plan={plan} colors={colors} showLevel={showLevel} />
      {mode === "orbit" ? (
        <OrbitControls target={center} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={3} maxDistance={radius * 6} makeDefault />
      ) : (
        <Walker start={walkStart} />
      )}
    </Canvas>
  );
}
