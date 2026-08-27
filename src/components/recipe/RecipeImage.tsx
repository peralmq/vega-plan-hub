import { useCallback } from "react";

// Shared fallback path for every recipe image render (Cook Mode, the pool
// picker, Plan Mode). recipe-format.spec now requires a non-empty
// imageUrl, but the URL still points at a third-party site we don't
// control — a source recipe blog reshuffling its media library, or a dead
// stock-photo link, shows up as a runtime 404/hotlink-block, not something
// `./harness validate-recipe` can catch (that gate stays offline and
// deterministic; see docs/execplans/p4-13-recipe-images.md Non-goals).
// This component is the single place that swaps a broken image for
// public/placeholder.svg so no page ever renders a broken-image icon.
const PLACEHOLDER_SRC = "/placeholder.svg";

type RecipeImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

export function RecipeImage({ onError, src, ...rest }: RecipeImageProps) {
  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const img = e.currentTarget;
      // Guard against a loop if placeholder.svg itself ever fails to load.
      if (!img.src.endsWith(PLACEHOLDER_SRC)) {
        img.src = PLACEHOLDER_SRC;
      }
      onError?.(e);
    },
    [onError],
  );

  return <img src={src || PLACEHOLDER_SRC} onError={handleError} {...rest} />;
}
