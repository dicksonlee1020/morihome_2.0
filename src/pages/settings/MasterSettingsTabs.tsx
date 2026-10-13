import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Flex, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAuth } from '../../auth';
import type { StaffUser } from '../../auth';
import { useAccounts } from '../../data/admin';
import { DataTableCard } from '../../components/DataTableCard';
import { useV14Text } from '../../i18n/v14';
import {
  useSettings, canManage, saveLocation, saveCategory, savePaymentAccount, savePaymentMethod,
  revisePolicy, createScenario, approveScenario, reportRules, categorySourceVersion,
} from '../../data/settingsV14';
import type { Location, Category, PaymentAccount, PaymentMethod, ExpensePolicy, Result, Scenario } from '../../data/settingsV14';
const { Text, Paragraph } = Typography;

function useEditor() {
  const { user } = useAuth(); const { message } = App.useApp(); const l = useV14Text();
  return { me: user as StaffUser, l, report: (r: Result<unknown>) => {
    if (r.ok) message.success(l('已儲存')); else {
      const errors: Record<string, string> = { forbidden: l('沒有此操作權限'), duplicate: l('名稱必須填寫，並且不可重複'), pending: l('請先確認實際地點名稱'), notFound: l('記錄不存在或已處理'), inactive: l('所選資料已停用，請重新選擇'), mapping: l('請先確認渠道名稱及連結啟用中的帳戶'), currency: l('客戶收款及入帳帳戶只支援 HKD'), inUse: l('已有付款方式連結此帳戶，不可更改幣種'), required: l('請填寫必要資料') };
      message.error(errors[r.error] ?? r.error);
    }
    return r.ok;
  } };
}

export function LocationsTab() {
  const s = useSettings(); const { me, l, report } = useEditor();
  const [editing, setEditing] = useState<Location | null>(null); const [form] = Form.useForm<Location>();
  const [keyword, setKeyword] = useState(''); const editable = canManage(me, 'locations');
  const open = (row: Location) => { setEditing(row); form.setFieldsValue(row); };
  const status = (v: Location['status']) => l(v === 'active' ? '啟用' : v === 'inactive' ? '停用' : '待確認');
  const columns: TableColumnsType<Location> = [
    { title: l('地點'), dataIndex: 'name', width: 200 },
    { title: l('類型'), dataIndex: 'kind', render: v => l(v === 'shop' ? '門店' : '倉庫') },
    { title: l('地區'), dataIndex: 'region', render: v => l(v === 'HK' ? '香港' : '內地') },
    { title: l('舊稱／別名'), dataIndex: 'aliases', render: v => v || '—' },
    { title: l('狀態'), dataIndex: 'status', render: v => <Tag color={v === 'active' ? 'green' : v === 'pending' ? 'orange' : undefined}>{status(v)}</Tag> },
    { title: l('操作'), render: (_, r) => <Button disabled={!editable} onClick={() => open(r)}>{l('編輯')}</Button> },
  ];
  return <Flex vertical gap={12}>
    <Alert type="info" showIcon title={l('觀塘為唯一現行門店；觀塘倉與17室為同一地點。')} description={l('停用或待確認地點不供新單選擇；歷史快照保留舊名稱。此清單尚未取代 v13 包件路線資料。')} />
    <DataTableCard count={`${s.locations.length}`} search={{ value: keyword, onChange: setKeyword, placeholder: l('搜尋名稱或別名') }} extra={editable && <Button type="primary" icon={<PlusOutlined />} onClick={() => open({ id: '', name: '', aliases: '', kind: 'warehouse', region: 'HK', status: 'pending' })}>{l('新增地點')}</Button>}>
      <Table rowKey="id" columns={columns} dataSource={s.locations.filter(r => (r.name + r.aliases).includes(keyword))} pagination={false} scroll={{ x: 760 }} />
    </DataTableCard>
    <Modal title={l('地點設定')} open={!!editing} onCancel={() => setEditing(null)} okText={l('儲存')} cancelText={l('取消')} onOk={() => form.validateFields().then(v => { if (report(saveLocation({ ...editing!, ...v }, me))) setEditing(null); })}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={l('地點名稱')} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="aliases" label={l('舊稱／別名')}><Input /></Form.Item>
        <Form.Item name="kind" label={l('類型')}><Select options={[{ value: 'shop', label: l('門店') }, { value: 'warehouse', label: l('倉庫') }]} /></Form.Item>
        <Form.Item name="region" label={l('地區')}><Select options={[{ value: 'HK', label: l('香港') }, { value: 'CN', label: l('內地') }]} /></Form.Item>
        <Form.Item name="status" label={l('狀態')}><Select options={(['active', 'inactive', 'pending'] as const).map(v => ({ value: v, label: status(v) }))} /></Form.Item>
      </Form>
    </Modal>
  </Flex>;
}

