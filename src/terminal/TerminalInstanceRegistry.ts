import { PluginError } from "../model";
import type { Disposable } from "../ssh/SshClientAdapter";
import type { SshConnectionTarget } from "../ssh/SshConnectionTarget";
import type { ManagedSession } from "../ssh/SessionManager";
import type { TerminalSessionManager, TerminalViewOptions } from "../ui/TerminalView";
import type { TerminalOrigin } from "./TerminalOrigin";

export type TerminalInstanceStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed";

export type TerminalLocation =
  | { kind: "document"; hostId: string }
  | { kind: "terminal-tab"; hostId: string }
  | { kind: "background" };

export interface TerminalInstanceSnapshot {
  id: string;
  displayName: string;
  origin: TerminalOrigin;
  sourceAvailable: boolean;
  status: TerminalInstanceStatus;
  location: TerminalLocation;
  lastActiveAt: number;
}

export interface TerminalHostRegistration {
  id: string;
  kind: "document" | "terminal-tab";
  container: HTMLElement;
}

export interface MovableTerminalView {
  attach(container: HTMLElement): void;
  detach(): void;
  connect(): Promise<void>;
  focus(): void;
  clear(): void;
  dispose(options?: { preserveSession?: boolean }): void | Promise<void>;
}

export interface PreparedTerminalInstance {
  instanceId: string;
  attach(host: TerminalHostRegistration): Disposable;
  connect(): Promise<void>;
  disposeIfUnused(): void;
}

interface RegistrySessionManager {
  connect(instanceId: string, target: SshConnectionTarget): Promise<Pick<ManagedSession, "onData" | "onStateChange">>;
  write(instanceId: string, data: string): void;
  resize(instanceId: string, rows: number, cols: number, height: number, width: number): void;
  close(instanceId: string): Promise<void>;
}

export interface TerminalInstanceRegistryDependencies {
  sessionManager: RegistrySessionManager;
  terminalFactory: (
    container: HTMLElement,
    options: TerminalViewOptions
  ) => MovableTerminalView;
  now?: () => number;
}

interface TerminalInstanceEntry {
  id: string;
  origin: TerminalOrigin;
  createTarget(): SshConnectionTarget;
  displayName: string;
  terminal: MovableTerminalView;
  hosts: Map<string, TerminalHostRegistration>;
  status: TerminalInstanceStatus;
  location: TerminalLocation;
  sourceAvailable: boolean;
  lastActiveAt: number;
  published: boolean;
  pendingSourceActivation: boolean;
  connecting?: Promise<Pick<ManagedSession, "onData" | "onStateChange">>;
  sessionStateDisposable?: Disposable;
}

export class TerminalInstanceRegistry {
  private readonly entries = new Map<string, TerminalInstanceEntry>();
  private readonly instanceIdsByOrigin = new Map<string, string>();
  private readonly subscribers = new Set<() => void>();
  private readonly sessionManager: RegistrySessionManager;
  private readonly terminalFactory: TerminalInstanceRegistryDependencies["terminalFactory"];
  private readonly now: () => number;
  private nextInstanceId = 1;

  constructor(dependencies: TerminalInstanceRegistryDependencies) {
    this.sessionManager = dependencies.sessionManager;
    this.terminalFactory = dependencies.terminalFactory;
    this.now = dependencies.now ?? Date.now;
  }

  prepare(options: {
    origin: TerminalOrigin;
    createTarget(): SshConnectionTarget;
    height: number;
  }): PreparedTerminalInstance {
    const originKey = serializeOrigin(options.origin);
    const existingId = this.instanceIdsByOrigin.get(originKey);
    if (existingId) {
      const existing = this.entries.get(existingId);
      if (existing) {
        if (!existing.published) existing.createTarget = options.createTarget;
        return this.preparedHandle(existing);
      }
      this.instanceIdsByOrigin.delete(originKey);
    }

    const id = `ssh-terminal-${this.nextInstanceId++}`;
    const target = options.createTarget();
    const stagingContainer = document.createElement("div");
    const manager = this.createManagerAdapter(id);
    const terminal = this.terminalFactory(stagingContainer, {
      instanceId: id,
      createTarget: options.createTarget,
      height: options.height,
      manager
    });
    terminal.detach();
    const entry: TerminalInstanceEntry = {
      id,
      origin: { ...options.origin },
      createTarget: options.createTarget,
      displayName: target.displayName,
      terminal,
      hosts: new Map(),
      status: "disconnected",
      location: { kind: "background" },
      sourceAvailable: true,
      lastActiveAt: this.now(),
      published: false,
      pendingSourceActivation: false
    };
    this.entries.set(id, entry);
    this.instanceIdsByOrigin.set(originKey, id);
    return this.preparedHandle(entry);
  }

