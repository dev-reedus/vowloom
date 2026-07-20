export default function AppIcon({ icon: Icon, size = 16, strokeWidth = 1.9, className }) {
  return (
    <Icon
      className={className}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
    />
  )
}
