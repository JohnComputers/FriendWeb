import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from "react-force-graph-3d";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { forceCollide, forceX, forceY, forceZ } from "d3-force-3d";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { LocateFixed, MousePointer2, Network, Pin, X } from "lucide-react";
import type {
  Connection,
  Person,
  Selection,
  Vec3,
  Web,
  Settings,
  RelationshipType,
} from "../types";
import { displayName } from "../types";

type GraphNode = NodeObject & { id: string; person: Person; degree: number };
type GraphLink = LinkObject<GraphNode> & {
  id: string;
  connection: Connection;
  curve: number;
  rotation: number;
};
type CameraState = NonNullable<Web["camera"]>;
export interface GraphHandle {
  fit(): void;
  focus(id: string): void;
  reset(): void;
  zoom(factor: number): void;
  exportPNG(): void;
  getCamera(): CameraState | undefined;
  restoreCamera(camera: CameraState): void;
  resetLayout(): void;
  beginConnect(source: string): void;
}
export interface GraphProps {
  web: Web;
  people: Person[];
  links: Connection[];
  selection: Selection;
  selectedIds: string[];
  emphasizedIds?: Set<string>;
  pathIds?: Set<string>;
  onSelect: (selection: Selection, additive?: boolean) => void;
  onContext: (id: string, x: number, y: number) => void;
  onLinkCreate?: (source: string, target: string) => void;
  onPositions: (positions: Record<string, Vec3>) => void;
  onCamera: (camera: CameraState) => void;
  onPin?: (id: string, pinned: boolean) => void;
}

function randomFor(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++)
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return h;
}
function initialPosition(id: string, seed: number, index: number): Vec3 {
  const rand = randomFor(hash(id) + seed);
  const theta = rand() * Math.PI * 2;
  const y = rand() * 2 - 1;
  const r = 40 + Math.cbrt(index + 1) * 34;
  return {
    x: r * Math.sqrt(1 - y * y) * Math.cos(theta),
    y: r * y * 0.7,
    z: r * Math.sqrt(1 - y * y) * Math.sin(theta),
  };
}
function vector(v: Vec3) {
  return new THREE.Vector3(v.x, v.y, v.z);
}
function disposeObject(object: THREE.Object3D, sharedTexture?: THREE.Texture) {
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.Points
    )
      child.geometry?.dispose();
    if ("material" in child) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => {
        if (material instanceof THREE.Material) {
          const m = material as THREE.SpriteMaterial;
          if (m.map && m.map !== sharedTexture) m.map.dispose();
          material.dispose();
        }
      });
    }
  });
}
function makeGlow() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,.7)");
    gradient.addColorStop(0.23, "rgba(255,255,255,.28)");
    gradient.addColorStop(0.5, "rgba(255,255,255,.06)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}
function webGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;
    const lose = context.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}
function safePhoto(photo?: string) {
  return photo && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(photo)
    ? photo
    : undefined;
}

