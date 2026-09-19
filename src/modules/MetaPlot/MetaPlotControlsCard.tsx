import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { MetaPlotControls } from "@/store/useAppStore";
import {
  curveSettings,
  lengthFilters,
  samplingSettings,
  transcriptSettings
} from "./metaPlotModuleConfig";

type OnMetaPlotControlChange = <K extends keyof MetaPlotControls>(
  key: K,
  value: MetaPlotControls[K]
) => void;

interface MetaPlotControlsCardProps {
  canRunAnalysis: boolean;
  controls: MetaPlotControls;
  isRunning: boolean;
  onControlChange: OnMetaPlotControlChange;
  onReset: () => void;
  onRun: () => void;
}

export function MetaPlotControlsCard({
  canRunAnalysis,
  controls,
  isRunning,
  onControlChange,
  onReset,
  onRun
}: MetaPlotControlsCardProps) {
  return (
    <section className="config-card">
      <div className="config-card__head">
        <div className="config-card__icon">
          <SlidersHorizontal size={18} />
        </div>
        <div>
          <h3>Analysis Parameters</h3>
          <p>Adjust transcript selection, sampling, and curve settings before running the analysis.</p>
        </div>
      </div>

      <div className="meta-plot-controls">
        <ControlSection title="Transcript Settings">
          {transcriptSettings.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              type={field.type}
              value={controls[field.key]}
              options={field.options}
              onChange={(value) =>
                onControlChange(field.key, value as MetaPlotControls[typeof field.key])
              }
            />
          ))}
        </ControlSection>

        <ControlSection title="Sampling Settings">
          {samplingSettings.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              type={field.type}
              value={controls[field.key]}
              options={field.options}
              onChange={(value) =>
                onControlChange(field.key, value as MetaPlotControls[typeof field.key])
              }
            />
          ))}
        </ControlSection>

        <ControlSection title="Length Filters">
          {lengthFilters.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              type="number"
              value={controls[field.key]}
              onChange={(value) =>
                onControlChange(field.key, value as MetaPlotControls[typeof field.key])
              }
            />
          ))}
        </ControlSection>

        <ControlSection title="Curve Settings">
          {curveSettings.map((field) => (
            <FieldRow
              key={field.key}
              label={field.label}
              type="number"
              value={controls[field.key]}
              onChange={(value) =>
                onControlChange(field.key, value as MetaPlotControls[typeof field.key])
              }
            />
          ))}
        </ControlSection>
      </div>

      <div className="action-row">
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={!canRunAnalysis || isRunning}
          onClick={onRun}
        >
          <Play size={14} />
          Run Meta Plot
        </button>
        <button type="button" className="action-button" onClick={onReset}>
          <RotateCcw size={14} />
          Reset Defaults
        </button>
      </div>

    </section>
  );
}

function ControlSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`control-section${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="control-section__head"
        onClick={() => setIsOpen((current) => !current)}
      >
        <h4>{title}</h4>
        <ChevronDown size={16} />
      </button>
      {isOpen ? <div className="control-section__grid">{children}</div> : null}
    </section>
  );
}

function FieldRow({
  label,
  type,
  value,
  options,
  onChange
}: {
  label: string;
  type: "select" | "binary" | "number";
  value: string | number;
  options?: Array<{ label: string; value: string }>;
  onChange: (value: string | number) => void;
}) {
  const labelId = useId();

  return (
    <div className="field-shell">
      <span id={labelId}>{label}</span>
      {type === "number" ? (
        <input
          aria-labelledby={labelId}
          className="field-shell__input"
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      ) : (
        <CustomSelect
          labelId={labelId}
          options={options ?? []}
          value={String(value)}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function CustomSelect({
  labelId,
  options,
  value,
  onChange
}: {
  labelId: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeMenu(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") {
        return;
      }
      if (event instanceof PointerEvent && rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
      if (event instanceof KeyboardEvent) {
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`custom-select${isOpen ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select__trigger"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={labelId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedOption?.label ?? value}</span>
        <ChevronDown size={15} />
      </button>
      {isOpen ? (
        <div className="custom-select__menu" role="listbox" aria-labelledby={labelId}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`custom-select__option${isSelected ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
