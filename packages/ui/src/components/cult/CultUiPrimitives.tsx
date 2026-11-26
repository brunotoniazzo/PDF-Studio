import React, { useRef } from 'react';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Marca geométrica pontilhada inspirada na identidade visual do Cult UI,
 * acompanhada do ponto semântico carmim de documento PDF.
 */
export function CultBrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-black/15 bg-gradient-to-b from-neutral-800 to-neutral-950 shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_1px_2px_rgba(0,0,0,0.25)] dark:border-white/15 dark:from-neutral-100 dark:to-neutral-300',
        className
      )}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 text-white dark:text-neutral-950"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="4.5" cy="4.5" r="1.4" />
        <circle cx="11.5" cy="4.5" r="1.4" />
        <circle cx="4.5" cy="11.5" r="1.4" />
        <circle cx="8" cy="8" r="1.4" opacity="0.65" />
        <circle cx="11.5" cy="11.5" r="1.6" fill="#DC2626" />
      </svg>
    </div>
  );
}

/**
 * NeumorphEyebrow — Pílula tátil com tracking ampliado para selos como BETA.
 */
export function NeumorphEyebrow({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'crimson' | 'emerald' | 'amber';
  className?: string;
}) {
  const toneCls =
    tone === 'crimson'
      ? 'border-red-500/25 bg-gradient-to-b from-red-50 to-red-100/70 text-red-700 dark:border-red-500/30 dark:from-red-950/60 dark:to-red-900/30 dark:text-red-300'
      : tone === 'emerald'
      ? 'border-emerald-500/25 bg-gradient-to-b from-emerald-50 to-emerald-100/70 text-emerald-800 dark:border-emerald-500/30 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:text-emerald-300'
      : tone === 'amber'
      ? 'border-amber-500/25 bg-gradient-to-b from-amber-50 to-amber-100/70 text-amber-800 dark:border-amber-500/30 dark:from-amber-950/60 dark:to-amber-900/30 dark:text-amber-300'
      : 'border-black/10 bg-gradient-to-b from-white to-neutral-100 text-neutral-700 dark:border-white/10 dark:from-[#262726] dark:to-[#181918] dark:text-neutral-200';

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_1px_2px_rgba(0,0,0,0.35)]',
        toneCls,
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * HaloBadge — Selo compacto com número tabular para contadores e status.
 */
export function HaloBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'crimson' | 'emerald' | 'amber' | 'sky';
  className?: string;
}) {
  const toneCls =
    tone === 'crimson'
      ? 'border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300'
      : tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : tone === 'sky'
      ? 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
      : 'border-black/10 bg-neutral-900 text-white dark:border-white/15 dark:bg-neutral-100 dark:text-neutral-950';

  return (
    <span
      className={cx(
        'inline-flex items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none',
        toneCls,
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * TextureSeparator — Divisor de sulco duplo clássico do Cult UI.
 */
export function TextureSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cx(
        'w-full border border-x-transparent border-t-neutral-50 border-b-neutral-300/60 dark:border-t-neutral-950 dark:border-b-white/[0.08]',
        className
      )}
    />
  );
}

/**
 * TextureCard — Cartão tátil de 5 camadas concêntricas de borda (Cult UI signature).
 * Utilize apenas em superfícies interativas de destaque, formulários ou modais.
 */
export function TextureCard({
  children,
  variant = 'default',
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'compact';
  className?: string;
  innerClassName?: string;
}) {
  const r =
    variant === 'compact'
      ? [
          'rounded-[16px]',
          'rounded-[15px]',
          'rounded-[14px]',
          'rounded-[13px]',
          'rounded-[12px]',
        ]
      : [
          'rounded-[24px]',
          'rounded-[23px]',
          'rounded-[22px]',
          'rounded-[21px]',
          'rounded-[20px]',
        ];

  return (
    <div
      className={cx(
        r[0],
        'border border-white/60 bg-gradient-to-b from-neutral-100/95 to-white/80 shadow-[0_2px_6px_rgba(17,24,28,0.06)] dark:border-neutral-950/70 dark:from-[#222322] dark:to-[#161716] dark:shadow-[0_8px_20px_rgba(0,0,0,0.45)]',
        className
      )}
    >
      <div className={cx(r[1], 'border border-black/10 dark:border-neutral-900/90')}>
        <div className={cx(r[2], 'border border-white/50 dark:border-neutral-950')}>
          <div
            className={cx(
              r[3],
              'border border-neutral-950/15 dark:border-white/[0.06]'
            )}
          >
            <div
              className={cx(
                r[4],
                'w-full overflow-hidden border border-white/60 bg-gradient-to-b from-white to-neutral-50/70 text-neutral-700 dark:border-neutral-700/40 dark:from-[#1B1C1B] dark:to-[#141514] dark:text-neutral-200',
                innerClassName
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TextureCardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx('px-6 pt-5 pb-3', className)}>{children}</div>;
}

export function TextureCardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx('px-6 py-4', className)}>{children}</div>;
}

export function TextureCardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center justify-between gap-2 px-6 py-3.5', className)}>
      {children}
    </div>
  );
}

