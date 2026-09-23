import { useT } from '../i18n';

type Variant = 'lockup' | 'mark' | 'wordmark';

/**
 * Brand logo, cut from the Canva master by scripts/cut-logo.py into
 * public/brand/. Pick the variant by how much room there is:
 *   lockup   — mark + wordmark, header on desktop, sign-in page
 *   mark     — the roof "M" alone, phone header, favicon-ish spots
 *   wordmark — the words alone, rarely needed
 */
export function Logo({
  variant = 'lockup',
  height = 28,
  style,
}: {
  variant?: Variant;
  height?: number;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const base = `${import.meta.env.BASE_URL}brand/`;

  // Serve a file with at least 2x the displayed pixels so it stays crisp on
  // retina screens without shipping the full-size cut everywhere.
  const src =
    variant === 'lockup'
      ? height <= 48
        ? { src: `${base}logo-lockup@h48.png`, srcSet: `${base}logo-lockup@h96.png 2x` }
        : { src: `${base}logo-lockup@h160.png`, srcSet: `${base}logo-lockup.png 2x` }
      : variant === 'mark'
        ? height <= 32
          ? { src: `${base}logo-mark-64.png`, srcSet: `${base}logo-mark-128.png 2x` }
          : { src: `${base}logo-mark-128.png`, srcSet: `${base}logo-mark-256.png 2x` }
        : { src: `${base}logo-wordmark.png` };

  return (
    <img
      {...src}
      alt={t('auth.brand.name')}
      // `height` is a ceiling: in a narrow column the image shrinks with its
      // container instead of spilling out, keeping the aspect ratio either way.
      style={{
        display: 'block',
        width: 'auto',
        height: 'auto',
        maxHeight: height,
        maxWidth: '100%',
        ...style,
      }}
      draggable={false}
    />
  );
}
