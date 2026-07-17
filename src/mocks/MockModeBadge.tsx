// Fixed-position "mock mode" indicator, rendered only when VITE_MOCK_AUTH is
// set (docs/execplans/p2-02-mock-auth-mode.md). Keeps a mock-mode screenshot
// from ever being mistaken for real data.

export function MockModeBadge() {
  return (
    <div className="fixed bottom-3 right-3 z-50 rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground shadow-playful">
      🧪 Mock mode — not real data
    </div>
  );
}