export function FinanceCategoriesTab() {
  const s = useSettings(); const { me, l, report } = useEditor(); const [query, setQuery] = useState('');
  const [reserve, setReserve] = useState(false); const [editing, setEditing] = useState<Category | null>(null); const [form] = Form.useForm<Category>();
  const editable = canManage(me, 'finance');
  const rows = s.categories.filter(c => (reserve || !c.reserve) && (c.id + c.name + c.examples).toLowerCase().includes(query.toLowerCase()));
  const columns: TableColumnsType<Category> = [
    { title: l('編號'), dataIndex: 'id', width: 75 },
    { title: l('分類入口'), dataIndex: 'name', width: 180, render: (v, r) => <Space direction="vertical" size={2}><Text strong>{v}</Text>{r.reserve && <Tag>{l('備用')}</Tag>}</Space> },
    { title: l('常用細項／例子'), dataIndex: 'examples', width: 260 },
    { title: l('啟用'), width: 80, render: (_, r) => <Switch aria-label={`${l('啟用')} ${r.id}`} checked={r.active} disabled={!editable} onChange={active => report(saveCategory({ ...r, active }, me))} /> },
    { title: l('操作'), width: 90, render: (_, r) => <Button onClick={() => { setEditing(r); form.setFieldsValue(r); }}>{l('詳情')}</Button> },
  ];
  return <Flex vertical gap={12}>
    <Alert showIcon type="info" title={l('沿用簡化分類 v1：16 個日常入口、7 個備用分類。')} description={l('分類入口不等於會計科目；報銷是付款流程，收款或付款不重複計收入或成本。')} />
    <DataTableCard search={{ value: query, onChange: setQuery, placeholder: l('搜尋編號或分類') }} count={`${rows.length} / ${s.categories.length}`} extra={<Space><Switch checked={reserve} onChange={setReserve} aria-label={l('顯示備用分類')} /><Text>{l('顯示備用分類')}</Text></Space>}>
      <Table rowKey="id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 720 }} />
    </DataTableCard>
    <Card title={l('Ocean 報表口徑')} size="small"><Paragraph>{l('管理歸屬跟原訂單月份；實際收付款及會計期間分開保留。未知成本不填零，月結快照不覆寫。')}</Paragraph><Table rowKey="order" size="small" dataSource={reportRules} pagination={false} scroll={{ x: 680 }} columns={[{ title: l('報表項目'), dataIndex: 'name', width: 180 }, { title: l('組成／算法'), dataIndex: 'formula' }, { title: l('月份與限制'), dataIndex: 'note' }]} /><Text type="secondary">{categorySourceVersion}</Text></Card>
    <Modal title={`${editing?.id ?? ''} ${l('分類詳情')}`} open={!!editing} onCancel={() => setEditing(null)} okText={l('儲存')} cancelText={l('取消')} okButtonProps={{ disabled: !editable }} onOk={() => form.validateFields().then(v => { if (report(saveCategory({ ...editing!, ...v }, me))) setEditing(null); })}>
      <Form form={form} layout="vertical"><Form.Item label={l('分類入口')} name="name" rules={[{ required: true, whitespace: true }]}><Input disabled={!editable} /></Form.Item><Form.Item label={l('啟用')} name="active" valuePropName="checked"><Switch disabled={!editable} /></Form.Item></Form>
      <Descriptions column={1} items={[{ key: 'a', label: l('必須分清'), children: editing?.caution }, { key: 'b', label: l('Ocean 報表處理'), children: editing?.report || '—' }]} />
    </Modal>
  </Flex>;
}

