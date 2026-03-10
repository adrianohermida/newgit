// Form UI component (placeholder)
export default function Form({ children, ...props }) {
  return <form {...props}>{children}</form>;
}