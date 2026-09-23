import type { ReactNode } from 'react';
import { Card, Flex, Segmented, Typography } from 'antd';
import { LOCALES, useLocale } from '../../i18n';
import { colors, useIsMobile } from '../../theme';
import { Logo } from '../../components/Logo';

const { Text } = Typography;

/**
 * Artwork under the logo on desktop (Canva design DAG59xpOkik, page 1,
 * 1080x1080). The slot stretches to the card's bottom edge and the photo is
 * centre-cropped into it, so the left column always ends level with the card.
 */
const HERO_SRC = `${import.meta.env.BASE_URL}brand/login-hero.jpg`;

/**
 * Frame shared by sign-in, forgot-password and reset-password.
 * Desktop: logo + system name top-left, artwork below, card on the right,
 * language switch top-right. Phone: logo centred above the card.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { locale, setLocale, t } = useLocale();
  const isMobile = useIsMobile();

  const brand = (
    <Flex vertical gap={8} align={isMobile ? 'center' : 'flex-start'}>
      <Logo variant="lockup" height={isMobile ? 40 : 56} />
      <Text
        style={{
          fontSize: isMobile ? 14 : 16,
          fontWeight: 500,
          letterSpacing: '0.2em',
          color: colors.textSecondary,
          // letter-spacing adds a trailing gap; pull it back so the text
          // stays optically aligned with the logo's left edge
          marginInlineEnd: '-0.2em',
        }}
      >
        {t('auth.brand.system')}
      </Text>
    </Flex>
  );

  const languageSwitch = (
    <Segmented
      size="small"
      value={locale}
      onChange={(v) => setLocale(v as typeof locale)}
      options={LOCALES}
    />
  );

  if (isMobile) {
    return (
      <Flex vertical style={{ minHeight: '100vh', background: colors.warm }}>
        <Flex justify="flex-end" style={{ padding: '12px 16px 0' }}>
          {languageSwitch}
        </Flex>
        <Flex vertical align="center" justify="center" style={{ padding: '28px 16px 24px' }}>
          {brand}
        </Flex>
        <div style={{ padding: '0 16px 24px' }}>
          <Card
            styles={{ body: { padding: 20 } }}
            style={{ boxShadow: '0 4px 6px -2px rgba(26,26,26,0.20)' }}
          >
            {children}
          </Card>
        </div>
      </Flex>
    );
  }

  return (
    <Flex
      vertical
      style={{ minHeight: '100vh', background: colors.warm, position: 'relative' }}
    >
      <div style={{ position: 'absolute', top: 24, right: 32 }}>{languageSwitch}</div>

      {/* No flex:1 here on purpose: the row must be as tall as the card, not
          the viewport, so the artwork ends level with the card's bottom. */}
      <Flex
        align="stretch"
        justify="center"
        gap={64}
        style={{ padding: '96px 64px 48px' }}
      >
        <Flex vertical gap={28} style={{ flex: '0 1 560px', minWidth: 0 }}>
          {brand}
          <div
            style={{
              width: '100%',
              // basis 0 + absolute image: the block takes whatever height the
              // card leaves, never the photo's own 1:1 height
              flex: '1 1 0',
              minHeight: 320,
              position: 'relative',
              borderRadius: 10,
              overflow: 'hidden',
              background: colors.sand,
            }}
          >
            <img
              src={HERO_SRC}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              draggable={false}
              // Until the artwork is in public/brand/, show the sand block
              // rather than a broken-image icon.
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        </Flex>

        <Flex vertical align="stretch" justify="flex-start" style={{ flex: '0 1 440px', minWidth: 0 }}>
          <Card
            styles={{ body: { padding: 32 } }}
            style={{ boxShadow: '0 4px 6px -2px rgba(26,26,26,0.20)' }}
          >
            {children}
          </Card>
        </Flex>
      </Flex>
    </Flex>
  );
}
