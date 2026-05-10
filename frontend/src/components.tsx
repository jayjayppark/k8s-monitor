import type { ReactNode } from "react";

interface StateProps {
  title: string;
  message?: string;
}

export function LoadingState({ title }: Pick<StateProps, "title">) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{title}</span>
    </div>
  );
}

export function EmptyState({ title, message }: StateProps) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function ErrorState({ title, message }: StateProps) {
  return (
    <div className="state state-error" role="alert">
      <strong>{title}</strong>
      {message ? <span>{message}</span> : null}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

export function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextFilter({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function DataTable<TItem>({
  columns,
  items,
  getKey,
}: {
  columns: {
    key: string;
    header: string;
    render: (item: TItem) => ReactNode;
  }[];
  items: TItem[];
  getKey: (item: TItem) => string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getKey(item)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
