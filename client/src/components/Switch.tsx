/** An on/off toggle. Put it inside a `<label>` with its text, so tapping the text flips it too. */
const Switch = ({ isOn, onChange }: { isOn: boolean; onChange: (isOn: boolean) => void }) => (
  <button type="button" role="switch" aria-checked={isOn} onClick={() => onChange(!isOn)} className="switch" />
);

export default Switch;
