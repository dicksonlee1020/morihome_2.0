import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from 'antd';
import type { ReactNode } from 'react';
import { AuthContext } from '../../auth/context';
import { listAccounts } from '../../auth/mockAuthService';
import { LocaleProvider } from '../../i18n';
import { LocationsTab, FinanceCategoriesTab, PaymentSettingsTab, ExpensePolicyTab } from './MasterSettingsTabs';
import { SettingsPage } from './SettingsPage';

function render(node: ReactNode, userId = 'u-ocean') {
  const user = listAccounts().find(u => u.id === userId)!;
  return renderToString(<LocaleProvider><AuthContext value={{ status: 'authenticated', session: null, user, signIn: async () => ({ ok: false, error: 'invalid' }), signInWithGoogle: async () => ({ ok: false, error: 'invalid' }), signOut: () => {}, markPasswordChanged: () => {} }}><App>{node}</App></AuthContext></LocaleProvider>);
}
describe('v14 settings render smoke (SSR, not browser/visual QA)', () => {
  it('renders locations, aliases and the pending warehouse without errors', () => {
    const html = render(<LocationsTab />);
    expect(html).toContain('觀塘倉庫17室'); expect(html).toContain('待確認');
  });
  it('renders all 16 daily category entries and reporting definitions', () => {
    const html = render(<FinanceCategoriesTab />);
    expect(html).toContain('D16'); expect(html).toContain('未知成本不填零');
  });
  it('renders unmapped payments honestly with no company account invented', () => {
    const html = render(<PaymentSettingsTab />);
    expect(html).toContain('尚未設定公司帳戶'); expect(html).toContain('匯款公司付款');
  });
  it('renders fixed Ocean approval rules and the settings sandbox', () => {
    const html = render(<ExpensePolicyTab />);
    expect(html).toContain('沒有金額豁免'); expect(html).toContain('設定驗證情境');
  });
  it('includes new sections for both admins and only appropriate tabs for finance', () => {
    const html = render(<SettingsPage />, 'u-dickson');
    expect(html).toContain('收付款設定'); expect(html).toContain('門店／倉庫');
    const finance = render(<SettingsPage />, 'u-manman');
    expect(finance).not.toContain('id="rc-tabs-0-tab-accounts"');
  });
});
