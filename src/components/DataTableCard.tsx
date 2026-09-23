import { Button, Card, Flex, Input, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { SearchOutlined } from '@ant-design/icons';
import { colors, useIsMobile } from '../theme';
import { useT } from '../i18n';

const { Text } = Typography;

/**
 * 每個有 table 嘅頁都用同一個結構（Dickson 2026-09-23）：
 *   filter chip 行（左）+ 搜尋 / 切換 / 主動作（右）
 *   數量一行（有揀行就變成批量操作列）
 *   table + pagination（手機換卡片列表）
 */
export function DataTableCard({
  filters,
  onClearFilters,
  search,
  extra,
  count,
  selection,
  mobile,
  children,
}: {
  filters?: ReactNode;
  /** 有值就出「清除篩選」 */
  onClearFilters?: () => void;
  search?: { value: string; onChange: (v: string) => void; placeholder: string; width?: number };
  extra?: ReactNode;
  /** 篩選後幾多行 */
  count: ReactNode;
  selection?: { count: number; text: ReactNode; actions: ReactNode; onClear: () => void };
  mobile?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const isMobile = useIsMobile();
  const selecting = selection && selection.count > 0;

  return (
    <Card styles={{ body: { paddingTop: 12 } }}>
      <Flex vertical gap={12}>
        <Flex gap={8} wrap align="center">
          {filters}
          {onClearFilters && (
            <Button type="text" size="small" onClick={onClearFilters}>
              {t('filter.clearAll')}
            </Button>
          )}
          {!isMobile && <span style={{ flexGrow: 1 }} />}
          {search && (
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: colors.textMuted }} />}
              placeholder={search.placeholder}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              style={{ width: isMobile ? '100%' : (search.width ?? 260) }}
            />
          )}
          {extra}
        </Flex>

        {selecting ? (
          <Flex
            align="center"
            justify="space-between"
            wrap
            gap={8}
            style={{ padding: '6px 12px', background: colors.primarySubtle, borderRadius: 6 }}
          >
            <Text>{selection.text}</Text>
            <Space wrap>
              {selection.actions}
              <Button size="small" type="text" onClick={selection.onClear}>
                {t('common.clear')}
              </Button>
            </Space>
          </Flex>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {count}
          </Text>
        )}

        {isMobile && mobile ? mobile : children}
      </Flex>
    </Card>
  );
}
