export interface OrderStepItem {
  label: string;
  nota: string;
  actual: boolean;
  marca: string;
  bg: string;
  fg: string;
  bc: string;
  txt: string;
  linea: string;
}

export function computeOrderTrackingSteps(status: string): OrderStepItem[] {
  // In Monteluna Orders Domain:
  // pending_payment -> Confirmando pago (in progress)
  // paid -> Pago recibido (hecho), Preparando (actual)
  // preparing -> Pago recibido (hecho), Preparando (actual)
  // shipped -> Pago recibido (hecho), Preparando (hecho), Enviado (actual)
  // delivered -> Pago recibido (hecho), Preparando (hecho), Enviado (hecho), Entregado (hecho)
  // cancelled | expired -> no tracking steps (empty)

  if (status === 'expired' || status === 'cancelled') {
    return [];
  }

  const isPaidOrBeyond = ['paid', 'preparing', 'shipped', 'delivered'].includes(status);
  const isPreparingOrBeyond = ['preparing', 'shipped', 'delivered'].includes(status);
  const isShippedOrBeyond = ['shipped', 'delivered'].includes(status);
  const isDelivered = status === 'delivered';

  const s0: 'hecho' | 'actual' | 'pendiente' = isPaidOrBeyond ? 'hecho' : 'actual';
  const s1: 'hecho' | 'actual' | 'pendiente' = isShippedOrBeyond
    ? 'hecho'
    : status === 'preparing' || status === 'paid'
      ? 'actual'
      : 'pendiente';
  const s2: 'hecho' | 'actual' | 'pendiente' = isDelivered ? 'hecho' : status === 'shipped' ? 'actual' : 'pendiente';
  const s3: 'hecho' | 'actual' | 'pendiente' = isDelivered ? 'hecho' : 'pendiente';

  const paso = (label: string, nota: string, s: 'hecho' | 'actual' | 'pendiente', i: number): OrderStepItem => ({
    label,
    nota,
    actual: s === 'actual',
    marca: s === 'hecho' ? '✓' : String(i + 1),
    bg: s === 'hecho' ? 'bg-[#1E6B45]' : s === 'actual' ? 'bg-card' : 'bg-card',
    fg: s === 'hecho' ? 'text-primary-foreground' : s === 'actual' ? 'text-primary-foreground' : 'text-muted-foreground',
    bc: s === 'hecho' ? 'border-[#1E6B45]' : s === 'actual' ? 'border-primary' : 'border-[#A8997C]',
    txt: s === 'pendiente' ? 'text-muted-foreground' : 'text-foreground',
    linea: i === 0 ? 'transparent' : s === 'pendiente' ? 'bg-[#D9CBA8]' : 'bg-primary',
  });

  return [
    paso(
      s0 === 'hecho' ? 'Pago recibido' : 'Confirmando pago',
      s0 === 'hecho' ? 'Confirmado' : 'Esperando la respuesta',
      s0,
      0
    ),
    paso('Preparando', 'Empacamos tu café y tu chocolate', s1, 1),
    paso('Enviado', 'Te escribimos con la guía', s2, 2),
    paso('Entregado', 'En tu puerta', s3, 3),
  ];
}
