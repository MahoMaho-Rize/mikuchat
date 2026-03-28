// Register <img> as a custom OpenTUI element
import { extend } from "@opentui/solid"
import { ImageRenderable } from "./image-renderable"

extend({ img: ImageRenderable as any })

// Augment JSX types
declare module "@opentui/solid" {
  interface OpenTUIComponents {
    img: typeof ImageRenderable
  }
}
