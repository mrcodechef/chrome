import * as http from 'http';
import * as stream from 'stream';
import {
  APITags,
  Browserless,
  CDPChromium,
  Config,
  HTTPManagementRoutes,
  HTTPRoutes,
  Methods,
  Metrics,
  PlaywrightChromium,
  PlaywrightFirefox,
  PlaywrightWebkit,
  Request,
  WebsocketRoutes,
  contentTypes,
} from '@browserless.io/browserless';
import {
  HTTPRequest,
  Page,
  ResponseForRequest,
  ScreenshotOptions,
} from 'puppeteer-core';

export interface BeforeRequest {
  head?: Buffer;
  req: Request;
  res?: http.ServerResponse;
  socket?: stream.Duplex;
}

export interface AfterResponse {
  req: http.IncomingMessage;
  start: number;
  status: 'successful' | 'error' | 'timedout';
}

export interface BrowserHook {
  browser:
    | CDPChromium
    | PlaywrightChromium
    | PlaywrightFirefox
    | PlaywrightWebkit;
  meta: URL;
}

export interface PageHook {
  meta: URL;
  page: Page;
}

export interface RouteParams {
  config: Config;
  metrics: Metrics;
  schema?: unknown;
}

/**
 * The type of browser required to run this route or handler.
 */
export type BrowserClasses =
  | typeof CDPChromium
  | typeof PlaywrightChromium
  | typeof PlaywrightFirefox
  | typeof PlaywrightWebkit;

export type BrowserInstance =
  | CDPChromium
  | PlaywrightChromium
  | PlaywrightFirefox
  | PlaywrightWebkit;

export interface BrowserJSON {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
}

/**
 * The default launch options or a function, accepting
 * the request object, that produces the launch options.
 */
type defaultLaunchOptions =
  | CDPLaunchOptions
  | BrowserlessLaunch
  | ((req: Request) => CDPLaunchOptions | BrowserlessLaunch);

abstract class Route {
  constructor(
    protected _browserManager: Browserless['browserManager'],
    protected _config: Browserless['config'],
    protected _fileSystem: Browserless['fileSystem'],
    protected _debug: Browserless['debug'],
    protected _metrics: Browserless['metrics'],
    protected _monitoring: Browserless['monitoring'],
  ) {}

  /**
   * A boolean, or a function that returns a boolean, on
   * whether the route requires an API token to access.
   */
  auth: boolean | ((req: Request) => Promise<boolean>) = true;

  /**
   * The schematic of the submitted BODY (typically)
   * an object when the route is json-based. This is generated
   * automatically if your route defines a BodySchema type.
   */
  bodySchema?: unknown;

  /**
   * The query parameters accepted by the route, defined in
   * an object format. This is auto-generated for you if your
   * route defines and exports a QuerySchema type.
   */
  querySchema?: unknown;

  /**
   * The structure of the routes response when successful. This
   * is auto-generated for you if your route defines a ResponseSchema
   * type and exports it in your route.
   */
  responseSchema?: unknown;

  /**
   * Whether the route should be bound by the global
   * concurrency limit defined in your configuration.
   */
  concurrency: boolean = true;

  /**
   * Description of the route and what it does. This description
   * is then used in the embedded documentation site.
   */
  description?: string;

  /**
   * Helper function to load the browser-manager instance. Defined
   * and injected by browserless after initialization.
   * @returns BrowserManager
   */
  browserManager = () => this._browserManager;

  /**
   * Helper function that loads the config module. Defined and injected by
   * browserless after initialization.
   * @returns Config
   */
  config = () => this._config;

  /**
   * Helper function that loads the debug module, useful
   * for logging messages scoped to the routes path. Defined
   * and injected by browserless after initialization.
   * @returns Debug
   */
  debug = () => this._debug;

  /**
   * Helper function that loads the file-system module
   * for interacting with file-systems. Defined and injected by
   * browserless after initialization.
   * @returns FileSystem
   */
  fileSystem = () => this._fileSystem;

  /**
   * Helper function that loads the metrics module for
   * collecting and aggregating statistics. Defined and injected by
   * browserless after initialization.
   * @returns Metrics
   */
  metrics = () => this._metrics;

  /**
   * Helper function that loads the monitoring module useful
   * for monitoring system health. Defined and injected by
   * browserless after initialization.
   * @returns Monitor
   */
  monitoring = () => this._monitoring;

  /**
   * The HTTP path that this route handles, eg '/my-route'
   */
  abstract path: HTTPRoutes | WebsocketRoutes | HTTPManagementRoutes | string;

  /**
   * The tag(s) for the route to categorize it in the
   * documentation portal
   */
  abstract tags: APITags[];
}

/**
 * A primitive HTTP-based route that doesn't require a
 * browser in order to fulfill requests. Used by downstream HTTPRoute
 * and WebSocketRoute
 */
