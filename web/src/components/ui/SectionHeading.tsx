interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  light?: boolean;
}

export default function SectionHeading({
  title,
  subtitle,
  align = "center",
  light = false,
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  const titleColor = light ? "text-white" : "text-dark-navy";
  const subtitleColor = light ? "text-muted-text" : "text-neutral-gray";

  return (
    <div className={`mb-8 sm:mb-12 ${alignClass}`}>
      <h2 className={`mb-3 sm:mb-4 text-3xl sm:text-4xl font-bold ${titleColor}`}>{title}</h2>
      {subtitle && (
        <p
          className={`mx-auto max-w-[700px] text-base sm:text-lg ${subtitleColor} ${
            align === "left" ? "mx-0" : ""
          }`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
