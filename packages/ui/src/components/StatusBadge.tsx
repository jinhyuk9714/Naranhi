interface StatusBadgeProps {
  status: 'connected' | 'disconnected' | 'loading';
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles = {
    connected: 'bg-green-100 text-green-700',
    disconnected: 'bg-red-100 text-red-700',
    loading: 'bg-yellow-100 text-yellow-700',
  };

  const dots = {
    connected: 'bg-green-500',
    disconnected: 'bg-red-500',
    loading: 'bg-yellow-500 animate-pulse',
  };

  const defaultLabels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    loading: 'Connecting...',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status]}`} />
      {label || defaultLabels[status]}
    </span>
  );
}
