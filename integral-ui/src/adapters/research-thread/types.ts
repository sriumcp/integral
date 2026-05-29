/**
 * Research-thread adapter — browser-safe types.
 *
 * Mirrors the transport's ResearchThreadDescriptor shape but stays in
 * `src/` so the pure interpreter can import it without dragging Node
 * APIs into the browser bundle. (Same discipline as the Nous /
 * Coral / Feature adapters: types here, transport in
 * `vite-plugin-nous-adapter/`.)
 */

export interface ResearchThreadDescriptor {
  /** Subdirectory name; becomes the thread's user-visible label. */
  name: string
  /** Absolute filesystem path to the thread's directory. */
  rootPath: string
  /** Last-modified timestamp of the directory itself, ISO 8601. */
  lastModified: string
}

/**
 * Abstract transport interface — same contract as the Node-only
 * implementation. Tests + browser-safe code consume this shape; the
 * transport implementation lives in `vite-plugin-nous-adapter/`.
 */
export interface ResearchThreadSource {
  readonly id: string
  readonly label: string
  readonly path: string
  listThreads(): Promise<ResearchThreadDescriptor[]>
}
