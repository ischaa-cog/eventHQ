export function netSaleContribution(sale: { amount: string | number; status?: string | null; metadata?: unknown }): number {
  const amount = Math.abs(Number(sale.amount));
  const refund = Number((sale.metadata as { refundAmount?: number } | null)?.refundAmount ?? 0);
  if (sale.status === "refunded") return -Math.abs(refund || amount);
  if (sale.status === "paid" || sale.status === "completed" || !sale.status) return amount - Math.max(0, refund);
  return 0;
}