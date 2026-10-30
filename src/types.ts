export type Vec3 = { x: number; y: number; z: number };
export interface Person {
  id: string;
  firstName: string;
  lastName?: string;
  nickname?: string;
  pronouns?: string;
  gender?: string;
  birthday?: string;
  age?: number;
  description?: string;
  notes?: string;
  tags: string[];
  groups: string[];
  color?: string;
  photo?: string;
  custom: Record<string, string>;
  dates: Record<string, string>;
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  favorite?: boolean;
  hidden?: boolean;
  size?: number;
  shape?: "sphere" | "cube" | "diamond";
  opacity?: number;
  border?: string;
  position?: Vec3;
  pinned?: boolean;
}
export type LineStyle = "solid" | "dashed" | "dotted";
export interface RelationshipType {
  id: string;
  name: string;
  color: string;
  icon: string;
  style: LineStyle;
}
export interface Connection {
  id: string;
  source: string;
  target: string;
  type: string;
  notes?: string;
  color?: string;
  weight: number;
  directed: boolean;
  startDate?: string;
  endDate?: string;
  hidden?: boolean;
  custom: Record<string, string>;
  style?: LineStyle;
  opacity?: number;
  particles?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Settings {
  theme: "dark" | "light" | "custom";
  background: string;
  accent: string;
  nodeSize: number;
  nodeOpacity: number;
  nodeShape: "sphere" | "cube" | "diamond";
  nodeGlow: boolean;
  nodeBorder: boolean;
  labels: boolean;
  labelSize: number;
  labelFont: string;
  edgeWidth: number;
  edgeOpacity: number;
  edgeStyle: LineStyle;
  edgeLabels: boolean;
  particles: boolean;
  stars: boolean;
  grid: boolean;
  bloom: boolean;
  lighting: number;
  charge: number;
  linkDistance: number;
  gravity: number;
  collision: number;
  physics: boolean;
  autoRotate: boolean;
  reducedMotion: boolean;
  animation: number;
  fov: number;
  cameraSpeed: number;
  degreeSizing: boolean;
  quality: "auto" | "high" | "low";
  seed: number;
  groupColors: Record<string, string>;
}
export interface SavedView {
  id: string;
  name: string;
  filters: Filters;
}
export interface CameraBookmark {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
}
export interface Web {
  id: string;
  name: string;
  description: string;
  people: Record<string, Person>;
  links: Record<string, Connection>;
  types: RelationshipType[];
  settings: Settings;
  createdAt: string;
  updatedAt: string;
  camera?: { position: Vec3; target: Vec3 };
  bookmarks: CameraBookmark[];
  views: SavedView[];
  presets: { id: string; name: string; settings: Settings }[];
}
export interface Filters {
  query: string;
  group: string;
  tag: string;
  gender: string;
  type: string;
  minDegree: number;
  maxDegree: number;
  showHidden: boolean;
  favorites: boolean;
  customKey: string;
  customValue: string;
  since: string;
  until: string;
}
export type Selection = { kind: "person" | "link"; id: string } | null;
export interface Snapshot {
  version: 1;
  web: Web;
}
export interface ShareOptions {
  notes: boolean;
  photos: boolean;
  custom: boolean;
  birthdays: boolean;
  comments: boolean;
}
export const displayName = (p: Person) =>
  [p.firstName, p.lastName].filter(Boolean).join(" ");
