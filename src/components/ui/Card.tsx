interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}
