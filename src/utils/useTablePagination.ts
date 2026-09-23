import { useState } from 'react';
import type { TablePaginationConfig } from 'antd';
import { useT } from '../i18n';

const PAGE_SIZE_KEY = 'morihome.pageSize';
const PAGE_SIZES = [15, 50, 100];

function readPageSize(): number {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(n) ? n : 15;
  } catch {
    return 15;
  }
}

/**
 * 統一嘅 pagination：每頁 15 / 50 / 100（記喺 localStorage，全站同一個），
 * 底部左邊「第 a–b 項，共 n 項」，右邊頁碼。篩選一變就跳返第一頁。
 */
export function useTablePagination(total: number): TablePaginationConfig {
  const t = useT();
  const [pageSize, setPageSize] = useState(readPageSize);
  const [current, setCurrent] = useState(1);
  const [seenTotal, setSeenTotal] = useState(total);
  if (total !== seenTotal) {
    setSeenTotal(total);
    setCurrent(1);
  }
  return {
    current,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZES,
    showTotal: (n, r) => t('common.pageTotal', { from: r[0], to: r[1], total: n.toLocaleString('en-HK') }),
    onChange: (page, size) => {
      setCurrent(size !== pageSize ? 1 : page);
      if (size !== pageSize) {
        setPageSize(size);
        try {
          localStorage.setItem(PAGE_SIZE_KEY, String(size));
        } catch {
          // fine
        }
      }
    },
  };
}
