import { useEffect, useState } from 'react';

/**
 * UI 規範：每個 table 有 loading skeleton。示範資料係即時嘅，所以開頁先扮 300ms
 * 載入，等同事睇到 skeleton 個樣；接真 API 就換成 query 嘅 isLoading。
 */
export function useMockLoading(ms = 300): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return loading;
}
