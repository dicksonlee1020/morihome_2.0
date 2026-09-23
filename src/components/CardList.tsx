import { useMemo, useState } from 'react';
import { Empty, Flex, Pagination } from 'antd';
import type { ReactNode } from 'react';
import { useT } from '../i18n';

interface CardListProps<T> {
  items: T[];
  rowKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  pageSize?: number;
  emptyText?: string;
}

/**
 * 手機版卡片列表。
 * antd 6 嘅 List 已經標咗 deprecated，而 Listy 係虛擬列表、冇分頁，
 * 唔係 drop-in。要嘅嘢其實得「切一頁 + 一個分頁器」，自己砌反而乾淨。
 */
export function CardList<T>({
  items,
  rowKey,
  renderItem,
  pageSize = 10,
  emptyText,
}: CardListProps<T>) {
  const t = useT();
  const [page, setPage] = useState(1);
  const [seen, setSeen] = useState(items);

  // 篩選一變就跳返第一頁，否則會停喺一版空白。
  // 喺 render 期間校正（React 官方做法），擺落 effect 會多 render 一次仲會閃。
  if (items !== seen) {
    setSeen(items);
    setPage(1);
  }

  const slice = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  if (items.length === 0) return <Empty description={emptyText ?? t('common.empty')} />;

  return (
    <Flex vertical gap={8}>
      {slice.map((item) => (
        <div key={rowKey(item)}>{renderItem(item)}</div>
      ))}
      <Pagination
        align="center"
        size="small"
        current={page}
        pageSize={pageSize}
        total={items.length}
        onChange={setPage}
        showSizeChanger={false}
        showTotal={(total, r) =>
          t('common.pageTotal', { from: r[0], to: r[1], total: total.toLocaleString('en-HK') })
        }
        style={{ marginTop: 4 }}
      />
    </Flex>
  );
}
