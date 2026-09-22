import type { ReactNode } from 'react';
import { Card, Flex, Segmented, Typography } from 'antd';
import { LOCALES, useLocale } from '../../i18n';
import { colors, useIsMobile } from '../../theme';

const { Text, Title } = Typography;

/**
 * Frame shared by sign-in, forgot-password and reset-password.
 * Brand panel on the left, one card on the right; on a phone the panel
 * collapses to a header so the form is the first thing on screen.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { locale, setLocale, t } = useLocale();
  const isMobile = useIsMobile();

  return (
    <Flex
      vertical
      style={{ minHeight: '100vh', background: colors.warm }}
    >
      <Flex
        wrap
        align="stretch"
        justify="center"
        style={{ flex: 1, padding: isMobile ? 16 : 32 }}
      >
        <Flex
          vertical
          justify={isMobile ? 'flex-start' : 'center'}
          gap={isMobile ? 8 : 20}
          style={{
            flex: isMobile ? '1 1 100%' : '1 1 320px',
            maxWidth: 480,
            padding: isMobile ? '8px 4px 20px' : '24px 40px 24px 8px',
          }}
        >
          <Flex align="center" gap={12}>
            <div
              aria-hidden
              style={{
                width: isMobile ? 36 : 48,
                height: isMobile ? 36 : 48,
                borderRadius: 10,
                background: colors.primary,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: isMobile ? 18 : 24,
              }}
            >
              m
            </div>
            <Flex vertical gap={0}>
              <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>
                {t('auth.brand.name')}
              </Title>
              <Text type="secondary">{t('auth.brand.system')}</Text>
            </Flex>
          </Flex>
          {!isMobile && (
            <Text style={{ color: colors.textSecondary, fontSize: 16 }}>
              {t('auth.brand.tagline')}
            </Text>
          )}
        </Flex>

        <Flex
          vertical
          justify="center"
          style={{ flex: isMobile ? '1 1 100%' : '0 1 440px' }}
        >
          <Card
            styles={{ body: { padding: isMobile ? 20 : 32 } }}
            style={{ boxShadow: '0 4px 6px -2px rgba(26,26,26,0.20)' }}
          >
            {children}
          </Card>
        </Flex>
      </Flex>

      <Flex justify="center" style={{ padding: '0 16px 20px' }}>
        <Segmented
          size="small"
          value={locale}
          onChange={(v) => setLocale(v as typeof locale)}
          options={LOCALES}
        />
      </Flex>
    </Flex>
  );
}