abstract class BasicHTTPRoute extends Route {
  /**
   * The allowed Content-Types that this route can read and handle.
   * If a request comes in with a Content-Type of 'application/json', then
   * this accepts would need to include ["application/json"] in order to not 404
   */
  abstract accepts: Array<contentTypes>;

  /**
   * The Content-Types that this route will will respond with, and must match the Accepts
   * Header from a client if present. If a request comes in with an Accepts of "application/json"
   * then the contentTypes here would need to include ["application/json"] in order to not 404.
   */
  abstract contentTypes: Array<contentTypes>;

  /**
   * The allowed methods ("GET", "POST", etc) this route can utilize and match against.
   */
  abstract method: Methods;
}

/**
 * A HTTP-based route, with a handler, that can fulfill requests without
 * a browser required.
 */
export abstract class HTTPRoute extends BasicHTTPRoute {
  /**
   * Handles an inbound HTTP request, and supplies the Request and Response objects from node's HTTP request event
   */
  abstract handler: (
    req: Request,
    res: http.ServerResponse,
  ) => Promise<unknown>;
}

/**
 * A HTTP-based route, with a handler, that can fulfill requests but
 * requires a browser in order to do so. Handler will then be called
 * with a 3rd argument of the browser class specified.
 */
export abstract class BrowserHTTPRoute extends BasicHTTPRoute {
  defaultLaunchOptions?: defaultLaunchOptions;

  abstract browser: BrowserClasses;

  /**
   * Handles an inbound HTTP request with a 3rd param of the predefined
   * browser used for the route -- only Chrome CDP is support currently.
   */
  abstract handler: (
    req: Request,
    res: http.ServerResponse,
    browser: BrowserInstance,
  ) => Promise<unknown>;

  /**
   * An optional function to automatically set up or handle new page
   * creation. Useful for injecting behaviors or other functionality.
   */
  onNewPage?: (url: URL, page: Page) => Promise<void>;
}

/**
 * A WebSocket-based route, with a handler, that can fulfill requests
 * that do not require a browser in order to operate.
 */
export abstract class WebSocketRoute extends Route {
  browser = null;

  /**
   * Handles an inbound Websocket request, and handles the connection
   */
  abstract handler: (
    req: Request,
    socket: stream.Duplex,
    head: Buffer,
  ) => Promise<unknown>;
}

/**
 * A WebSocket-based route, with a handler, that can fulfill requests
 * that need a browser. Handler is called with an additional argument of
 * browser (the browser class required to run the route).
 */
export abstract class BrowserWebsocketRoute extends Route {
  abstract browser: BrowserClasses;

  defaultLaunchOptions?: defaultLaunchOptions;

  /**
   * Handles an inbound Websocket request, and handles the connection
   * with the prior set browser being injected.
   */
  abstract handler(
    req: Request,
    socket: stream.Duplex,
    head: Buffer,
    browser: BrowserInstance,
  ): Promise<unknown>;

  /**
   * An optional function to automatically set up or handle new page
   * creation. Useful for injecting behaviors or other functionality.
   */
  onNewPage?: (url: URL, page: Page) => Promise<void>;
}

interface BrowserlessLaunch {
  stealth?: boolean;
}

export interface CDPLaunchOptions extends BrowserlessLaunch {
  args?: string[];
  defaultViewport?: {
    deviceScaleFactor?: number;
    hasTouch?: boolean;
    height: number;
    isLandscape?: boolean;
    isMobile?: boolean;
    width: number;
  };
  devtools?: boolean;
  dumpio?: boolean;
  headless?: boolean | 'new';
  ignoreDefaultArgs?: boolean | string[];
  ignoreHTTPSErrors?: boolean;
  slowMo?: number;
  stealth?: boolean;
  timeout?: number;
  userDataDir?: string;
  waitForInitialPage?: boolean;
}

export interface BrowserServerOptions {
  args?: string[];
  chromiumSandbox?: boolean;
  devtools?: boolean;
  downloadsPath?: string;
  headless?: boolean;
  ignoreDefaultArgs?: boolean | string[];
  proxy?: {
    bypass?: string;
    password?: string;
    server: string;
    username?: string;
  };
  timeout?: number;
  tracesDir?: string;
}

export interface BrowserlessSession {
  id: string | null;
  initialConnectURL: string;
  isTempDataDir: boolean;
  launchOptions: CDPLaunchOptions | BrowserServerOptions;
  numbConnected: number;
  resolver: (val: unknown) => void;
  routePath: string;
  startedOn: number;
  ttl: number;
  userDataDir: string | null;
}

export interface BrowserlessSessionJSON {
  browser: string;
  id: string | null;
  initialConnectURL: string;
  killURL: string | null;
  launchOptions: CDPLaunchOptions | BrowserServerOptions;
  numbConnected: number;
  routePath: string;
  startedOn: number;
  timeAliveMs: number;
  userDataDir: string | null;
}

