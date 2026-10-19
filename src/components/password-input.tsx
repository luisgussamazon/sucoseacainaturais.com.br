"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const Icon = visible ? EyeOff : Eye;
  return (
    <span className="password-control">
      <input {...props} id={id} type={visible ? "text" : "password"} />
      <button
        className="password-toggle"
        type="button"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-controls={id}
        aria-pressed={visible}
        onClick={(event) => { event.preventDefault(); setVisible(value => !value); }}
      >
        <Icon size={20} aria-hidden="true" />
      </button>
    </span>
  );
}
