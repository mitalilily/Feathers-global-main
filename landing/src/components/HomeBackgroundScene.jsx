import { OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'

function FloatingParcel({ position, color, scale = 1, speed = 1 }) {
  const ref = useRef(null)

  useFrame((state) => {
    if (!ref.current) {
      return
    }

    ref.current.position.y =
      position[1] + Math.sin(state.clock.elapsedTime * speed + position[0]) * 0.2
    ref.current.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.45 + position[2]) * 0.35
    ref.current.rotation.x =
      Math.cos(state.clock.elapsedTime * 0.3 + position[0]) * 0.12
  })

  return (
    <group ref={ref} position={position} scale={scale}>
      <RoundedBox args={[1.2, 0.82, 0.82]} radius={0.06}>
        <meshStandardMaterial color={color} roughness={0.52} metalness={0.08} />
      </RoundedBox>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[1.22, 0.06, 0.16]} />
        <meshStandardMaterial color="#ffcf24" />
      </mesh>
      <mesh position={[0, 0, 0.42]}>
        <boxGeometry args={[0.16, 0.62, 0.05]} />
        <meshStandardMaterial color="#ffcf24" />
      </mesh>
    </group>
  )
}

function RouteLane({ position, rotation, color }) {
  const ref = useRef(null)
  const markerRef = useRef(null)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = rotation[2] + Math.sin(state.clock.elapsedTime * 0.18) * 0.02
    }

    if (markerRef.current) {
      const angle = state.clock.elapsedTime * 0.65 + position[0]
      markerRef.current.position.x = Math.cos(angle) * 4.5
      markerRef.current.position.y = Math.sin(angle) * 4.5
    }
  })

  return (
    <group ref={ref} position={position} rotation={rotation}>
      <mesh>
        <torusGeometry args={[4.5, 0.035, 20, 160]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
      </mesh>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.12, 18, 18]} />
        <meshStandardMaterial color="#fff8cf" emissive={color} emissiveIntensity={1.25} />
      </mesh>
    </group>
  )
}

function HubPlate({ position }) {
  const ref = useRef(null)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.12
    }
  })

  return (
    <group ref={ref} position={position}>
      <mesh>
        <cylinderGeometry args={[1.7, 1.95, 0.28, 40]} />
        <meshStandardMaterial color="#173000" roughness={0.92} />
      </mesh>
      <RoundedBox args={[1.8, 0.32, 1.8]} radius={0.08} position={[0, 0.32, 0]}>
        <meshStandardMaterial color="#f4ffd0" roughness={0.35} />
      </RoundedBox>
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial color="#ffe500" emissive="#ffe500" emissiveIntensity={0.85} />
      </mesh>
    </group>
  )
}

function DeliveryPin({ position, color = '#ffe500', scale = 1 }) {
  const ref = useRef(null)
  const ringRef = useRef(null)

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8 + position[0]) * 0.08
    }

    if (ringRef.current) {
      const pulse = 1 + (Math.sin(state.clock.elapsedTime * 1.5 + position[2]) + 1) * 0.12
      ringRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh position={[0, 0.05, 0]}>
        <coneGeometry args={[0.18, 0.42, 18]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial color="#fff8cf" emissive={color} emissiveIntensity={0.6} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <torusGeometry args={[0.34, 0.025, 12, 30]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.75} />
      </mesh>
    </group>
  )
}

function WarehouseCluster({ position, scale = 1 }) {
  const ref = useRef(null)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.22 + position[0]) * 0.08
    }
  })

  return (
    <group ref={ref} position={position} scale={scale}>
      <RoundedBox args={[1.6, 0.72, 1]} radius={0.06} position={[0, 0.35, 0]}>
        <meshStandardMaterial color="#f4ffd0" roughness={0.42} />
      </RoundedBox>
      <RoundedBox args={[0.65, 1.05, 0.85]} radius={0.06} position={[-0.42, 0.54, 0.02]}>
        <meshStandardMaterial color="#22c313" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[0.52, 0.88, 0.82]} radius={0.06} position={[0.45, 0.44, 0]}>
        <meshStandardMaterial color="#ff7a00" roughness={0.4} />
      </RoundedBox>
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[1.2, 1.35, 0.08, 28]} />
        <meshStandardMaterial color="#071b05" roughness={0.95} />
      </mesh>
    </group>
  )
}

export function HomeBackgroundScene() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Canvas camera={{ position: [0, 0, 13], fov: 40 }} dpr={[1, 1.6]}>
        <color attach="background" args={['#061b05']} />
        <fog attach="fog" args={['#061b05', 12, 26]} />
        <ambientLight intensity={0.8} />
        <pointLight position={[0, 2, 5]} intensity={12} color="#ffe500" />
        <pointLight position={[-6, -2, 3]} intensity={7} color="#22c313" />
        <directionalLight position={[5, 6, 3]} intensity={1.2} />

        <HubPlate position={[-2.2, 1.8, -5]} />
        <HubPlate position={[3.2, -1.4, -7]} />
        <HubPlate position={[5.4, 2.5, -10]} />

        <WarehouseCluster position={[-6.2, -1.9, -9]} scale={0.9} />
        <WarehouseCluster position={[1.8, 3.6, -11]} scale={0.78} />
        <WarehouseCluster position={[7.1, -0.2, -12]} scale={0.72} />

        <RouteLane position={[-1.4, 1.3, -7]} rotation={[0.9, 0.25, 0.1]} color="#ffe500" />
        <RouteLane position={[3.4, -1.1, -10]} rotation={[1.1, -0.3, -0.24]} color="#22c313" />
        <RouteLane position={[5.1, 2.2, -12]} rotation={[1.15, 0.15, 0.2]} color="#ff7a00" />

        <DeliveryPin position={[-6.7, 1.1, -6.8]} color="#ff7a00" scale={1.05} />
        <DeliveryPin position={[-0.6, 3.2, -9.6]} color="#ffe500" scale={0.92} />
        <DeliveryPin position={[6.8, 2.1, -11.3]} color="#22c313" scale={0.94} />
        <DeliveryPin position={[2.8, -3.1, -9.4]} color="#ffe500" scale={0.88} />

        <FloatingParcel position={[-5.4, 2.8, -5]} color="#ff7a00" scale={0.85} speed={0.9} />
        <FloatingParcel position={[-0.8, -0.4, -4]} color="#f4ffd0" scale={0.68} speed={1.1} />
        <FloatingParcel position={[4.2, 1, -8]} color="#22c313" scale={0.78} speed={1.2} />
        <FloatingParcel position={[6.3, -2.2, -9]} color="#ffe500" scale={0.62} speed={0.8} />
        <FloatingParcel position={[-3.1, -2.8, -8]} color="#fff4bb" scale={0.72} speed={1} />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate
          autoRotate
          autoRotateSpeed={0.35}
          minAzimuthAngle={-0.45}
          maxAzimuthAngle={0.45}
          minPolarAngle={1.15}
          maxPolarAngle={1.9}
        />
      </Canvas>
    </div>
  )
}
