import { Float, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'

function WarehouseHub() {
  const ref = useRef(null)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.08
    }
  })

  return (
    <group ref={ref} position={[0, -0.7, 0]}>
      <mesh position={[0, -0.55, 0]} receiveShadow>
        <cylinderGeometry args={[2.3, 2.6, 0.35, 40]} />
        <meshStandardMaterial color="#173000" roughness={0.9} />
      </mesh>
      <RoundedBox args={[2.1, 0.9, 2.1]} radius={0.12} position={[0, 0.05, 0]} castShadow>
        <meshStandardMaterial color="#f4ffd0" roughness={0.32} metalness={0.1} />
      </RoundedBox>
      <RoundedBox args={[1.1, 0.4, 0.9]} radius={0.08} position={[0, 0.72, 0]} castShadow>
        <meshStandardMaterial color="#ffe500" emissive="#ffe500" emissiveIntensity={0.18} />
      </RoundedBox>
    </group>
  )
}

function Parcel({ position, color, scale = 1, delay = 0 }) {
  const ref = useRef(null)

  useFrame((state) => {
    if (!ref.current) {
      return
    }

    ref.current.position.y =
      position[1] + Math.sin(state.clock.elapsedTime * 1.2 + delay) * 0.07
    ref.current.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.8 + delay) * 0.18
  })

  return (
    <group ref={ref} position={position} scale={scale}>
      <RoundedBox args={[1.15, 0.72, 0.78]} radius={0.06} castShadow>
        <meshStandardMaterial color={color} roughness={0.52} metalness={0.14} />
      </RoundedBox>
      <mesh position={[0, 0.37, 0]}>
        <boxGeometry args={[1.16, 0.06, 0.18]} />
        <meshStandardMaterial color="#ffcf24" />
      </mesh>
      <mesh position={[0, 0, 0.395]}>
        <boxGeometry args={[0.16, 0.56, 0.05]} />
        <meshStandardMaterial color="#ffcf24" />
      </mesh>
    </group>
  )
}

function RouteArc({ points, color }) {
  return (
    <mesh>
      <tubeGeometry args={[new Catmull(points), 80, 0.045, 12, false]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.9} />
    </mesh>
  )
}

function DestinationPin({ position, color }) {
  return (
    <Float speed={1.3} rotationIntensity={0.2} floatIntensity={0.35}>
      <group position={position}>
        <mesh castShadow>
          <coneGeometry args={[0.23, 0.62, 20]} />
          <meshStandardMaterial color={color} roughness={0.34} />
        </mesh>
        <mesh position={[0, 0.28, 0]} castShadow>
          <sphereGeometry args={[0.18, 20, 20]} />
          <meshStandardMaterial color="#fff8cf" emissive={color} emissiveIntensity={0.18} />
        </mesh>
      </group>
    </Float>
  )
}

class Catmull {
  constructor(points) {
    this.curve = new (globalThis.THREE?.CatmullRomCurve3 || class {})(
      points.map((point) => ({ x: point[0], y: point[1], z: point[2] })),
    )
  }

  getPoint(value) {
    const point = this.curve.getPoint(value)
    return point
  }
}

function SceneRoutes() {
  const blueRoute = [
    [-0.2, 0.5, 0],
    [0.8, 1.3, -0.3],
    [2.2, 1.4, -0.6],
    [3.1, 0.7, -0.2],
  ]

  const coralRoute = [
    [0, 0.5, 0],
    [-0.8, 1.1, 0.5],
    [-2.1, 1.3, 0.2],
    [-3, 0.6, 0.5],
  ]

  return (
    <>
      <RouteArc points={blueRoute} color="#ffe500" />
      <RouteArc points={coralRoute} color="#22c313" />
      <DestinationPin position={[3.1, 0.8, -0.2]} color="#ffe500" />
      <DestinationPin position={[-3, 0.7, 0.5]} color="#22c313" />
    </>
  )
}

export function HeroScene() {
  return (
    <div className="mesh-glow h-[420px] overflow-hidden rounded-[2rem] border border-white/15 bg-[#061b05] shadow-2xl shadow-coral/20">
      <Canvas camera={{ position: [0, 1.3, 8.2], fov: 42 }} shadows dpr={[1, 2]}>
        <color attach="background" args={['#061b05']} />
        <fog attach="fog" args={['#061b05', 7, 16]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[5, 6, 3]} intensity={2.2} castShadow />
        <pointLight position={[-4, 1, 3]} intensity={14} color="#ffe500" />
        <pointLight position={[4, 0, 2]} intensity={10} color="#22c313" />

        <WarehouseHub />
        <SceneRoutes />
        <Parcel position={[-1.5, 1.35, -0.4]} color="#ff7a00" scale={0.92} delay={0.2} />
        <Parcel position={[1.55, 1.1, -0.85]} color="#22c313" scale={0.88} delay={0.8} />
        <Parcel position={[0, 1.75, 0.7]} color="#f4ffd0" scale={0.75} delay={1.3} />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.95, 0]} receiveShadow>
          <circleGeometry args={[6.6, 64]} />
          <shadowMaterial opacity={0.22} />
        </mesh>

        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  )
}
