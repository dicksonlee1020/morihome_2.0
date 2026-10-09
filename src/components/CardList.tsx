import { Empty, Flex, Pagination } from 'antd';
import type { ReactNode } from 'react';
import * as React from 'react';
import { useT as MoriUseT } from '../i18n/hooks';
import { colors } from '../theme';
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
  let a = MoriUseT();
  let [page, setPage] = React.useState<any>(1);
  let [seen, setSeen] = React.useState<any>(items);
  if (items !== seen) {
    {
      setSeen(items);
      setPage(1);
    }
  }
  let slice = React.useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );
  let d = Math.min(items.length, (page - 1) * pageSize + 1);
  let f = Math.min(items.length, page * pageSize);
  return items.length === 0 ? (
    <Empty description={emptyText ?? a(`common.empty`)} />
  ) : (
    <Flex vertical={true} gap={8}>
      {slice.map((e: any) => (
        <div key={rowKey(e)}>{renderItem(e)}</div>
      ))}
      <Flex
        vertical={true}
        gap={4}
        align={`center`}
        style={{
          width: `100%`,
          paddingTop: 4,
        }}
      >
        {
          <span
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              lineHeight: 1.4,
              textAlign: `center`,
              whiteSpace: `normal`,
            }}
          >
            {a(`common.pageTotal`, {
              from: d,
              to: f,
              total: items.length.toLocaleString(`en-HK`),
            })}
          </span>
        }
        <Pagination
          align={`center`}
          size={`small`}
          simple={true}
          current={page}
          pageSize={pageSize}
          total={items.length}
          onChange={setPage}
          showSizeChanger={false}
          style={{
            marginTop: 0,
            maxWidth: `100%`,
          }}
        />
      </Flex>
    </Flex>
  );
}
