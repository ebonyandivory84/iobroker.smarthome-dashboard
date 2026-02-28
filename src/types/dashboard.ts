export type WidgetType = "state" | "camera" | "energy" | "solar";

export type IconPair = {
  active: string;
  inactive: string;
};

export type GridPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WidgetBase = {
  id: string;
  type: WidgetType;
  title: string;
  iconPair?: IconPair;
  position: GridPosition;
};

export type StateWidgetConfig = WidgetBase & {
  type: "state";
  stateId: string;
  writeable: boolean;
  onLabel?: string;
  offLabel?: string;
  format?: "boolean" | "number" | "text";
};

export type CameraWidgetConfig = WidgetBase & {
  type: "camera";
  snapshotUrl?: string;
  rtspUrl?: string;
  refreshMs?: number;
};

export type EnergyWidgetConfig = WidgetBase & {
  type: "energy";
  pvStateId: string;
  houseStateId: string;
  batteryStateId?: string;
  gridStateId?: string;
};

export type SolarWidgetConfig = WidgetBase & {
  type: "solar";
  statePrefix: string;
  keys: {
    pvNow: string;
    homeNow: string;
    gridIn: string;
    gridOut: string;
    soc?: string;
    battIn?: string;
    battOut?: string;
    dayConsumed: string;
    daySelf: string;
    pvTotal?: string;
    battTemp?: string;
  };
  dailyEnergyUnit?: "auto" | "Wh" | "kWh";
};

export type WidgetConfig =
  | StateWidgetConfig
  | CameraWidgetConfig
  | EnergyWidgetConfig
  | SolarWidgetConfig;

export type BackgroundMode = "gradient" | "mesh" | "solid";

export type ThemeSettings = {
  widgetTones: {
    stateStart: string;
    stateEnd: string;
    energyStart: string;
    energyEnd: string;
    cameraStart: string;
    cameraEnd: string;
    solarStart: string;
    solarEnd: string;
  };
  solar: {
    sceneCardBackground: string;
    sceneCardBorder: string;
    nodeCardBackground: string;
    nodeCardBorder: string;
    statCardBackground: string;
    statCardBorder: string;
  };
};

export type DashboardSettings = {
  title: string;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  backgroundAccent: string;
  theme?: ThemeSettings;
  grid: {
    columns: number;
    rowHeight: number;
    gap: number;
  };
  pollingMs: number;
  iobroker: {
    baseUrl: string;
    username?: string;
    password?: string;
    token?: string;
    adapterBasePath?: string;
  };
  widgets: WidgetConfig[];
};

export type StateSnapshot = Record<string, unknown>;