export function PaymentSettingsTab() {
  const s = useSettings(); const { me, l, report } = useEditor(); const editable = canManage(me, 'finance');
  const [account, setAccount] = useState<PaymentAccount | null>(null); const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [af] = Form.useForm<PaymentAccount>(); const [mf] = Form.useForm<PaymentMethod>();
  const direction = Form.useWatch('direction', mf);
  const openAccount = (a: PaymentAccount) => { setAccount(a); af.setFieldsValue(a); };
  const openMethod = (m: PaymentMethod) => { setMethod(m); mf.setFieldsValue(m); };
  return <Flex vertical gap={12}>
    <Alert type="warning" showIcon title={l('實際公司帳戶及渠道映射待確認。')} description={l('先建立帳戶，再連結付款方式；未連結的方式不可啟用。只填帳戶名稱及幣種，不需登入資料。')} />
    <Card title={l('公司收付款帳戶')} extra={editable && <Button icon={<PlusOutlined />} onClick={() => openAccount({ id: '', name: '', currency: 'HKD', active: true })}>{l('新增帳戶')}</Button>}>
      <Table rowKey="id" dataSource={s.accounts} pagination={false} scroll={{ x: 500 }} locale={{ emptyText: l('尚未設定公司帳戶') }} columns={[{ title: l('帳戶名稱'), dataIndex: 'name' }, { title: l('入帳幣種'), dataIndex: 'currency' }, { title: l('狀態'), render: (_, r) => l(r.active ? '啟用' : '停用') }, { title: l('操作'), render: (_, r) => <Button disabled={!editable} onClick={() => openAccount(r)}>{l('編輯')}</Button> }]} />
    </Card>
    <Card title={l('收付款方式')} extra={editable && <Button icon={<PlusOutlined />} onClick={() => openMethod({ id: '', name: '', direction: 'receipt', currency: 'HKD', accountId: null, active: false })}>{l('新增方式')}</Button>}>
      <Table rowKey="id" dataSource={s.methods} pagination={false} scroll={{ x: 750 }} columns={[{ title: l('方式名稱'), dataIndex: 'name' }, { title: l('用途'), render: (_, r) => l(r.direction === 'receipt' ? '客戶收款' : '公司付款') }, { title: l('交易幣種'), dataIndex: 'currency' }, { title: l('連結帳戶'), render: (_, r) => s.accounts.find(a => a.id === r.accountId)?.name ?? l('待設定') }, { title: l('狀態'), render: (_, r) => <Tag color={r.active ? 'green' : 'orange'}>{l(r.active ? '啟用' : '未啟用')}</Tag> }, { title: l('操作'), render: (_, r) => <Button disabled={!editable} onClick={() => openMethod(r)}>{l('編輯')}</Button> }]} />
      <Paragraph type="secondary" style={{ marginTop: 12 }}>{l('客戶 HKD；成本 HKD／RMB。經匯款公司付款須保留供應商原幣金額、實際扣款幣種／金額、匯率及手續費；此頁只設定渠道，不執行匯款。')}</Paragraph>
    </Card>
    <Modal title={l('帳戶設定')} open={!!account} onCancel={() => setAccount(null)} okText={l('儲存')} cancelText={l('取消')} onOk={() => af.validateFields().then(v => { if (report(savePaymentAccount({ ...account!, ...v }, me))) setAccount(null); })}>
      <Form form={af} layout="vertical"><Form.Item label={l('帳戶名稱')} name="name" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item><Form.Item label={l('入帳幣種')} name="currency"><Select options={['HKD', 'RMB'].map(value => ({ value }))} /></Form.Item><Form.Item label={l('啟用')} name="active" valuePropName="checked"><Switch /></Form.Item></Form><Text type="secondary">{l('停用帳戶會同步停用連結的付款方式，歷史資料保留。')}</Text>
    </Modal>
    <Modal title={l('付款方式設定')} open={!!method} onCancel={() => setMethod(null)} okText={l('儲存')} cancelText={l('取消')} onOk={() => mf.validateFields().then(v => { if (report(savePaymentMethod({ ...method!, ...v, accountId: v.accountId ?? null }, me))) setMethod(null); })}>
      <Form form={mf} layout="vertical"><Form.Item label={l('方式名稱')} name="name" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item><Form.Item label={l('用途')} name="direction"><Select onChange={v => { if (v === 'receipt') mf.setFieldValue('currency', 'HKD'); }} options={[{ value: 'receipt', label: l('客戶收款') }, { value: 'payment', label: l('公司付款') }]} /></Form.Item><Form.Item label={l('交易幣種')} name="currency"><Select options={(direction === 'receipt' ? ['HKD'] : ['HKD', 'RMB']).map(value => ({ value }))} /></Form.Item><Form.Item label={l('連結帳戶')} name="accountId"><Select allowClear options={s.accounts.filter(a => a.active && (direction !== 'receipt' || a.currency === 'HKD')).map(a => ({ value: a.id, label: `${a.name} (${a.currency})` }))} /></Form.Item><Form.Item label={l('啟用')} name="active" valuePropName="checked"><Switch /></Form.Item></Form>
    </Modal>
  </Flex>;
}

