export type WidgetType = "state" | "camera" | "energy" | "solar" | "grafana" | "weather";

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

export type WidgetAppearance = {
  widgetColor?: string;
  widgetColor2?: string;
  textColor?: string;
  mutedTextColor?: string;
  cardColor?: string;
  cardColor2?: string;
  statColor?: string;
  statColor2?: string;
  pvCardColor?: string;
  homeCardColor?: string;
  batteryCardColor?: string;
  gridCardColor?: string;
  carCardColor?: string;
};

export type WidgetBase = {
  id: string;
  type: WidgetType;
  title: string;
  iconPair?: IconPair;
  position: GridPosition;
  appearance?: WidgetAppearance;
};

export type StateWidgetConfig = WidgetBase & {
  type: "state";
  stateId: string;
  writeable: boolean;
  onLabel?: string;
  offLabel?: string;
  activeValue?: string;
  inactiveValue?: string;
  format?: "boolean" | "number" | "text";
};

export type CameraWidgetConfig = WidgetBase & {
  type: "camera";
  snapshotUrl?: string;
  rtspUrl?: string;
  refreshMs?: number;
};

export type GrafanaWidgetConfig = WidgetBase & {
  type: "grafana";
  url: string;
  refreshMs?: number;
  allowInteractions?: boolean;
};

export type WeatherWidgetConfig = WidgetBase & {
  type: "weather";
  latitude: number;
  longitude: number;
  locationName?: string;
  timezone?: string;
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
  backgroundMode?: "color" | "image";
  backgroundImage?: string;
  backgroundImageBlur?: number;
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
  | SolarWidgetConfig
  | GrafanaWidgetConfig
  | WeatherWidgetConfig;

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

export type IoBrokerObjectEntry = {
  id: string;
  name?: string;
  type?: string;
  role?: string;
  valueType?: string;
};

export type WidgetImageEntry = {
  name: string;
  url: string;
};