  list(): TerminalInstanceSnapshot[] {
    return [...this.entries.values()]
      .filter((entry) => entry.published)
      .sort((left, right) => right.lastActiveAt - left.lastActiveAt)
      .map(snapshot);
  }

  get(instanceId: string): TerminalInstanceSnapshot | undefined {
    const entry = this.entries.get(instanceId);
    return entry?.published ? snapshot(entry) : undefined;
  }

  findByOrigin(origin: TerminalOrigin): TerminalInstanceSnapshot | undefined {
    const instanceId = this.instanceIdsByOrigin.get(serializeOrigin(origin));
    return instanceId ? this.get(instanceId) : undefined;
  }

  subscribe(handler: () => void): Disposable {
    this.subscribers.add(handler);
    return { dispose: () => this.subscribers.delete(handler) };
  }

  registerHost(instanceId: string, host: TerminalHostRegistration): Disposable {
    const entry = this.requireEntry(instanceId);
    entry.hosts.set(host.id, host);
    entry.sourceAvailable ||= host.kind === "document";
    if (entry.pendingSourceActivation && host.kind === "document") {
      entry.pendingSourceActivation = false;
      this.activate(instanceId, host.id);
    }
    return {
      dispose: () => {
        if (entry.hosts.get(host.id) !== host) return;
        entry.hosts.delete(host.id);
        if (entry.location.kind !== "background" && entry.location.hostId === host.id) {
          entry.terminal.detach();
          entry.location = { kind: "background" };
          this.touch(entry);
        }
      }
    };
  }

  activate(instanceId: string, hostId: string): void {
    const entry = this.requireEntry(instanceId);
    const host = entry.hosts.get(hostId);
    if (!host) throw new Error("Terminal host is no longer available.");
    entry.terminal.attach(host.container);
    entry.location = host.kind === "document"
      ? { kind: "document", hostId }
      : { kind: "terminal-tab", hostId };
    entry.pendingSourceActivation = false;
    this.touch(entry);
  }

  requestSourceActivation(instanceId: string): void {
    const entry = this.requireEntry(instanceId);
    const documentHost = [...entry.hosts.values()].find((host) => host.kind === "document");
    if (documentHost) {
      this.activate(instanceId, documentHost.id);
      return;
    }
    entry.pendingSourceActivation = true;
  }

  clear(instanceId: string): void {
    this.requireEntry(instanceId).terminal.clear();
  }

  focus(instanceId: string): void {
    this.requireEntry(instanceId).terminal.focus();
  }

  async disconnect(instanceId: string): Promise<void> {
    const entry = this.requireEntry(instanceId);
    entry.sessionStateDisposable?.dispose();
    delete entry.sessionStateDisposable;
    await this.sessionManager.close(instanceId);
    entry.status = "disconnected";
    delete entry.connecting;
    this.touch(entry);
  }

  async reconnect(instanceId: string): Promise<void> {
    const entry = this.requireEntry(instanceId);
    if (entry.status !== "disconnected" && entry.status !== "failed") {
      throw new PluginError("SESSION_STATE_INVALID", "SSH session is already active.");
    }
    await entry.terminal.connect();
  }

  remove(instanceId: string): void {
    const entry = this.requireEntry(instanceId);
    if (entry.status === "connecting" || entry.status === "connected") {
      throw new PluginError(
        "SESSION_STATE_INVALID",
        "Disconnect the SSH session before removing it."
      );
    }
    this.deleteEntry(entry);
  }