export function ExpensePolicyTab() {
  const s = useSettings(); const { me, l, report } = useEditor(); const accounts = useAccounts(); const editable = canManage(me, 'policy');
  const [policy, setPolicy] = useState<ExpensePolicy | null>(null); const [note, setNote] = useState(''); const [detail, setDetail] = useState<string | null>(null);
  const [form] = Form.useForm<{ type: ExpensePolicy['type']; categoryId: string; locationId?: string; requesterId: string }>();
  const person = (id: string) => accounts.find(a => a.id === id)?.displayName ?? id;
  const selected = s.scenarios.find(r => r.id === detail);
  return <Flex vertical gap={12}>
    <Alert type="info" showIcon title={l('第一版：全部支出及報銷交 Ocean 核對，沒有金額豁免。')} description={l('Ocean 不在時保留待批，不自動代批；本人申請由 Ocean 確認並留記錄。批准與付款分開，通知只在 ERP 工作台。')} />
    {s.policies.map(p => <Card key={p.type} size="small" title={<Space>{l(p.type === 'expense' ? '未付款支出' : '員工墊支報銷')}<Tag>Rev {p.version}</Tag></Space>} extra={editable && <Button onClick={() => { setPolicy(p); setNote(p.instruction); }}>{l('修改核對指引')}</Button>}><Paragraph>{p.instruction}</Paragraph><Text type="secondary">{l('指定核對人：Ocean；指引修訂只套用新申請。')}</Text></Card>)}
    <Card title={l('設定驗證情境')}>
      <Paragraph type="secondary">{l('以下只測試設定及版本保留，不會新增正式支出、會計記錄或執行付款。')}</Paragraph>
      {editable && <Form form={form} layout="vertical" initialValues={{ type: 'expense', categoryId: 'D13', requesterId: me.id }} onFinish={v => report(createScenario(v.type, v.categoryId, v.locationId ?? null, v.requesterId, me))}>
        <div className="v14-form-grid">
          <Form.Item label={l('申請類型')} name="type"><Select options={[{ value: 'expense', label: l('未付款支出') }, { value: 'claim', label: l('員工墊支報銷') }]} /></Form.Item>
          <Form.Item label={l('申請人')} name="requesterId" rules={[{ required: true }]}><Select options={accounts.filter(a => a.status === 'active').map(a => ({ value: a.id, label: a.displayName }))} /></Form.Item>
          <Form.Item label={l('分類入口')} name="categoryId" rules={[{ required: true }]}><Select options={s.categories.filter(c => c.active).map(c => ({ value: c.id, label: `${c.id} ${c.name}` }))} /></Form.Item>
          <Form.Item label={l('地點')} name="locationId"><Select allowClear options={s.locations.filter(a => a.status === 'active').map(a => ({ value: a.id, label: a.name }))} /></Form.Item>
        </div><Button htmlType="submit" type="primary">{l('建立驗證情境')}</Button>
      </Form>}
      <Table<Scenario> style={{ marginTop: 16 }} rowKey="id" dataSource={s.scenarios} scroll={{ x: 800 }} pagination={{ pageSize: 5 }} columns={[
        { title: l('編號'), dataIndex: 'id' }, { title: l('申請人'), render: (_, r) => person(r.requesterId) },
        { title: l('建立時分類／地點'), render: (_, r) => `${r.category.name} / ${r.location?.name ?? '—'}` },
        { title: l('規則版本'), render: (_, r) => `Rev ${r.policy.version}` },
        { title: l('待處理人'), render: (_, r) => person(r.assigneeId) },
        { title: l('狀態'), render: (_, r) => l(r.status === 'pending' ? '待核對' : '已批准／未付款') },
        { title: l('操作'), render: (_, r) => <Space><Button onClick={() => setDetail(r.id)}>{l('詳情')}</Button>{r.status === 'pending' && me.id === r.assigneeId && <Button onClick={() => report(approveScenario(r.id, me))}>{l('核對批准')}</Button>}</Space> },
      ]} />
    </Card>
    <Modal title={l('修改核對指引')} open={!!policy} okText={l('儲存新版本')} cancelText={l('取消')} onCancel={() => setPolicy(null)} onOk={() => { if (report(revisePolicy(policy!.type, note, me))) setPolicy(null); }}><Paragraph>{l('保留 Ocean 全數核對、先批後付及不自動代批。修訂指引會產生新版本，舊情境保持原版本。')}</Paragraph><Input.TextArea value={note} onChange={e => setNote(e.target.value)} rows={4} /></Modal>
    <Modal title={detail} open={!!selected} onCancel={() => setDetail(null)} footer={null}><Paragraph>{selected?.policy.instruction}</Paragraph>{selected?.history.map((h, i) => <Paragraph key={i}>{h.at.slice(0, 19).replace('T', ' ')} · {h.actor} · {h.event}</Paragraph>)}</Modal>
  </Flex>;
}

