import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * 最外層兜底：render 出錯時顯示錯誤文字同 reload 掣，唔好留一個白畫面
 * （手機 Safari 喺 iframe 入面封鎖 storage 嗰類問題，冇呢層根本睇唔到原因）。
 * 喺 i18n provider 之外，所以文字係寫死嘅——係唯一例外。
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>載入失敗 / Failed to load</h1>
        <p style={{ color: '#727272', margin: '0 0 12px' }}>請截圖以下錯誤訊息，然後重新載入。</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#F8F8F8', padding: 12, borderRadius: 6 }}>
          {String(this.state.error)}
        </pre>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 12, minHeight: 48, padding: '0 20px' }}>
          重新載入 / Reload
        </button>
      </div>
    );
  }
}