export interface BrowserlessSessionFullJSON extends BrowserlessSessionJSON {
  pages: {
    title: string;
    url: string;
  }[];
}

export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

export type WaitForFunctionOptions = {
  /**
   * The function, or statement, to be evaluated in browser context
   */
  fn: string;

  /**
   * An interval at which the pageFunction is executed, defaults to raf.
   * If polling is a number, then it is treated as an interval in milliseconds
   * at which the function would be executed. If polling is a string,
   * then it can be one of the following values: "raf" or "mutation"
   */
  polling?: string | number;

  /**
   * Maximum time to wait for in milliseconds. Defaults to 30000 (30 seconds).
   * Pass 0 to disable timeout.
   */
  timeout?: number;
};

export type WaitForSelectorOptions = {
  hidden?: boolean;
  selector: string;
  timeout?: number;
  visible?: boolean;
};

export type WaitForEventOptions = {
  event: string;
  timeout?: number;
};
export interface ScreenshotSizeOptions {
  height?: number;
  scale?: number;
  width?: number;
}

export interface ScrapeElementSelector {
  selector: string;
  timeout?: number;
}

export interface ScrapeDebugOptions {
  console?: boolean;
  cookies?: boolean;
  html?: boolean;
  network?: boolean;
  screenshot?: boolean;
}

export interface OutBoundRequest {
  headers: unknown;
  method: string;
  url: string;
}

export interface InBoundRequest {
  headers: unknown;
  status: number;
  url: string;
}

export const debugScreenshotOpts: ScreenshotOptions = {
  encoding: 'base64',
  fullPage: true,
  quality: 20,
  type: 'jpeg',
};

declare global {
  interface Window {
    browserless: BrowserlessEmbeddedAPI;
  }
}

export interface BrowserlessEmbeddedAPI {
  getRecording: () => Promise<string>;
  liveUrl: () => string;
  saveRecording: () => Promise<boolean>;
  startRecording: () => void;
}

/**
 * When bestAttempt is set to true, browserless attempt to proceed
 * when "awaited" events fail or timeout. This includes things like
 * goto, waitForSelector, and more.
 */
export type bestAttempt = boolean;

/**
 * Whether or not to allow JavaScript to run on the page.
 */
export type setJavaScriptEnabled = boolean;

/**
 * A pattern to match requests with automatic rejections.
 * Internally we do this with the following: `req.url().match(pattern)`.
 */
export type rejectRequestPattern = string;
export type rejectResourceTypes = ReturnType<HTTPRequest['resourceType']>;

/**
 * An array of patterns (using `req.url().match(r.pattern)` to match) and their
 * corresponding responses to use in order to fulfill those requests.
 */
export type requestInterceptors = {
  /**
   * An array of patterns (using `req.url().match(r.pattern)` to match) and their
   * corresponding responses to use in order to fulfill those requests.
   */
  pattern: string;
  response: Partial<ResponseForRequest>;
};

export interface IResourceLoad {
  cpu: number | null;
  memory: number | null;
}

export interface IBrowserlessPressure {
  cpu: number | null;
  date: number;
  isAvailable: boolean;
  maxConcurrent: number;
  maxQueued: number;
  memory: number | null;
  message: string;
  queued: number;
  reason: string;
  recentlyRejected: number;
  running: number;
}

export interface IBrowserlessMetricTotals {
  error: number;
  estimatedMonthlyUnits: number;
  maxConcurrent: number;
  maxTime: number;
  meanTime: number;
  minTime: number;
  minutesOfMetricsAvailable: number;
  queued: number;
  rejected: number;
  sessionTimes: number[];
  successful: number;
  timedout: number;
  totalTime: number;
  unhealthy: number;
  units: number;
}

export interface IBrowserlessStats {
  cpu: number | null;
  date: number;
  error: number;
  maxConcurrent: number;
  maxTime: number;
  meanTime: number;
  memory: number | null;
  minTime: number;
  queued: number;
  rejected: number;
  sessionTimes: number[];
  successful: number;
  timedout: number;
  totalTime: number;
  unauthorized: number;
  unhealthy: number;
  units: number;
}

export interface CDPJSONPayload {
  /**
   * The description of the target. Generally the page's title.
   */
  description: string;

  /**
   * The fully-qualified URL of the Devtools inspector app.
   */
  devtoolsFrontendUrl: string;

  /**
   * A Unique Id for the underlying target.
   */
  id: string;

  /**
   * The title of the target. For pages this is the page's title.
   */
  title: string;

  /**
   * The type of target, generally "page" or "background_page".
   */
  type: string;

  /**
   * The current URL the target is consuming or visiting.
   */
  url: string;

  /**
   * The target or page's WebSocket Debugger URL. Primarily used for legacy
   * libraries to connect and inspect or remote automate this target.
   */
  webSocketDebuggerUrl: string;
}
