import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "outline" | "dark";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-orange text-white hover:opacity-90",
  secondary:
    "border-2 border-primary-orange text-primary-orange hover:bg-primary-orange hover:text-white",
  outline:
    "border-2 border-white text-white hover:bg-white hover:text-dark-navy",
  dark:
    "bg-dark-navy text-white hover:bg-dark-blue",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-base",
};

export default function Button({
  href,
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  className = "",
  onClick,
}: ButtonProps) {
  const baseStyles =
    "inline-block rounded-lg font-semibold transition-all text-center";
  const styles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${
    fullWidth ? "w-full" : ""
  } ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={styles}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={styles}>
      {children}
    </button>
  );
}
