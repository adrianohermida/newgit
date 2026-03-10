// RadioGroup UI component (placeholder)
export default function RadioGroup({ options = [], name }) {
  return (
    <div>
      {options.map((opt, i) => (
        <label key={i}>
          <input type="radio" name={name} value={opt.value} /> {opt.label}
        </label>
      ))}
    </div>
  );
}