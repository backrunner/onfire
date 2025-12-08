import { twMerge } from 'tailwind-merge';

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-hidden rounded-lg border border-zinc-200">
    <table className={twMerge('w-full text-sm', className)} {...props} />
  </div>
);

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={twMerge('bg-zinc-50 text-left text-xs uppercase text-zinc-500', className)} {...props} />
);
export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={twMerge('divide-y divide-zinc-100 bg-white', className)} {...props} />
);
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={twMerge('hover:bg-zinc-50', className)} {...props} />
);
export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
  <th className={twMerge('px-4 py-3 font-semibold', className)} {...props} />
);
export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableDataCellElement>) => (
  <td className={twMerge('px-4 py-3 align-top', className)} {...props} />
);

