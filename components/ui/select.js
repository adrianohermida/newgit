// Select UI component (placeholder)
export default function Select({ options = [], ...props }) {
  return (
    <select {...props}>
      {options.map((opt, i) => (
        <option key={i} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}