/**
 * TextureButton — Botão físico em casca dupla (`p-[1px]` + superfície gradiente) do Cult UI.
 */
export type TextureButtonVariant =
  | 'primary'
  | 'secondary'
  | 'minimal'
  | 'destructive'
  | 'icon';

export type TextureButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export function TextureButton({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  innerClassName,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: TextureButtonVariant;
  size?: TextureButtonSize;
  innerClassName?: string;
}) {
  const outerShape =
    size === 'icon'
      ? 'rounded-full'
      : size === 'xs'
      ? 'rounded-[8px]'
      : size === 'sm'
      ? 'rounded-[9px]'
      : 'rounded-[11px]';

  const innerShape =
    size === 'icon'
      ? 'rounded-full h-7 w-7 p-0'
      : size === 'xs'
      ? 'rounded-[6.5px] px-2.5 py-1 text-[11px]'
      : size === 'sm'
      ? 'rounded-[7.5px] px-3 py-1.5 text-xs'
      : size === 'lg'
      ? 'rounded-[9.5px] px-5 py-2.5 text-sm'
      : 'rounded-[9.5px] px-3.5 py-2 text-xs';

  const outerVariant =
    variant === 'primary'
      ? 'border border-black/15 bg-gradient-to-b from-neutral-700 to-black shadow-[0_1px_2px_rgba(0,0,0,0.22)] dark:border-black dark:from-white dark:to-neutral-300'
      : variant === 'destructive'
      ? 'border border-red-900/25 bg-gradient-to-b from-red-400 to-red-600 shadow-[0_1px_2px_rgba(220,38,38,0.24)]'
      : variant === 'secondary'
      ? 'border border-black/15 bg-white/75 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-neutral-950 dark:bg-neutral-700/60'
      : variant === 'icon'
      ? 'border border-black/10 bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#222322]'
      : 'border border-black/10 bg-white/70 hover:border-black/20 dark:border-white/10 dark:bg-[#1E1F1E] dark:hover:border-white/20';

  const innerVariant =
    variant === 'primary'
      ? 'bg-gradient-to-b from-neutral-800 to-neutral-950 text-white hover:from-neutral-700 hover:to-neutral-900 dark:from-neutral-100 dark:to-neutral-200 dark:text-neutral-950 dark:hover:from-white dark:hover:to-neutral-100'
      : variant === 'destructive'
      ? 'bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-500/90 hover:to-red-700'
      : variant === 'secondary'
      ? 'bg-gradient-to-b from-neutral-100/90 to-neutral-200/60 text-neutral-800 hover:from-neutral-200/60 hover:to-neutral-300/60 dark:from-[#262726] dark:to-[#1C1D1C] dark:text-neutral-100 dark:hover:from-[#2E2F2E] dark:hover:to-[#222322]'
      : variant === 'icon'
      ? 'bg-gradient-to-b from-white to-neutral-100 text-neutral-700 hover:from-neutral-50 hover:to-neutral-200/70 dark:from-[#262726] dark:to-[#1A1B1A] dark:text-neutral-200'
      : 'bg-gradient-to-b from-white to-neutral-50/60 text-neutral-700 hover:from-neutral-50 hover:to-neutral-100 dark:from-[#232423] dark:to-[#1A1B1A] dark:text-neutral-200 dark:hover:from-[#2A2B2A] dark:hover:to-[#1F201F]';

  return (
    <button
      type={type}
      {...props}
      className={cx(
        'group/tbtn inline-flex shrink-0 select-none items-center justify-center bg-origin-border p-[1px] transition-[transform,box-shadow,opacity,border-color] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        outerShape,
        outerVariant,
        className
      )}
    >
      <span
        className={cx(
          'inline-flex h-full w-full items-center justify-center gap-1.5 font-medium leading-none transition-[background-color,color] duration-150 ease-out',
          innerShape,
          innerVariant,
          innerClassName
        )}
      >
        {children}
      </span>
    </button>
  );
}

