export type WidgetType = "state" | "camera" | "energy" | "solar" | "grafana" | "weather" | "numpad" | "link";

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
  activeWidgetColor?: string;
  activeWidgetColor2?: string;
  inactiveWidgetColor?: string;
  inactiveWidgetColor2?: string;
  textColor?: string;
  mutedTextColor?: string;
  iconColor?: string;
  iconColor2?: string;
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
  showTitle?: boolean;
  iconPair?: IconPair;
  position: GridPosition;
  appearance?: WidgetAppearance;
  interactionSounds?: WidgetInteractionSounds;
};

export type WidgetInteractionSounds = {
  press?: string[];
  confirm?: string[];
  open?: string[];
  close?: string[];
  scroll?: string[];
};

export type StateWidgetConfig = WidgetBase & {
  type: "state";
  stateId: string;
  writeable: boolean;
  onLabel?: string;
  offLabel?: string;
  activeValue?: string;
  inactiveValue?: string;
  valueLabels?: Record<string, string>;
  format?: "boolean" | "number" | "text";
  addonMode?: "none" | "circle" | "text" | "icon" | "bars";
  addonValue?: string;
  addonStateId?: string;
  addonColor?: string;
  addonIcon?: string;
  addonUseStateValue?: boolean;
};

export type CameraWidgetConfig = WidgetBase & {
  type: "camera";
  previewSourceMode?: "snapshot" | "mjpeg" | "flv";
  fullscreenSourceMode?: "snapshot" | "mjpeg" | "flv";
  snapshotUrl?: string;
  fullscreenSnapshotUrl?: string;
  mjpegUrl?: string;
  fullscreenMjpegUrl?: string;
  flvUrl?: string;
  fullscreenFlvUrl?: string;
  refreshMs?: number;
  fullscreenRefreshMs?: number;
  snapshotAspectRatio?: number;
  maximizeStateId?: string;
  maximizeTriggerFormat?: "boolean" | "number" | "text";
  maximizeTriggerValue?: string;
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
  locationQuery?: string;
  timezone?: string;
  refreshMs?: number;
};

export type NumpadWidgetConfig = WidgetBase & {
  type: "numpad";
};

export type LinkWidgetConfig = WidgetBase & {
  type: "link";
  url?: string;
  iconImage?: string;
};

export type SolarNodeLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SolarLayoutConfig = {
  pv: SolarNodeLayout;
  home: SolarNodeLayout;
  battery: SolarNodeLayout;
  grid: SolarNodeLayout;
  car: SolarNodeLayout;
};

export type SolarStatConfig = {
  label: string;
  stateId?: string;
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
  nodeLayout?: Partial<SolarLayoutConfig>;
  stats?: {
    first?: SolarStatConfig;
    second?: SolarStatConfig;
    third?: SolarStatConfig;
  };
};

export type WidgetConfig =
  | StateWidgetConfig
  | CameraWidgetConfig
  | EnergyWidgetConfig
  | SolarWidgetConfig
  | GrafanaWidgetConfig
  | WeatherWidgetConfig
  | NumpadWidgetConfig
  | LinkWidgetConfig;

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

export type DashboardPage = {
  id: string;
  title: string;
  widgets: WidgetConfig[];
};

export type UiSoundSet = "voyager" | "ops" | "soft";

export type UiSoundSettings = {
  enabled: boolean;
  volume: number;
  soundSet: UiSoundSet;
  widgetTypeDefaults?: Partial<Record<WidgetType, WidgetInteractionSounds>>;
  pageSounds?: {
    tabPress?: string[];
    swipe?: string[];
    contentScroll?: string[];
    pullToRefresh?: string[];
    layoutToggle?: string[];
    addWidget?: string[];
    openSettings?: string[];
    widgetEdit?: string[];
    editorButton?: string[];
  };
};

export type DashboardSettings = {
  title: string;
  homeLabel?: string;
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
  uiSounds?: UiSoundSettings;
  iobroker: {
    baseUrl: string;
    username?: string;
    password?: string;
    token?: string;
    adapterBasePath?: string;
  };
  pages?: DashboardPage[];
  activePageId?: string;
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
