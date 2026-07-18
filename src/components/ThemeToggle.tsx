import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves the theme only on the client; render a stable
  // placeholder until mounted to avoid a hydration flicker.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full px-3"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted ? (isDark ? "🌙" : "☀️") : "☀️"}
    </Button>
  );
};
