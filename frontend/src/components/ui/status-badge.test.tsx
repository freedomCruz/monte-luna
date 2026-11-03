import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

afterEach(cleanup);

describe('StatusBadge (F1: S8)', () => {
  it('names the state in text and uses the tone colours of the admin status table', () => {
    render(<StatusBadge tone="action">Pagado</StatusBadge>);
    const badge = screen.getByText('Pagado').closest('span')!;
    expect(badge.className).toContain('bg-brand-yellow');
    expect(badge.className).toContain('text-foreground');
  });

  it.each([
    ['progress', 'bg-brand-green'],
    ['done', 'bg-success'],
    ['neutral', 'bg-secondary'],
    ['problem', 'bg-destructive'],
  ] as const)('tone %s uses %s', (tone, background) => {
    render(<StatusBadge tone={tone}>Estado</StatusBadge>);
    expect(screen.getByText('Estado').closest('span')!.className).toContain(background);
  });

  it('hides the decorative dot from assistive technology', () => {
    const { container } = render(<StatusBadge tone="done">Entregado</StatusBadge>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