export function SettingsChangesTab() {
  const s = useSettings(); const l = useV14Text();
  return <><Alert type="info" showIcon title={l('設定變更紀錄（本次示範）')} description={l('設定資料與歷史只保留於本次開啟期間，重新整理後會重置；正式多人權限及審計需由後端實作。')} style={{ marginBottom: 12 }} /><Table rowKey={(_, i) => String(i)} dataSource={[...s.changes].reverse()} scroll={{ x: 850 }} pagination={{ pageSize: 10 }} columns={[{ title: l('時間'), dataIndex: 'at', width: 190 }, { title: l('操作人'), dataIndex: 'actor', width: 100 }, { title: l('記錄'), dataIndex: 'target', width: 150 }, { title: l('修改前'), dataIndex: 'before', ellipsis: true }, { title: l('修改後'), dataIndex: 'after', ellipsis: true }]} expandable={{ expandedRowRender: r => <div style={{ overflowWrap: 'anywhere' }}><Paragraph>{r.before}</Paragraph><Paragraph>{r.after}</Paragraph></div> }} /></>;
}

export function SettingsWorkbenchNotice() {
  const s = useSettings(); const { user } = useAuth(); const l = useV14Text();
  const pending = s.scenarios.filter(r => r.status === 'pending' && r.assigneeId === user?.id);
  if (!pending.length) return null;
  return <Alert showIcon type="info" style={{ marginBottom: 12 }} title={`${l('設定驗證待核對')}：${pending.length}`} description={l('這是設定測試情境，與訂單待辦分開計數。')} action={<Button onClick={() => { window.__MORI_NAVIGATE__?.('settings'); }}>{l('前往設定核對')}</Button>} />;
}
