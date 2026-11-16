/**
 * An on/off toggle. Put it inside a `<label>` with its text, so tapping the text flips it too.
 * `quiet` makes it smaller and neutral, for rows where a gold switch would outshine the rest.
 */
const Switch = ({ isOn, onChange, quiet = false }: { isOn: boolean; onChange: (isOn: boolean) => void; quiet?: boolean }) => (
  <button type="button" role="switch" aria-checked={isOn} onClick={() => onChange(!isOn)} className={quiet ? 'switch switch-quiet' : 'switch'} />
);

export default Switch;
