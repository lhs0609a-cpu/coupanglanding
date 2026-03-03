interface SubStepProgressProps {
  current: number;
  total: number;
}

export default function SubStepProgress({ current, total }: SubStepProgressProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i <= current ? 'bg-[#E31837]' : 'bg-gray-300'
          }`}
        />
      ))}
      <span className="text-xs text-gray-500 ml-1.5">
        {current + 1}/{total}
      </span>
    </div>
  );
}
