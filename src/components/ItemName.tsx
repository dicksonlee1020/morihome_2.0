import { Flex, Segmented, Tooltip, Typography } from 'antd';
import { colors } from '../theme';
import { setNameDisplay, useNameDisplay } from '../utils/nameDisplay';
import { useT } from '../i18n';
import type { Product } from '../types';

const { Text } = Typography;

/**
 * 分類配色嘅縮圖。真相片會由 Shopify 同步層嚟（唔郁同步層，只讀）；
 * 廠家嗰邊有冇圖要問 Ocean（backlog B-07）。呢度先畫個有分類字頭嘅方塊，
 * 等同事對住兩個名時有個錨。
 */
const HUES: Record<string, string> = {
  sofa: colors.sand,
  table: '#DCCFBF',
  chair: '#E8DED0',
  bed: '#D9D3C4',
  mattress: '#E6E3DA',
  wardrobe: '#CFC6B5',
  shelf: '#D6CCBA',
  cabinet: '#C9BBA6',
  coffee: '#E2D6C4',
  side: '#E4DACB',
  lamp: '#EFE6CE',
  rug: '#D8D2C6',
  mirror: '#E3E3DF',
  storage: '#E6DCC8',
  bedding: '#EDE9E0',
  decor: '#E9E1D2',
};

export function Thumb({ product, size = 36 }: { product: Product; size?: number }) {
  const bg = HUES[product.categoryKey] ?? colors.warm;
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 6,
        background: bg,
        color: colors.wood,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 32 ? 11 : 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
      }}
    >
      {product.sku.slice(0, 2)}
    </div>
  );
}

/**
 * 主名 + 副名。主名跟 per-user 設定（出街名 / 廠家名），另一個名細字跟住，
 * 兩邊都對得到。`thumb` 加縮圖，`compact` 只出主名（表格窄欄）。
 */
export function ItemName({
  product,
  thumb = false,
  compact = false,
  variant = true,
}: {
  product: Product;
  thumb?: boolean;
  compact?: boolean;
  variant?: boolean;
}) {
  const mode = useNameDisplay();
  const own = variant ? `${product.name} · ${product.variant}` : product.name;
  const supplier = `${product.supplierCode} ${product.supplierName}`;
  const primary = mode === 'own' ? own : supplier;
  const secondary = mode === 'own' ? supplier : own;
  return (
    <Flex gap={8} align="center" style={{ minWidth: 0 }}>
      {thumb && <Thumb product={product} />}
      <Flex vertical style={{ minWidth: 0, lineHeight: 1.35 }}>
        <Text ellipsis={{ tooltip: primary }} style={{ fontWeight: 500 }}>
          {primary}
        </Text>
        {!compact && (
          <Text type="secondary" ellipsis={{ tooltip: secondary }} style={{ fontSize: 13 }}>
            {secondary}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}

/** 頁面工具列用嘅切換掣 */
export function NameDisplaySwitch() {
  const t = useT();
  const mode = useNameDisplay();
  return (
    <Tooltip title={t('products.nameDisplay.hint')}>
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setNameDisplay(v as 'own' | 'supplier')}
        options={[
          { value: 'own', label: t('products.nameDisplay.own') },
          { value: 'supplier', label: t('products.nameDisplay.supplier') },
        ]}
      />
    </Tooltip>
  );
}
