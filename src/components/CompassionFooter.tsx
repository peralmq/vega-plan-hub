// The version line answers "is my change deployed yet?" — the stamp is the
// LAST COMMIT's time (not the build's), injected by vite.config.ts, so it
// matches what git log / the bot's publish reply say. sv-SE locale gives a
// neutral ISO-ish rendering in the viewer's own timezone.
const deployStamp = __COMMIT_ISO__
  ? `${new Date(__COMMIT_ISO__).toLocaleString("sv-SE", {
      dateStyle: "short",
      timeStyle: "short",
    })} · ${__COMMIT_SHA__}`
  : __COMMIT_SHA__;

export const CompassionFooter = () => (
  <footer className="text-xs text-muted-foreground text-center py-8 print:hidden">
    <p>cooked with compassion · for the animals, the planet &amp; each other 🐾🌍💚</p>
    <p className="mt-1 opacity-60" title="time of the last commit in this deploy">
      🌱 {deployStamp}
    </p>
  </footer>
);
