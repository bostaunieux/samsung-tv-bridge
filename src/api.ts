import WebSocket, { CONNECTING, OPEN } from "ws";
import { promises } from "fs";

interface ApiProps {
  /** TV host */
  host: string;
  /** Request headers for connecting to NVR */
  headers?: Record<string, string>;
  name?: string;
  tokenFile?: string;
}

// ws heartbeat timeout before considering the connection severed
export const EVENTS_HEARTBEAT_INTERVAL_MS = 20 * 1000; // 20 seconds

// time to wait before attempting to reconnect to the websocket server
export const EVENTS_RECONNECT_INTERNAL_MS = 5 * 1000; // 5 seconds

// const WS_PORT = 8001;
const WSS_PORT = 8002;

/**
 * Class for managing a connection to the NVR's websocket server. This real-time event stream
 * is shared across all services running on the NVR, though we will only focus on events
 * coming from the Unifi Protect service.
 */
export default class Api {
  public connected = false;
  private shouldReconnect = false;
  private host: string;
  private name: string;
  private headers: Record<string, string>;
  private tokenFile?: string;
  private subscribers = new Set<(event: Buffer) => void>();
  private socket?: WebSocket;
  private pingTimeout?: NodeJS.Timeout;

  constructor({ host, name = "SamsungTvRemote", headers = {}, tokenFile }: ApiProps) {
    this.host = host;
    this.name = name;
    this.headers = headers;
    this.tokenFile = tokenFile;
  }

  /**
   * Attempt to connect to the websocket server
   */
  public async connect(): Promise<boolean> {
    // guard against repeated calls to connect when already connected
    if (this.socket?.readyState === OPEN || this.socket?.readyState === CONNECTING) {
      return true;
    }

    this.socket?.terminate();

    let token = "";
    if (this.tokenFile) {
      try {
        token = await promises.readFile(this.tokenFile, "utf8");
      } catch (err) {
        console.warn("Unable to find token: {}", err);
      }
    }

    const name = Buffer.from(this.name, "utf-8").toString();
    const webSocketUrl = `wss://${this.host}:${WSS_PORT}/api/v2/channels/samsung.remote.control?name=${name}&token=${token}`;

    console.debug("Connecting to ws server url: %s", webSocketUrl);

    this.socket = new WebSocket(webSocketUrl, {
      headers: this.headers,
      rejectUnauthorized: false,
    });

    this.socket.on("open", this.onOpen.bind(this));
    this.socket.on("ping", this.heartbeat.bind(this));
    this.socket.on("message", this.onMessage.bind(this));
    this.socket.on("data", this.onMessage.bind(this));
    this.socket.on("close", this.onClose.bind(this));
    this.socket.on("error", this.onError.bind(this));

    const saveToken = (event: Buffer) => {
      let content;
      try {
        content = JSON.parse(event.toString());
      } catch (err) {}

      if (this.tokenFile != null && content?.event === "ms.channel.connect" && content?.data?.token != null) {
        console.info("Saving token:", content.data.token);
        promises.writeFile(this.tokenFile, content.data.token);
        console.info("Unregistering token file save handler");
        this.socket?.off("message", saveToken);
      }
    };

    if (this.tokenFile != null) {
      console.info("Registering token file save handler");
      this.socket.on("message", saveToken);
    }

    return true;
  }

  /**
   * Add an event handler for websocket message events
   *
   * @param eventHandler Callback for processing websocket messages
   */
  public addSubscriber(eventHandler: (event: Buffer) => void): void {
    console.info("Adding event subscriber");
    this.subscribers.add(eventHandler);
  }

  /**
   * Remove all event handler subscriptions
   */
  public clearSubscribers(): void {
    this.subscribers.clear();
  }

  /**
   * Disconnect from the websocket server and prevent any reconnect attempts
   */
  public disconnect(): void {
    this.shouldReconnect = false;
    this.socket?.terminate();
  }

  private reconnect() {
    if (this.connected || !this.shouldReconnect) {
      return;
    }

    if (!this.connect()) {
      console.info(`Reconnecting after delay: ${EVENTS_RECONNECT_INTERNAL_MS}ms`);
      setTimeout(() => {
        this.reconnect();
      }, EVENTS_RECONNECT_INTERNAL_MS);
    }
  }

  private heartbeat() {
    this.pingTimeout && clearTimeout(this.pingTimeout);

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    this.pingTimeout = setTimeout(() => {
      this.socket?.terminate();
    }, EVENTS_HEARTBEAT_INTERVAL_MS);
  }

  private onOpen() {
    console.info("Connected to SamsungTV websocket server for event updates");

    this.connected = true;
    this.shouldReconnect = true;
    this.heartbeat();
  }

  private onMessage(event: Buffer) {
    this.heartbeat();
    this.subscribers.forEach((subscriber) => subscriber(event));
  }

  private onClose() {
    console.info("WebSocket connection closed");
    this.pingTimeout && clearTimeout(this.pingTimeout);
    this.socket = undefined;
    this.connected = false;

    this.reconnect();
  }

  private onError(error: Error) {
    console.error("Websocket connection error: %s", error);

    // terminate the connect; this will trigger a reconnect attempt
    this.socket?.terminate();
  }

  private saveToken() {}
}
