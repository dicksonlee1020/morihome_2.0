import { useState } from 'react';
import { Button, Card, Divider, Flex, List, Typography } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { CHANNEL_META, PAYMENT_META, STATUS_META } from '../data/orders';
import { colors } from '../theme';
import { orderQty, orderTotal } from '../types';
import type { Order } from '../types';
import { Pill } from './Pill';

const { Text } = Typography;

interface Props {
  orders: Order[];
  money: (n: number) => string;
  isOverdue: (o: Order) => boolean;
}

/**
 * 手機版訂單列表。
 * 390px 闊度擺唔落 10 欄表格 —— 掃到第三欄就已經睇唔到金額同狀態，
 * 所以手機改用卡片：一眼見到「邊張單、幾錢、乜狀態、幾時送」。
 */
export function OrderCards({ orders, money, isOverdue }: Props) {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) =>
    setOpen((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <List
      dataSource={orders}
      split={false}
      pagination={{
        pageSize: 8,
        size: 'small',
        align: 'center',
        showTotal: (t, r) => `第 ${r[0]}–${r[1]} 張，共 ${t} 張`,
      }}
      renderItem={(o) => {
        const status = STATUS_META[o.status];
        const payment = PAYMENT_META[o.payment];
        const expanded = open.includes(o.id);

        return (
          <List.Item style={{ padding: '6px 0' }}>
            <Card size="small" style={{ width: '100%' }}>
              <Flex vertical gap={10}>
                <Flex align="center" justify="space-between" gap={8}>
                  <Text style={{ fontWeight: 600 }}>{o.id}</Text>
                  <Pill color={status.color} bg={status.bg} dot>
                    {status.label}
                  </Pill>
                </Flex>

                <Flex align="baseline" justify="space-between" gap={8}>
                  <Flex vertical gap={2}>
                    <Text>{o.customer.name}</Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      {o.customer.phone} · {CHANNEL_META[o.channel].label}
                    </Text>
                  </Flex>
                  <Text style={{ fontSize: 16, fontWeight: 600 }}>
                    {money(orderTotal(o))}
                  </Text>
                </Flex>

                <Flex align="center" justify="space-between" gap={8} wrap>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    送貨：
                    {o.deliveryAt ? (
                      <Text
                        style={{
                          fontSize: 13,
                          color: isOverdue(o) ? colors.error : undefined,
                          fontWeight: isOverdue(o) ? 500 : undefined,
                        }}
                      >
                        {dayjs(o.deliveryAt).format('M月D日')}
                        {isOverdue(o) && ' · 逾期未送'}
                      </Text>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        未約
                      </Text>
                    )}
                  </Text>
                  <Pill color={payment.color} bg={payment.bg}>
                    {payment.label}
                  </Pill>
                </Flex>

                {o.remark && (
                  <Text style={{ fontSize: 13, color: colors.warningText }}>
                    備註：{o.remark}
                  </Text>
                )}

                <Button
                  type="text"
                  size="small"
                  style={{ alignSelf: 'flex-start', paddingInline: 0 }}
                  icon={expanded ? <DownOutlined /> : <RightOutlined />}
                  onClick={() => toggle(o.id)}
                >
                  {orderQty(o)} 件貨品
                </Button>

                {expanded && (
                  <Flex vertical gap={8}>
                    <Divider style={{ margin: 0 }} />
                    {o.items.map((i) => (
                      <Flex key={i.sku} justify="space-between" gap={12}>
                        <Flex vertical gap={2} style={{ minWidth: 0 }}>
                          <Text style={{ fontSize: 13 }}>{i.name}</Text>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            {i.sku} · {i.qty} × {money(i.price)}
                          </Text>
                        </Flex>
                        <Text style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {money(i.qty * i.price)}
                        </Text>
                      </Flex>
                    ))}
                  </Flex>
                )}
              </Flex>
            </Card>
          </List.Item>
        );
      }}
    />
  );
}
