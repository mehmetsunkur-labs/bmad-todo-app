import { vi } from "vitest"

export interface FakeAnimation {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  onfinish: (() => void) | null
  oncancel: (() => void) | null
  cancel: ReturnType<typeof vi.fn>
  finish(): void
}

/**
 * Stubs the Web Animations API (jsdom has none) on `HTMLElement.prototype`.
 * Each call is recorded into `animations` and finished by hand; returns the
 * `vi.fn`. Undo with `unstubAnimate()`.
 */
export function stubAnimate(animations: FakeAnimation[] = []) {
  const animate = vi.fn(function (
    this: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) {
    const animation: FakeAnimation = {
      keyframes,
      options,
      onfinish: null,
      oncancel: null,
      cancel: vi.fn(),
      finish() {
        animation.onfinish?.()
      },
    }
    animations.push(animation)
    return animation as unknown as Animation
  })
  Object.defineProperty(HTMLElement.prototype, "animate", {
    value: animate,
    configurable: true,
    writable: true,
  })
  return animate
}

/** Deletes any `stubAnimate` stub (jsdom has no `animate` of its own). */
export function unstubAnimate() {
  delete (HTMLElement.prototype as { animate?: unknown }).animate
}