  renameSource(oldPath: string, newPath: string): void {
    let changed = false;
    for (const entry of this.entries.values()) {
      if (entry.origin.sourcePath !== oldPath) continue;
      this.instanceIdsByOrigin.delete(serializeOrigin(entry.origin));
      entry.origin = { ...entry.origin, sourcePath: newPath };
      this.instanceIdsByOrigin.set(serializeOrigin(entry.origin), entry.id);
      entry.sourceAvailable = true;
      changed = true;
    }
    if (changed) this.emit();
  }

  markSourceUnavailable(sourcePath: string): void {
    let changed = false;
    for (const entry of this.entries.values()) {
      if (entry.origin.sourcePath !== sourcePath) continue;
      entry.sourceAvailable = false;
      changed = true;
    }
    if (changed) this.emit();
  }

  async closeAll(): Promise<void> {
    const entries = [...this.entries.values()];
    await Promise.all(entries.map(async (entry) => {
      entry.sessionStateDisposable?.dispose();
      if (entry.published) await this.sessionManager.close(entry.id);
      await entry.terminal.dispose({ preserveSession: true });
    }));
    this.entries.clear();
    this.instanceIdsByOrigin.clear();
    this.subscribers.clear();
  }

  private preparedHandle(entry: TerminalInstanceEntry): PreparedTerminalInstance {
    return {
      instanceId: entry.id,
      attach: (host) => {
        const registration = this.registerHost(entry.id, host);
        this.activate(entry.id, host.id);
        return registration;
      },
      connect: () => entry.terminal.connect(),
      disposeIfUnused: () => {
        if (!entry.published) this.deleteEntry(entry);
      }
    };
  }

  private createManagerAdapter(instanceId: string): TerminalSessionManager {
    return {
      connect: (_ignored, target) => this.connect(instanceId, target),
      write: (_ignored, data) => this.sessionManager.write(instanceId, data),
      resize: (_ignored, rows, cols, height, width) => {
        this.sessionManager.resize(instanceId, rows, cols, height, width);
      },
      close: () => this.disconnect(instanceId)
    };
  }

  private connect(
    instanceId: string,
    target: SshConnectionTarget
  ): Promise<Pick<ManagedSession, "onData" | "onStateChange">> {
    const entry = this.requireEntry(instanceId);
    if (entry.connecting) return entry.connecting;
    entry.published = true;
    entry.status = "connecting";
    this.touch(entry);
    const connecting = this.sessionManager.connect(instanceId, target).then(
      (session) => {
        entry.sessionStateDisposable?.dispose();
        entry.sessionStateDisposable = session.onStateChange((state) => {
          if (state === "closed") entry.status = "disconnected";
          if (state === "failed") entry.status = "failed";
          if (state === "connected") entry.status = "connected";
          this.touch(entry);
        });
        entry.status = "connected";
        this.touch(entry);
        return session;
      },
      (error: unknown) => {
        entry.status = "failed";
        this.touch(entry);
        throw error;
      }
    ).finally(() => {
      delete entry.connecting;
    });
    entry.connecting = connecting;
    return connecting;
  }

  private deleteEntry(entry: TerminalInstanceEntry): void {
    entry.sessionStateDisposable?.dispose();
    entry.terminal.detach();
    void entry.terminal.dispose({ preserveSession: true });
    this.entries.delete(entry.id);
    this.instanceIdsByOrigin.delete(serializeOrigin(entry.origin));
    this.emit();
  }

  private requireEntry(instanceId: string): TerminalInstanceEntry {
    const entry = this.entries.get(instanceId);
    if (!entry) throw new Error(`SSH terminal instance not found: ${instanceId}`);
    return entry;
  }

  private touch(entry: TerminalInstanceEntry): void {
    entry.lastActiveAt = this.now();
    if (entry.published) this.emit();
  }

  private emit(): void {
    for (const subscriber of this.subscribers) subscriber();
  }
}

function serializeOrigin(origin: TerminalOrigin): string {
  return `${origin.sourcePath}\u0000${origin.blockKey}`;
}

function snapshot(entry: TerminalInstanceEntry): TerminalInstanceSnapshot {
  return {
    id: entry.id,
    displayName: entry.displayName,
    origin: { ...entry.origin },
    sourceAvailable: entry.sourceAvailable,
    status: entry.status,
    location: { ...entry.location },
    lastActiveAt: entry.lastActiveAt
  };
}
