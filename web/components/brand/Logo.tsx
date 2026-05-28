import Image from "next/image";

interface LogoProps {
  variant?: "default" | "on-dark";
  className?: string;
  height?: number;
  priority?: boolean;
}

export function Logo({ variant = "default", className, height = 36, priority }: LogoProps) {
  const src = variant === "on-dark" ? "/brand/logo-on-dark.svg" : "/brand/logo.svg";
  return (
    <Image
      src={src}
      alt="Quicksilver"
      width={Math.round(height * (1039.54 / 282.13))}
      height={height}
      priority={priority}
      className={className}
    />
  );
}

export function BrandIcon({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/icon.svg"
      alt="Quicksilver"
      width={size}
      height={size}
      className={className}
    />
  );
}
