// Adapted from the official shadcn/ui new-york-v4 Button registry source:
// https://ui.shadcn.com/r/styles/new-york-v4/button.json
// Incorporated manually (without the CLI) and themed with Monteluna tokens.
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-md px-4 font-sans text-base font-bold uppercase tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-accent text-primary-foreground hover:underline',
        secondary: 'bg-primary text-primary-foreground hover:underline',
        outline: 'border-2 border-foreground bg-background text-foreground hover:underline',
        ghost: 'text-foreground hover:bg-secondary',
      },
      size: {
        default: 'px-4',
        sm: 'px-3',
        lg: 'px-6',
        icon: 'min-w-[44px] px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
