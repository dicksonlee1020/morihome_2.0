import { useState } from 'react';
import { Button, Checkbox, Divider, Flex, Popover, Typography } from 'antd';
import type { ReactNode } from 'react';
import { CloseOutlined, DownOutlined } from '@ant-design/icons';
import { colors } from '../theme';
import { useT } from '../i18n';

const { Text } = Typography;

export interface FilterOption<V extends string> {
  value: V;
  label: ReactNode;
}

/**
 * 表格上面嘅篩選 chip（Ocean 2026-09-23 畀嘅參考圖）：
 * 「供應商 · 3 selected ▾ ×」，撳落去係一個 checkbox 清單 + 全選。
 * 圓角、邊框、高度全部跟 theme 控件，唔另起一套。
 */
export function FilterChip<V extends string>({
  label,
  options,
  value,
  onChange,
  renderSelected,
}: {
  label: string;
  options: FilterOption<V>[];
  value: V[];
  onChange: (next: V[]) => void;
  /** 只揀咗一個時，chip 上顯示乜（預設顯示個 option label） */
  renderSelected?: (v: V) => ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const all = value.length === options.length;
  const none = value.length === 0;

  const summary: ReactNode = none ? (
    <Text type="secondary">{t('filter.any')}</Text>
  ) : value.length === 1 ? (
    renderSelected ? renderSelected(value[0]) : options.find((o) => o.value === value[0])?.label
  ) : (
    <Flex align="center" gap={6}>
      <span
        style={{
          minWidth: 20,
          padding: '0 6px',
          borderRadius: 999,
          background: colors.primarySubtle,
          color: colors.primary,
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {value.length}
      </span>
      <Text style={{ fontWeight: 500 }}>{t('filter.selected')}</Text>
    </Flex>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={setOpen}
      styles={{ container: { padding: 8, minWidth: 240 } }}
      content={
        <Flex vertical>
          <Flex vertical gap={2} style={{ maxHeight: 320, overflow: 'auto' }}>
            {options.map((o) => (
              <label
                key={o.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                <Checkbox
                  checked={value.includes(o.value)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))
                  }
                />
                {o.label}
              </label>
            ))}
          </Flex>
          <Divider style={{ margin: '6px 0' }} />
          <Flex align="center" justify="space-between" style={{ padding: '2px 8px' }}>
            <Text style={{ fontWeight: 500 }}>{t('filter.selectAll')}</Text>
            <Checkbox
              checked={all}
              indeterminate={!all && !none}
              onChange={(e) => onChange(e.target.checked ? options.map((o) => o.value) : [])}
            />
          </Flex>
        </Flex>
      }
    >
      <Flex
        align="center"
        gap={8}
        style={{
          height: 36,
          padding: '0 6px 0 12px',
          border: `1px solid ${none ? colors.borderStrong : colors.primary}`,
          borderRadius: 6,
          background: colors.surface,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Text type="secondary">{label}</Text>
        {summary}
        <DownOutlined style={{ fontSize: 11, color: colors.textSecondary }} />
        {!none && (
          <Button
            type="text"
            size="small"
            aria-label={t('common.clear')}
            icon={<CloseOutlined style={{ fontSize: 11 }} />}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            style={{ marginInlineStart: -2 }}
          />
        )}
      </Flex>
    </Popover>
  );
}