const Graph = forwardRef<GraphHandle, GraphProps>(function Graph(
  {
    web,
    people,
    links,
    selection,
    selectedIds,
    emphasizedIds,
    pathIds,
    onSelect,
    onContext,
    onLinkCreate,
    onPositions,
    onCamera,
    onPin,
  },
  ref,
) {
  const wrapper = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [available] = useState(webGLAvailable);
  const [hover, setHover] = useState<{
    kind: "person" | "link";
    id: string;
  } | null>(null);
  const [connectionSource, setConnectionSource] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [axis, setAxis] = useState({
    x: { x: 22, y: 0 },
    y: { x: 0, y: -22 },
    z: { x: -16, y: 12 },
  });
  const callbacks = useRef({
    onPositions,
    onCamera,
    onSelect,
    onContext,
    onLinkCreate,
    onPin,
  });
  callbacks.current = {
    onPositions,
    onCamera,
    onSelect,
    onContext,
    onLinkCreate,
    onPin,
  };
  const nodeCache = useRef(new Map<string, GraphNode>());
  const nodeObjects = useRef(new Map<string, THREE.Object3D>());
  const linkObjects = useRef(new Map<string, THREE.Object3D>());
  const labels = useRef(new Map<string, THREE.Object3D>());
  const glow = useMemo(makeGlow, []);
  const initialWeb = useRef("");
  const layoutStopped = useRef(false);
  const motion = web.settings.reducedMotion
    ? 0
    : Math.round(650 / Math.max(0.25, web.settings.cameraSpeed));
  const settingsKey = JSON.stringify(web.settings);
  const settings = useMemo(
    () => JSON.parse(settingsKey) as Settings,
    [settingsKey],
  );
  const fullPeople = useMemo(() => Object.values(web.people), [web.people]);
  const fullLinks = useMemo(() => Object.values(web.links), [web.links]);
  const visiblePeople = useMemo(
    () => new Set(people.map((p) => p.id)),
    [people],
  );
  const visibleLinks = useMemo(() => new Set(links.map((l) => l.id)), [links]);
  const [simulationEnabled, setSimulationEnabled] = useState(
    () =>
      settings.physics && Object.values(web.people).some((p) => !p.position),
  );
  const selectedKey = selectedIds.join("|");
  const selectedSet = useMemo(
    () => new Set(selectedKey.split("|").filter(Boolean)),
    [selectedKey],
  );
  const emphasizedKey = [...(emphasizedIds || [])].sort().join("|");
  const emphasizedSet = useMemo(
    () => new Set(emphasizedKey.split("|").filter(Boolean)),
    [emphasizedKey],
  );
  const pathKey = [...(pathIds || [])].sort().join("|");
  const pathSet = useMemo(
    () => new Set(pathKey.split("|").filter(Boolean)),
    [pathKey],
  );
  const typesKey = JSON.stringify(web.types);
  const types = useMemo(
    () =>
      new Map(
        (JSON.parse(typesKey) as RelationshipType[]).map((t) => [t.id, t]),
      ),
    [typesKey],
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const rendererConfig = useMemo(
    () => ({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance" as WebGLPowerPreference,
    }),
    [],
  );

  const topology =
    fullPeople.map((p) => p.id).join("|") +
    "~" +
    fullLinks.map((l) => `${l.id}:${l.source}:${l.target}`).join("|");
  const data = useMemo(() => {
    const degree = new Map<string, number>();
    fullLinks.forEach((link) => {
      degree.set(link.source, (degree.get(link.source) || 0) + 1);
      degree.set(link.target, (degree.get(link.target) || 0) + 1);
    });
    const ids = new Set(fullPeople.map((p) => p.id));
    const nodes = fullPeople.map((person, index) => {
      let node = nodeCache.current.get(person.id);
      if (!node) {
        const position =
          person.position || initialPosition(person.id, settings.seed, index);
        node = {
          id: person.id,
          person,
          degree: degree.get(person.id) || 0,
          ...position,
        };
        nodeCache.current.set(person.id, node);
      }
      node.person = person;
      node.degree = degree.get(person.id) || 0;
      if (person.pinned) {
        node.fx = person.position?.x ?? node.x;
        node.fy = person.position?.y ?? node.y;
        node.fz = person.position?.z ?? node.z;
      } else {
        node.fx = undefined;
        node.fy = undefined;
        node.fz = undefined;
      }
      return node;
    });
    const pairs = new Map<string, Connection[]>();
    fullLinks.forEach((l) => {
      const key = [l.source, l.target].sort().join(":");
      pairs.set(key, [...(pairs.get(key) || []), l]);
    });
    const graphLinks = fullLinks
      .filter((l) => ids.has(l.source) && ids.has(l.target))
      .map((connection) => {
        const siblings =
          pairs.get([connection.source, connection.target].sort().join(":")) ||
          [];
        const i = siblings.findIndex((l) => l.id === connection.id);
        return {
          id: connection.id,
          source: connection.source,
          target: connection.target,
          connection,
          curve:
            connection.source === connection.target
              ? 0.8
              : siblings.length > 1
                ? 0.12 + i * 0.16
                : 0,
          rotation: i % 2 ? Math.PI : 0,
        } as GraphLink;
      });
    return { nodes, links: graphLinks };
    // The force engine owns spatial objects. Metadata changes must not replace them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [web.id, topology]);
  // Keep styles and attributes current without giving the force engine new topology.
  const peopleMap = useMemo(
    () => new Map(fullPeople.map((p) => [p.id, p])),
    [fullPeople],
  );
  const linkMap = useMemo(
    () => new Map(fullLinks.map((l) => [l.id, l])),
    [fullLinks],
  );
  data.nodes.forEach((node) => {
    const p = peopleMap.get(node.id);
    if (p) node.person = p;
  });
  data.links.forEach((link) => {
    const l = linkMap.get(link.id);
    if (l) link.connection = l;
  });

  const getCamera = useCallback((): CameraState | undefined => {
    const fg = graph.current;
    if (!fg) return;
    const position = fg.camera().position;
    const controls = fg.controls() as unknown as { target: THREE.Vector3 };
    return {
      position: { x: position.x, y: position.y, z: position.z },
      target: {
        x: controls.target.x,
        y: controls.target.y,
        z: controls.target.z,
      },
    };
  }, []);
  const savePositions = useCallback(() => {
    const positions: Record<string, Vec3> = {};
    data.nodes.forEach((n) => {
      if (Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z))
        positions[n.id] = { x: n.x!, y: n.y!, z: n.z! };
    });
    callbacks.current.onPositions(positions);
  }, [data]);
  const fit = useCallback(() => {
    graph.current?.zoomToFit(motion, 65);
  }, [motion]);
  const focus = useCallback(
    (id: string) => {
      const node = nodeCache.current.get(id);
      if (!node || !graph.current) return;
      const point = new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0);
      const direction = graph.current
        .camera()
        .position.clone()
        .sub(point)
        .normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);
      const position = point.clone().add(direction.multiplyScalar(125));
      graph.current.cameraPosition(position, point, motion);
    },
    [motion],
  );
  const resetLayout = useCallback(() => {
    data.nodes.forEach((node, i) => {
      const position = initialPosition(node.id, settingsRef.current.seed, i);
      Object.assign(node, position, {
        fx: undefined,
        fy: undefined,
        fz: undefined,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    });
    setSimulationEnabled(settingsRef.current.physics);
    graph.current?.d3ReheatSimulation();
    layoutStopped.current = false;
  }, [data]);
  useImperativeHandle(
    ref,
    () => ({
      fit,
      focus,
      reset: () => {
        graph.current?.cameraPosition(
          { x: 0, y: 0, z: 450 },
          { x: 0, y: 0, z: 0 },
          motion,
        );
      },
      zoom: (factor: number) => {
        const fg = graph.current;
        if (!fg) return;
        const camera = getCamera();
        if (!camera) return;
        const target = vector(camera.target);
        const next = target
          .clone()
          .add(vector(camera.position).sub(target).multiplyScalar(factor));
        fg.cameraPosition(next, target, motion);
      },
      exportPNG: () => {
        const fg = graph.current;
        if (!fg) return;
        fg.renderer().render(fg.scene(), fg.camera());
        const anchor = document.createElement("a");
        anchor.download = `${web.name.replace(/[^a-z0-9 -]/gi, "") || "friendweb"}.png`;
        anchor.href = fg.renderer().domElement.toDataURL("image/png");
        anchor.click();
      },
      getCamera,
      restoreCamera: (camera: CameraState) => {
        graph.current?.cameraPosition(camera.position, camera.target, motion);
      },
      resetLayout,
      beginConnect: (source: string) => {
        setConnectionSource(source);
      },
    }),
    [fit, focus, motion, getCamera, resetLayout, web.name],
  );

  useEffect(() => {
    if (!wrapper.current) return;
    const element = wrapper.current;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const priorTopology = useRef(topology);
  const priorPhysics = useRef(
    JSON.stringify([
      settings.charge,
      settings.linkDistance,
      settings.collision,
      settings.gravity,
      settings.physics,
      settings.seed,
    ]),
  );
  const pinState = useRef(
    new Map<string, { pinned: boolean; position?: Vec3 }>(),
  );
  useEffect(() => {
    if (!available || !graph.current) return;
    const fg = graph.current;
    if (initialWeb.current !== web.id) {
      initialWeb.current = web.id;
      if (web.camera)
        fg.cameraPosition(web.camera.position, web.camera.target, 0);
      else
        window.setTimeout(() => {
          if (graph.current === fg && initialWeb.current === web.id)
            fg.zoomToFit(0, 100);
        }, 400);
      setInitialized(true);
    }
    const physicsKey = JSON.stringify([
      settings.charge,
      settings.linkDistance,
      settings.collision,
      settings.gravity,
      settings.physics,
      settings.seed,
    ]);
    const changed =
      priorTopology.current !== topology || priorPhysics.current !== physicsKey;
    priorTopology.current = topology;
    priorPhysics.current = physicsKey;
    const charge = fg.d3Force("charge") as
      | { strength: (value: number) => unknown }
      | undefined;
    charge?.strength(settings.charge);
    const link = fg.d3Force("link") as
      | { distance: (value: number) => unknown }
      | undefined;
    link?.distance(settings.linkDistance);
    fg.d3Force("collision", forceCollide(settings.collision).strength(0.8));
    fg.d3Force("x", forceX(0).strength(settings.gravity));
    fg.d3Force("y", forceY(0).strength(settings.gravity));
    fg.d3Force("z", forceZ(0).strength(settings.gravity));
    if (changed) {
      layoutStopped.current = false;
      setSimulationEnabled(settings.physics);
      if (settings.physics) {
        fg.resumeAnimation();
        fg.d3ReheatSimulation();
      }
    }
  }, [
    available,
    web.id,
    web.camera,
    topology,
    settings.charge,
    settings.linkDistance,
    settings.collision,
    settings.gravity,
    settings.physics,
    settings.seed,
  ]);

  useEffect(() => {
    const fg = graph.current;
    if (!available || !fg) return;
    let changed = false;
    data.nodes.forEach((node) => {
      const person = node.person;
      const previous = pinState.current.get(node.id);
      const pinned = !!person.pinned;
      const positionChanged =
        previous &&
        JSON.stringify(previous.position) !== JSON.stringify(person.position);
      if (previous && (previous.pinned !== pinned || positionChanged)) {
        if (positionChanged && person.position) {
          const pos = person.position;
          if (
            Math.abs((node.x || 0) - pos.x) +
              Math.abs((node.y || 0) - pos.y) +
              Math.abs((node.z || 0) - pos.z) >
            0.05
          ) {
            Object.assign(node, pos, { vx: 0, vy: 0, vz: 0 });
            changed = true;
          }
        }
        if (pinned) {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
        } else {
          node.fx = undefined;
          node.fy = undefined;
          node.fz = undefined;
        }
        changed = changed || previous.pinned !== pinned;
      }
      pinState.current.set(node.id, {
        pinned,
        position: person.position ? { ...person.position } : undefined,
      });
    });
    if (changed) {
      layoutStopped.current = false;
      setSimulationEnabled(settings.physics);
      fg.d3ReheatSimulation();
    }
  }, [available, data, fullPeople, settings.physics]);

  useEffect(() => {
    // Preserve filtered nodes for a stable simulation, but release permanently removed records.
    const ids = new Set(Object.keys(web.people));
    const linkIds = new Set(Object.keys(web.links));
    for (const id of nodeCache.current.keys())
      if (!ids.has(id)) {
        const object = nodeObjects.current.get(id);
        if (object) disposeObject(object, glow);
        nodeObjects.current.delete(id);
        labels.current.delete(id);
        nodeCache.current.delete(id);
        pinState.current.delete(id);
      }
    for (const [id, object] of linkObjects.current)
      if (!linkIds.has(id)) {
        disposeObject(object, glow);
        linkObjects.current.delete(id);
      }
  }, [topology, web.people, web.links, glow]);

  useEffect(() => {
    if (!available || !graph.current) return;
    const fg = graph.current;
    const camera = fg.camera() as THREE.PerspectiveCamera;
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    const controls = fg.controls() as unknown as {
      autoRotate: boolean;
      autoRotateSpeed: number;
      enableDamping: boolean;
      dampingFactor: number;
      zoomSpeed: number;
      rotateSpeed: number;
      panSpeed: number;
      minDistance: number;
      maxDistance: number;
      addEventListener: (name: string, fn: () => void) => void;
      removeEventListener: (name: string, fn: () => void) => void;
    };
    controls.autoRotate = settings.autoRotate && !settings.reducedMotion;
    controls.autoRotateSpeed = 0.35 * settings.animation;
    controls.enableDamping = !settings.reducedMotion;
    controls.dampingFactor = 0.12;
    controls.zoomSpeed = settings.cameraSpeed;
    controls.rotateSpeed = settings.cameraSpeed * 0.7;
    controls.panSpeed = settings.cameraSpeed;
    controls.minDistance = 15;
    controls.maxDistance = 8000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onEnd = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const state = getCamera();
        if (state) callbacks.current.onCamera(state);
      }, 350);
    };
    controls.addEventListener("end", onEnd);
    fg.lights([
      new THREE.AmbientLight("#d8e0ff", settings.lighting),
      new THREE.DirectionalLight("#ffffff", settings.lighting * 2),
      new THREE.HemisphereLight("#d9ceff", "#26243b", settings.lighting),
    ]);
    fg.renderer().setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        settings.quality === "low"
          ? 1
          : settings.quality === "high"
            ? 2
            : fullPeople.length > 400
              ? 1
              : 1.75,
      ),
    );
    return () => {
      controls.removeEventListener("end", onEnd);
      clearTimeout(timer);
    };
  }, [
    available,
    settings.fov,
    settings.autoRotate,
    settings.reducedMotion,
    settings.animation,
    settings.cameraSpeed,
    settings.lighting,
    settings.quality,
    fullPeople.length,
    getCamera,
  ]);

  useEffect(() => {
    if (!graph.current || !available) return;
    const scene = graph.current.scene();
    const decorations = new THREE.Group();
    if (settings.stars) {
      const random = randomFor(settings.seed);
      const coords = [];
      for (let i = 0; i < 450; i++)
        coords.push(
          (random() - 0.5) * 2800,
          (random() - 0.5) * 2200,
          (random() - 0.5) * 2800,
        );
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
      const material = new THREE.PointsMaterial({
        color: settings.theme === "light" ? "#787193" : "#8d8ba9",
        size: 1.1,
        transparent: true,
        opacity: 0.32,
        sizeAttenuation: true,
        depthWrite: false,
      });
      decorations.add(new THREE.Points(geo, material));
    }
    if (settings.grid) {
      const grid = new THREE.GridHelper(1400, 40, "#6e648f", "#292537");
      grid.position.y = -150;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.17;
      decorations.add(grid);
    }
    scene.add(decorations);
    return () => {
      scene.remove(decorations);
      disposeObject(decorations);
    };
  }, [
    available,
    initialized,
    settings.stars,
    settings.grid,
    settings.seed,
    settings.theme,
  ]);

  useEffect(() => {
    if (
      !graph.current ||
      !available ||
      !settings.bloom ||
      settings.quality === "low" ||
      people.length > 500
    )
      return;
    const composer = graph.current.postProcessingComposer();
    const pass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.35,
      0.45,
      0.65,
    );
    composer.addPass(pass);
    return () => {
      composer.removePass(pass);
      pass.dispose();
    };
  }, [
    available,
    initialized,
    settings.bloom,
    settings.quality,
    people.length,
    size.width,
    size.height,
  ]);

  useEffect(() => {
    if (!graph.current || !available) return;
    const fg = graph.current;
    const canvas = fg.renderer().domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    const restored = () => {
      setContextLost(false);
      fg.resumeAnimation();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    let frame = 0;
    let last = 0;
    const update = (time: number) => {
      frame = requestAnimationFrame(update);
      if (time - last < 160) return;
      last = time;
      const camera = fg.camera();
      labels.current.forEach((label, id) => {
        const node = nodeCache.current.get(id);
        if (!node) return;
        const distance = camera.position.distanceTo(
          new THREE.Vector3(node.x || 0, node.y || 0, node.z || 0),
        );
        label.visible =
          settingsRef.current.labels &&
          (nodeCache.current.size < 100 ||
            distance < 370 ||
            selectedSet.has(id) ||
            selection?.id === id) &&
          (distance < 1800 || selectedSet.has(id));
      });
      const quaternion = camera.quaternion.clone().invert();
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
      const y = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
      const z = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
      setAxis({
        x: { x: x.x * 23, y: -x.y * 23 },
        y: { x: y.x * 23, y: -y.y * 23 },
        z: { x: z.x * 23, y: -z.y * 23 },
      });
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
    };
  }, [available, initialized, selectedSet, selection]);

  useEffect(() => {
    const nodes = nodeObjects.current,
      links = linkObjects.current,
      cache = nodeCache.current,
      labelMap = labels.current;
    return () => {
      nodes.forEach((o) => disposeObject(o, glow));
      links.forEach((o) => disposeObject(o, glow));
      nodes.clear();
      links.clear();
      glow.dispose();
      cache.clear();
      labelMap.clear();
    };
    // Resource ownership is confined to this mounted graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodeAppearance = useMemo(
    () =>
      JSON.stringify(
        fullPeople.map((p) => [
          p.id,
          p.firstName,
          p.lastName,
          p.groups,
          p.color,
          p.photo,
          p.size,
          p.shape,
          p.opacity,
          p.border,
          p.pinned,
        ]),
      ),
    [fullPeople],
  );
  const linkAppearance = useMemo(
    () =>
      JSON.stringify(
        fullLinks.map((l) => [
          l.id,
          l.type,
          l.color,
          l.weight,
          l.style,
          l.opacity,
        ]),
      ),
    [fullLinks],
  );
  const dimmed = useCallback(
    (id: string) =>
      Boolean(emphasizedSet.size && !emphasizedSet.has(id) && !pathSet.has(id)),
    [emphasizedSet, pathSet],
  );
  const nodeThreeObject = useCallback(
    (node: GraphNode) => {
      void nodeAppearance;
      const previous = nodeObjects.current.get(node.id);
      if (previous) disposeObject(previous, glow);
      const person = node.person;
      const selected =
        selectedSet.has(node.id) ||
        (selection?.kind === "person" && selection.id === node.id);
      const highlighted =
        selected || hover?.id === node.id || pathSet.has(node.id);
      const color =
        person.color ||
        settings.groupColors[person.groups[0]] ||
        settings.accent;
      const radius =
        (person.size || settings.nodeSize) *
        (settings.degreeSizing ? 1 + Math.sqrt(node.degree) * 0.13 : 1);
      const opacity =
        (person.opacity ?? settings.nodeOpacity) * (dimmed(node.id) ? 0.13 : 1);
      const group = new THREE.Group();
      if (settings.nodeGlow || highlighted) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glow,
            color: highlighted ? "#e0d6ff" : color,
            transparent: true,
            opacity: highlighted ? 0.9 : 0.45 * opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        sprite.scale.setScalar(radius * (highlighted ? 7 : 5.5));
        group.add(sprite);
      }
      const shape = person.shape || settings.nodeShape;
      const geometry =
        shape === "cube"
          ? new THREE.BoxGeometry(radius * 1.5, radius * 1.5, radius * 1.5)
          : shape === "diamond"
            ? new THREE.OctahedronGeometry(radius * 1.2)
            : new THREE.SphereGeometry(
                radius,
                settings.quality === "low" || fullPeople.length > 500 ? 10 : 22,
                settings.quality === "low" || fullPeople.length > 500 ? 7 : 16,
              );
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.48,
        metalness: 0.12,
        emissive: color,
        emissiveIntensity: highlighted ? 0.4 : 0.09,
        transparent: opacity < 1,
        opacity,
      });
      const sphere = new THREE.Mesh(geometry, material);
      group.add(sphere);
      if (settings.nodeBorder || selected) {
        const ring = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: ringTexture(person.border || (selected ? "#ece7ff" : color)),
            transparent: true,
            opacity: opacity * 0.85,
            depthWrite: false,
          }),
        );
        ring.scale.setScalar(radius * (selected ? 3 : 2.4));
        group.add(ring);
      }
      const photo = safePhoto(person.photo);
      if (photo) {
        const tex = new THREE.TextureLoader().load(photo);
        tex.colorSpace = THREE.SRGBColorSpace;
        const photoSprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            opacity,
            depthTest: false,
          }),
        );
        photoSprite.scale.set(radius * 1.7, radius * 1.7, 1);
        photoSprite.position.z = radius * 0.3;
        group.add(photoSprite);
      } else if (fullPeople.length < 550 || highlighted) {
        const initials = new SpriteText(
          `${person.firstName[0] || ""}${person.lastName?.[0] || ""}`.toUpperCase(),
          radius * 0.65,
          "#ffffff",
        );
        initials.fontFace = "Arial";
        initials.fontWeight = "600";
        initials.material.opacity = opacity;
        initials.material.depthTest = false;
        group.add(initials);
      }
      labels.current.delete(node.id);
      if (
        settings.labels &&
        (fullPeople.length < 500 ||
          highlighted ||
          Math.abs(hash(node.id)) %
            Math.max(1, Math.ceil(fullPeople.length / 150)) ===
            0)
      ) {
        const label = new SpriteText(
          displayName(person),
          settings.labelSize,
          settings.theme === "light" ? "#252034" : "#ebe7f7",
        );
        label.fontFace = settings.labelFont;
        label.fontWeight = selected ? "600" : "400";
        label.backgroundColor =
          settings.theme === "light" ? "#ffffffaa" : "#0b0d1499";
        label.padding = [0.8, 1.8];
        label.borderRadius = 2;
        label.position.y = -radius - settings.labelSize * 1.3;
        label.material.opacity = dimmed(node.id) ? 0.2 : 0.92;
        label.material.depthTest = false;
        label.visible = settings.labels;
        group.add(label);
        labels.current.set(node.id, label);
      }
      if (person.pinned) {
        const pin = new SpriteText("◆", 2.5, "#d8c7ff");
        pin.position.set(radius, -radius, 0);
        group.add(pin);
      }
      nodeObjects.current.set(node.id, group);
      return group;
    },
    [
      settings,
      selectedSet,
      selection,
      hover,
      pathSet,
      dimmed,
      glow,
      fullPeople.length,
      nodeAppearance,
    ],
  );

  const linkColor = useCallback(
    (link: GraphLink) => {
      const l = link.connection;
      const source =
        typeof link.source === "object"
          ? link.source.id
          : (link.source as string);
      const target =
        typeof link.target === "object"
          ? link.target.id
          : (link.target as string);
      const selected = selection?.kind === "link" && selection.id === l.id;
      const color = new THREE.Color(
        selected
          ? "#ede4ff"
          : l.color || types.get(l.type)?.color || settings.accent,
      ).convertLinearToSRGB();
      const alpha =
        dimmed(source) && dimmed(target)
          ? 0.05
          : (l.opacity ?? settings.edgeOpacity) *
            (selected || hover?.id === l.id ? 1.8 : 1);
      return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${Math.min(1, alpha)})`;
    },
    [types, settings, dimmed, selection, hover],
  );

  const linkThreeObject = useCallback(
    (link: GraphLink) => {
      void linkAppearance;
      const previous = linkObjects.current.get(link.id);
      if (previous) disposeObject(previous, glow);
      const group = new THREE.Group();
      const l = link.connection;
      const style = l.style || types.get(l.type)?.style || settings.edgeStyle;
      if (style !== "solid") {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(new Float32Array(33 * 3), 3),
        );
        const material = new THREE.LineDashedMaterial({
          color: l.color || types.get(l.type)?.color || settings.accent,
          dashSize: style === "dotted" ? 0.6 : 3,
          gapSize: style === "dotted" ? 2 : 2.3,
          linewidth: (l.weight || 1) * settings.edgeWidth,
          transparent: true,
          opacity: l.opacity ?? settings.edgeOpacity,
          depthWrite: false,
        });
        const line = new THREE.Line(geometry, material);
        line.name = "dashed";
        group.add(line);
      }
      if (settings.edgeLabels) {
        const label = new SpriteText(
          types.get(l.type)?.name || l.type,
          settings.labelSize * 0.7,
          settings.theme === "light" ? "#564a69" : "#b9afcb",
        );
        label.backgroundColor =
          settings.theme === "light" ? "#ffffffbb" : "#0b0d14bb";
        label.padding = [0.5, 1];
        label.material.depthWrite = false;
        label.name = "label";
        group.add(label);
      }
      linkObjects.current.set(link.id, group);
      return group;
    },
    [settings, types, glow, linkAppearance],
  );
  const linkPositionUpdate = useCallback(
    (
      object: THREE.Object3D,
      { start, end }: { start: Vec3; end: Vec3 },
      link: GraphLink,
    ) => {
      // Extended custom content stays in world space; the native link retains arrows and hit-testing.
      const source = vector(start),
        target = vector(end);
      const middle = source.clone().add(target).multiplyScalar(0.5);
      const direction = target.clone().sub(source);
      let perpendicular = new THREE.Vector3(0, 0, 1)
        .cross(direction)
        .normalize();
      if (perpendicular.lengthSq() < 0.01)
        perpendicular = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
      perpendicular.applyAxisAngle(
        direction.clone().normalize(),
        link.rotation,
      );
      middle.add(perpendicular.multiplyScalar(direction.length() * link.curve));
      const curve = new THREE.QuadraticBezierCurve3(source, middle, target);
      const dashed = object.getObjectByName("dashed") as THREE.Line | undefined;
      if (dashed) {
        const positions = dashed.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        curve
          .getPoints(32)
          .forEach((point, index) =>
            positions.setXYZ(index, point.x, point.y, point.z),
          );
        positions.needsUpdate = true;
        dashed.geometry.computeBoundingSphere();
        dashed.computeLineDistances();
      }
      const label = object.getObjectByName("label");
      if (label) label.position.copy(curve.getPoint(0.5));
      return true;
    },
    [],
  );

  const handleStop = useCallback(() => {
    if (!graph.current) return;
    if (initialWeb.current !== web.id) {
      initialWeb.current = web.id;
      if (web.camera)
        graph.current.cameraPosition(web.camera.position, web.camera.target, 0);
      else graph.current.zoomToFit(0, 75);
      setInitialized(true);
    }
    if (!layoutStopped.current) {
      layoutStopped.current = true;
      savePositions();
    }
  }, [web.id, web.camera, savePositions]);
  const selectedPerson =
    selection?.kind === "person" ? web.people[selection.id] : null;
  const hoveredPerson = hover?.kind === "person" ? web.people[hover.id] : null;
  const hoveredLink = hover?.kind === "link" ? web.links[hover.id] : null;
  const sourcePerson = web.people[connectionSource];
  if (!available)
    return (
      <div className="graph-fallback">
        <Network size={44} />
        <h2>Your people, still connected</h2>
        <p>
          This browser cannot start WebGL. Use the People directory to create,
          find, and edit your web, or enable hardware acceleration to explore in
          3D.
        </p>
      </div>
    );
  return (
    <div
      ref={wrapper}
      className="friendweb-graph"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <ForceGraph3D<GraphNode, GraphLink>
        ref={graph}
        width={size.width}
        height={size.height}
        graphData={data}
        backgroundColor={settings.background}
        rendererConfig={rendererConfig}
        nodeId="id"
        nodeLabel=""
        linkLabel=""
        nodeThreeObject={nodeThreeObject}
        nodeVisibility={(node) => visiblePeople.has(node.id)}
        linkVisibility={(link) => visibleLinks.has(link.id)}
        nodeVal={(node) => (node.person.size || settings.nodeSize) ** 2}
        nodeRelSize={1}
        nodeResolution={12}
        linkColor={linkColor}
        linkWidth={(link) => {
          const l = link.connection;
          return (l.style || types.get(l.type)?.style || settings.edgeStyle) ===
            "solid"
            ? settings.edgeWidth * (l.weight || 1)
            : 0;
        }}
        linkOpacity={1}
        linkCurvature={(link) => link.curve}
        linkCurveRotation={(link) => link.rotation}
        linkThreeObject={linkThreeObject}
        linkThreeObjectExtend={true}
        linkPositionUpdate={(object, coords, link) =>
          linkPositionUpdate(object, coords, link as unknown as GraphLink)
        }
        linkDirectionalArrowLength={(link) =>
          link.connection.directed ? 4 : 0
        }
        linkDirectionalArrowRelPos={0.8}
        linkDirectionalArrowColor={linkColor}
        linkDirectionalParticles={(link) =>
          (link.connection.particles ?? settings.particles) &&
          !settings.reducedMotion &&
          settings.quality !== "low" &&
          data.links.length < 700
            ? 2
            : 0
        }
        linkDirectionalParticleWidth={1.2}
        linkDirectionalParticleSpeed={0.003 * settings.animation}
        linkDirectionalParticleColor={linkColor}
        enableNodeDrag={true}
        enableNavigationControls={true}
        enablePointerInteraction={true}
        controlType="orbit"
        showNavInfo={false}
        warmupTicks={0}
        cooldownTicks={settings.physics && simulationEnabled ? 180 : 0}
        d3VelocityDecay={0.38}
        d3AlphaDecay={0.035}
        onNodeClick={(node, event) => {
          if (connectionSource && node.id !== connectionSource) {
            callbacks.current.onLinkCreate?.(connectionSource, node.id);
            setConnectionSource("");
            return;
          }
          callbacks.current.onSelect(
            { kind: "person", id: node.id },
            event.ctrlKey || event.metaKey || event.shiftKey,
          );
          focus(node.id);
        }}
        onLinkClick={(link, event) =>
          callbacks.current.onSelect(
            { kind: "link", id: link.id },
            event.ctrlKey || event.metaKey || event.shiftKey,
          )
        }
        onBackgroundClick={() => {
          setConnectionSource("");
          callbacks.current.onSelect(null);
        }}
        onNodeRightClick={(node, event) => {
          event.preventDefault();
          callbacks.current.onContext(node.id, event.clientX, event.clientY);
        }}
        onNodeHover={(node) => {
          setHover(node ? { kind: "person", id: node.id } : null);
          if (wrapper.current)
            wrapper.current.style.cursor = node ? "pointer" : "grab";
        }}
        onLinkHover={(link) => {
          setHover(link ? { kind: "link", id: link.id } : null);
          if (wrapper.current)
            wrapper.current.style.cursor = link ? "pointer" : "grab";
        }}
        onNodeDragEnd={(node) => {
          node.fx = node.x;
          node.fy = node.y;
          node.fz = node.z;
          savePositions();
          callbacks.current.onPin?.(node.id, true);
        }}
        onEngineStop={handleStop}
      />
      {sourcePerson && (
        <div
          className="graph-connect-hint"
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            background: "#262034ee",
            border: "1px solid #9c7de5",
            borderRadius: 12,
            color: "#f2edff",
            fontSize: 13,
          }}
        >
          <MousePointer2 size={16} />
          <span>
            Click someone to connect with <b>{sourcePerson.firstName}</b>
          </span>
          <button
            onClick={() => setConnectionSource("")}
            aria-label="Cancel connection"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(hoveredPerson || hoveredLink) && (
        <div
          className="graph-hover-card"
          style={{
            position: "absolute",
            bottom: 90,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 2,
            background: settings.theme === "light" ? "#ffffffed" : "#191923ee",
            border: "1px solid #8b7aa544",
            backdropFilter: "blur(15px)",
            padding: "10px 16px",
            borderRadius: 12,
            maxWidth: 320,
            textAlign: "center",
            boxShadow: "0 8px 30px #0003",
          }}
        >
          {hoveredPerson ? (
            <>
              <strong style={{ fontSize: 13 }}>
                {displayName(hoveredPerson)}
              </strong>
              <div style={{ color: "#9993ad", fontSize: 11, marginTop: 4 }}>
                {hoveredPerson.nickname ? `${hoveredPerson.nickname} · ` : ""}
                {data.nodes.find((n) => n.id === hoveredPerson.id)?.degree ||
                  0}{" "}
                connections{hoveredPerson.pinned ? " · Pinned" : ""}
              </div>
            </>
          ) : hoveredLink ? (
            <>
              <strong style={{ fontSize: 13 }}>
                {types.get(hoveredLink.type)?.name || hoveredLink.type}
              </strong>
              <div style={{ color: "#9993ad", fontSize: 11, marginTop: 4 }}>
                {web.people[hoveredLink.source]?.firstName}{" "}
                {hoveredLink.directed ? "→" : "↔"}{" "}
                {web.people[hoveredLink.target]?.firstName}
                {hoveredLink.notes
                  ? ` · ${hoveredLink.notes.slice(0, 80)}`
                  : ""}
              </div>
            </>
          ) : null}
        </div>
      )}
      {contextLost && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            background: "#0b0d14dd",
            padding: 32,
            textAlign: "center",
          }}
        >
          <h3>Restoring your 3D view…</h3>
          <p>
            Your data is safe. If the view does not recover, reload this page.
          </p>
        </div>
      )}
      <div
        className="graph-orientation"
        aria-label="3D orientation"
        style={{
          position: "absolute",
          right: 22,
          bottom: 89,
          width: 68,
          height: 68,
          pointerEvents: "none",
          opacity: 0.8,
        }}
      >
        <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
          <circle cx="34" cy="34" r="28" fill="#14141b88" stroke="#ffffff0b" />
          {(["x", "y", "z"] as const).map((key, i) => (
            <g key={key}>
              <line
                x1="34"
                y1="34"
                x2={34 + axis[key].x}
                y2={34 + axis[key].y}
                stroke={["#d98d98", "#8bc7ac", "#afa1e2"][i]}
                strokeWidth="1.5"
              />
              <circle
                cx={34 + axis[key].x}
                cy={34 + axis[key].y}
                r="5"
                fill="#181722"
              />
              <text
                x={34 + axis[key].x}
                y={37 + axis[key].y}
                textAnchor="middle"
                fill={["#d98d98", "#8bc7ac", "#afa1e2"][i]}
                fontSize="8"
                fontFamily="Arial"
              >
                {key.toUpperCase()}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {selectedPerson?.pinned && (
        <div
          style={{
            position: "absolute",
            right: 26,
            bottom: 164,
            fontSize: 10,
            color: "#a49bb8",
            display: "flex",
            alignItems: "center",
            gap: 5,
            pointerEvents: "none",
          }}
        >
          <Pin size={11} />
          Pinned
        </div>
      )}
      {people.length === 0 && Object.keys(web.people).length > 0 && (
        <div
          className="graph-empty"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            pointerEvents: "none",
            color: "#a9a3b8",
          }}
        >
          <LocateFixed
            size={40}
            style={{ margin: "0 auto 16px", color: settings.accent }}
          />
          <h2 style={{ fontWeight: 500, color: "#ede9f6" }}>
            No people match this view.
          </h2>
          <p>Clear your filters to see your constellation again.</p>
        </div>
      )}
    </div>
  );
});

function ringTexture(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(canvas);
}
export default Graph;
