interface ModuleProgressBarProps {
  current: number;
  total: number;
}

export default function ModuleProgressBar({ current, total }: ModuleProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700">
          {current} / {total}
        </span>
        <span className="text-xs text-gray-400">{percent}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-[#E31837] h-2 rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
