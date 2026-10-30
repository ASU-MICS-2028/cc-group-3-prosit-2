import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./icons";
import { MicButton } from "./buttons";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  label: string;
  helper?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Adds the voice-note button inside the field (7.18). */
  voice?: boolean;
  forceFocus?: boolean;
};

/** 7.12: label above (never placeholder-only), helper or error below. */
export function Field({ label, helper, error, prefix, suffix, voice, forceFocus, className = "", ...rest }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? helper;
  return (
    <div className={`field${error ? " has-error" : ""}${forceFocus ? " is-focus" : ""} ${className}`}>
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="field-box">
        {prefix && <span className="field-affix">{prefix}</span>}
        <input
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
        />
        {suffix && <span className="field-affix">{suffix}</span>}
        {voice && <MicButton type="button" />}
      </div>
      {note && (
        <p id={noteId} className="field-note">
          {error && <Icon name="warning" size="sm" />}
          {note}
        </p>
      )}
    </div>
  );
}

/** Ghana phone numbers show a fixed +233 prefix. */
export function PhoneField(props: Omit<FieldProps, "prefix" | "type" | "inputMode">) {
  return <Field {...props} prefix="+233" type="tel" inputMode="tel" autoComplete="tel-national" />;
}

/** 7.12: pill search field. */
export function SearchField({ label = "Search", ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="search">
      <Icon name="magnifying-glass" size="sm" />
      <input {...rest} type="search" aria-label={label} />
    </label>
  );
}
