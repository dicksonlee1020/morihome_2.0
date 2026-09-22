import { useEffect, useState } from 'react';

/**
 * 密集畫面嘅表格高度跟住視窗走 —— 大螢幕就應該一屏見多幾行，
 * 唔係寫死一個 520 之後下面吊住一大截白位。
 * offset = 表格上面所有嘢（header、標題、統計卡、篩選列）嘅總高。
 */
export function useTableHeight(offset = 460, min = 280) {
  const compute = () =>
    typeof window === 'undefined' ? min : Math.max(min, window.innerHeight - offset);

  const [height, setHeight] = useState(compute);

  useEffect(() => {
    const onResize = () => setHeight(compute);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, min]);

  return height;
}
