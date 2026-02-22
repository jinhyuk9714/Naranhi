interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, label, disabled = false, size = 'md' }: ToggleProps) {
  const sizes = {
    sm: { track: 'w-8 h-4', thumb: 'h-3 w-3', translate: 'translate-x-4' },
    md: { track: 'w-11 h-6', thumb: 'h-5 w-5', translate: 'translate-x-5' },
  };
  const s = sizes[size];

  const handleClick = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      className={`inline-flex items-center gap-2 select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="relative">
        <div
          className={`${s.track} rounded-full transition-colors duration-200 ${
            checked ? 'bg-naranhi-500' : 'bg-gray-300'
          } ${disabled ? 'opacity-50' : ''}`}
        />
        <div
          className={`absolute left-0.5 top-0.5 ${s.thumb} rounded-full bg-white shadow transition-transform duration-200 pointer-events-none ${
            checked ? s.translate : 'translate-x-0'
          }`}
        />
      </div>
      {label && (
        <span className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-700'}`}>{label}</span>
      )}
    </button>
  );
}
