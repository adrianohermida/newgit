// Label UI component (placeholder)
export default function Label({ children, ...props }) {
  return <label {...props}>{children}</label>;
}