/**
 * MinimalCard — Superfície com sombra multi-stop e transição limpa para cards clicáveis e miniaturas.
 */
export function MinimalCard({
  children,
  active = false,
  className,
  onClick,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      {...rest}
      className={cx(
        'rounded-[18px] p-2 transition-[background-color,box-shadow,transform] duration-150 ease-out',
        active
          ? 'bg-white ring-2 ring-[#1A94FF] shadow-[0_2px_6px_rgba(26,148,255,0.18)] dark:bg-[#222322] dark:ring-[#38BDF8]'
          : 'bg-neutral-50/95 shadow-[0_1px_1px_rgba(0,0,0,0.05),0_1px_1px_rgba(255,252,240,0.5)_inset,0_0_0_1px_rgba(17,24,28,0.08),0_2px_4px_rgba(17,24,28,0.04)] hover:bg-neutral-100/90 dark:bg-[#191A19] dark:shadow-[0_1px_0_hsla(0,0%,100%,0.03)_inset,0_0_0_1px_hsla(0,0%,100%,0.04)_inset,0_0_0_1px_rgba(0,0,0,0.2),0_4px_8px_rgba(0,0,0,0.25)] dark:hover:bg-[#212221]',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * MinimalCardFrame — Moldura dupla fosca (3px matte branco) usada em prévias de PDF e ícones.
 */
export function MinimalCardFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-[12px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_0_0_3px_#ffffff,0_0_0_4px_rgba(0,0,0,0.08)] dark:bg-[#121312] dark:shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_0_3px_rgba(255,255,255,0.08),0_0_0_4px_rgba(0,0,0,0.65)]',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * DirectionAwareTabs — Trilho rebaixado de pílulas com memória de direção da troca de aba.
 */
export interface DirectionAwareTabItem<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: string | number }>;
  title?: string;
}

export function DirectionAwareTabs<T extends string>({
  items,
  value,
  onChange,
  compact = false,
  ariaLabel,
  className,
}: {
  items: ReadonlyArray<DirectionAwareTabItem<T>>;
  value: T;
  onChange: (next: T, direction: 1 | -1) => void;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const prevIdxRef = useRef<number>(
    Math.max(
      0,
      items.findIndex((it) => it.id === value)
    )
  );

  return (
    <nav
      aria-label={ariaLabel}
      className={cx(
        'inline-flex items-center rounded-full border border-black/[0.06] bg-neutral-200/80 p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] dark:border-white/[0.07] dark:bg-[#111211] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]',
        compact ? 'gap-0.5' : 'gap-0.5',
        className
      )}
    >
      {items.map((item, idx) => {
        const Icon = item.icon;
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            title={item.title ?? item.label}
            aria-pressed={selected}
            onClick={() => {
              const dir: 1 | -1 = idx >= prevIdxRef.current ? 1 : -1;
              prevIdxRef.current = idx;
              onChange(item.id, dir);
            }}
            className={cx(
              'relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]',
              compact ? 'h-6 px-2.5 text-[11px]' : 'h-7 px-3 text-xs',
              selected
                ? 'bg-white text-neutral-950 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] dark:bg-[#282928] dark:text-white dark:shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_2px_4px_rgba(0,0,0,0.45)]'
                : 'text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100'
            )}
          >
            {Icon && (
              <Icon
                className={cx(
                  'shrink-0',
                  compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                  selected ? 'opacity-100' : 'opacity-75'
                )}
                strokeWidth={1.6}
              />
            )}
            <span className={compact ? '' : 'hidden lg:inline'}>
              {item.shortLabel ?? item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * CollabToolbar — Barra segmentada tátil inspirada em @cult-ui/collab-toolbar.
 */
export function CollabToolbar({
  children,
  className,
  darkSurface = false,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { darkSurface?: boolean }) {
  return (
    <div
      {...rest}
      className={cx(
        'inline-flex items-center gap-1 rounded-full border p-1 transition-[box-shadow,background-color] duration-150',
        darkSurface
          ? 'border-white/10 bg-[#161716]/95 text-neutral-100 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md'
          : 'border-black/10 bg-white/95 text-neutral-800 shadow-[0_1px_1px_rgba(255,255,255,0.8)_inset,0_4px_14px_rgba(17,24,28,0.12),0_0_0_1px_rgba(17,24,28,0.04)] backdrop-blur-md dark:border-white/10 dark:bg-[#1E1F1E]/95 dark:text-neutral-100 dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_8px_20px_rgba(0,0,0,0.45)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CollabDivider({ darkSurface = false }: { darkSurface?: boolean }) {
  return (
    <div
      className={cx(
        'mx-0.5 h-4 w-px shrink-0',
        darkSurface ? 'bg-white/15' : 'bg-neutral-300/80 dark:bg-white/10'
      )}
    />
  );
}

/**
 * FloatingPanelSurface — Superfície suspensa com moldura dupla acolchoada estilo FloatingPanel / PopoverForm.
 */
export function FloatingPanelSurface({
  children,
  className,
  innerClassName,
  style,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={cx(
        'cult-anim-popover rounded-[14px] bg-neutral-100/95 p-1 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_12px_32px_-4px_rgba(0,0,0,0.16)] dark:bg-[#222322] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_16px_36px_rgba(0,0,0,0.55)]',
        className
      )}
    >
      <div
        className={cx(
          'rounded-[10px] border border-black/[0.06] bg-white text-neutral-800 dark:border-white/[0.06] dark:bg-[#161716] dark:text-neutral-100',
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Separador tracejado com entalhes laterais semicirculares do PopoverForm (Cult UI).
 */
export function PopoverFormTicketSeparator() {
  return (
    <div className="relative my-1 flex h-3 w-full items-center overflow-hidden">
      <svg
        width="7"
        height="12"
        viewBox="0 0 7 12"
        className="-ml-[1px] shrink-0 text-neutral-100 dark:text-[#222322]"
        aria-hidden="true"
      >
        <path
          d="M0 0C3.31371 0 6 2.68629 6 6C6 9.31371 3.31371 12 0 12V0Z"
          fill="currentColor"
        />
        <path
          d="M0 0.5C3.03757 0.5 5.5 2.96243 5.5 6C5.5 9.03757 3.03757 11.5 0 11.5"
          stroke="rgba(115,115,115,0.28)"
          fill="none"
        />
      </svg>
      <div className="h-px flex-1 border-t border-dashed border-neutral-300/80 dark:border-white/15" />
      <svg
        width="7"
        height="12"
        viewBox="0 0 7 12"
        className="-mr-[1px] shrink-0 text-neutral-100 dark:text-[#222322]"
        aria-hidden="true"
      >
        <path
          d="M7 0C3.68629 0 1 2.68629 1 6C1 9.31371 3.68629 12 7 12V0Z"
          fill="currentColor"
        />
        <path
          d="M7 0.5C3.96243 0.5 1.5 2.96243 1.5 6C1.5 9.03757 3.96243 11.5 7 11.5"
          stroke="rgba(115,115,115,0.28)"
          fill="none"
        />
      </svg>
    </div>
  );
}

/**
 * PopoverTicketModal — Modal tátil com moldura dupla acolchoada e rodapé ticket-cutout do Cult UI.
 */
export function PopoverTicketModal({
  title,
  subtitle,
  maxWidthClass = 'max-w-md',
  children,
  footer,
  onBackdropClick,
  asFormOnSubmit,
}: {
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onBackdropClick?: () => void;
  asFormOnSubmit?: (e: React.FormEvent) => void;
}) {
  const card = (
    <div
      onClick={(e) => e.stopPropagation()}
      className={cx(
        'cult-anim-popover w-full rounded-[18px] bg-neutral-100/95 p-1.5 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_20px_48px_-8px_rgba(0,0,0,0.28)] dark:bg-[#222322] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09),0_24px_56px_rgba(0,0,0,0.65)]',
        maxWidthClass
      )}
    >
      <div className="rounded-[12px] border border-black/[0.06] bg-white text-neutral-800 dark:border-white/[0.06] dark:bg-[#151615] dark:text-neutral-100">
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 [text-wrap:balance]">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>
          )}
        </div>
        <div className="px-5 py-2.5 text-xs">{children}</div>
        <PopoverFormTicketSeparator />
        <div className="flex items-center justify-end gap-2 px-5 pb-3.5 pt-1 text-xs">
          {footer}
        </div>
      </div>
    </div>
  );

  return (
    <div
      onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
    >
      {asFormOnSubmit ? (
        <form
          onSubmit={asFormOnSubmit}
          onClick={(e) => e.stopPropagation()}
          className={cx('flex w-full justify-center', maxWidthClass)}
        >
          {card}
        </form>
      ) : (
        card
      )}
    </div>
  );
}

/**
 * DynamicIslandToast — Cápsula escura de hardware flutuante para feedback vivo do sistema.
 */
export function DynamicIslandToast({
  text,
  tone,
}: {
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}) {
  const dotCls =
    tone === 'error'
      ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
      : tone === 'warning'
      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
      : tone === 'success'
      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
      : 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]';

  return (
    <div
      role="status"
      aria-live="polite"
      className="cult-anim-island pointer-events-none fixed bottom-11 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-full border border-white/10 bg-[#161716]/95 px-4 py-2 text-xs font-medium text-neutral-100 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_12px_30px_rgba(0,0,0,0.45)] backdrop-blur-md"
    >
      <span className={cx('h-2 w-2 shrink-0 rounded-full', dotCls)} />
      <span className="truncate">{text}</span>
    </div>
  );
}

/**
 * HaloInput — Campo de entrada tátil com sombra rebaixada e foco Signal Blue `#1A94FF`.
 */
export function HaloInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'h-8 w-full rounded-[8px] border border-black/10 bg-neutral-50/90 px-2.5 text-xs text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-neutral-400 transition-[border-color,background-color,box-shadow] duration-150 focus:border-[#1A94FF] focus:bg-white focus:outline-none dark:border-white/10 dark:bg-[#111211] dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-[#38BDF8] dark:focus:bg-[#161716]',
        className
      )}
    />
  );
}

/**
 * HaloSelect — Select tátil coerente entre Light e Dark mode.
 */
export function HaloSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'h-8 w-full rounded-[8px] border border-black/10 bg-neutral-50/90 px-2.5 text-xs text-neutral-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,background-color,box-shadow] duration-150 focus:border-[#1A94FF] focus:bg-white focus:outline-none dark:border-white/10 dark:bg-[#111211] dark:text-neutral-100 dark:focus:border-[#38BDF8] dark:focus:bg-[#161716]',
        className
      )}
    >
      {children}
    </select>
  );
}

/**
 * HaloSegmented — Controle segmentado compacto em trilho rebaixado.
 */
export function HaloSegmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ id: T; label: string; title?: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'inline-flex items-center rounded-lg border border-black/[0.06] bg-neutral-200/75 p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:border-white/[0.06] dark:bg-[#111211]',
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title ?? opt.label}
            onClick={() => onChange(opt.id)}
            className={cx(
              'inline-flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] font-medium transition-[background-color,color,box-shadow] duration-120',
              active
                ? 'bg-white text-neutral-950 shadow-[0_1px_2px_rgba(0,0,0,0.1)] dark:bg-[#282928] dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
