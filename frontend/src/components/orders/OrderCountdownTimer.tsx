import React, { useState, useEffect } from 'react';

export interface OrderCountdownTimerProps {
  expiresAt: string;
  onExpire?: () => void;
}

export function OrderCountdownTimer({ expiresAt, onExpire }: OrderCountdownTimerProps) {
  const [timeLeftMs, setTimeLeftMs] = useState<number>(() => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, diff);
  });

  useEffect(() => {
    const updateTimer = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeftMs(0);
        if (onExpire) onExpire();
      } else {
        setTimeLeftMs(diff);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const totalSeconds = Math.floor(timeLeftMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');

  // Calculate width percentage based on 30 minutes (1800 seconds) reservation
  const pct = Math.min(100, Math.max(0, (totalSeconds / 1800) * 100));

  return (
    <div className="flex flex-col gap-2.5 p-3.5 md:p-4 bg-primary text-primary-foreground rounded-2xl">
      <div className="flex items-center justify-between gap-3 text-base font-bold">
        <span>Tu pedido sigue apartado</span>
        <span
          role="timer"
          aria-label={`Quedan ${minutes} minutos y ${seconds} segundos`}
          className="font-condensed text-2xl md:text-3xl font-extrabold text-brand-yellow"
        >
          {formattedMinutes}:{formattedSeconds}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="block h-2 rounded-full bg-background/25 overflow-hidden"
      >
        <span
          className="block h-full rounded-full bg-brand-yellow transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
