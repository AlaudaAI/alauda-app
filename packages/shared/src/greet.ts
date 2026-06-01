// One shared helper. Both apps import it. Edit this file → both apps' dev
// servers hot-reload simultaneously via pnpm workspace symlink. That's the
// whole demo.
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
