import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Settings2
} from "lucide-react";
import { SPECIES_OPTIONS } from "@/data/species";
import { SpeciesSearchSelector } from "@/modules/Setup/SpeciesSearchSelector";
import { useAppStore } from "@/store/useAppStore";
import type { AnnotationValidation } from "@/types/native";

export function SetupModule({ onNavigate }: { onNavigate?: (moduleId: string) => void }) {
  const [isValidating, setIsValidating] = useState(false);
  const {
    species,
    setSpecies,
    annotationDir,
    annotationValidation,
    setAnnotationDir,
    setAnnotationValidation
  } = useAppStore();

  const selectedSpecies = useMemo(
    () => SPECIES_OPTIONS.find((option) => option.label === species) ?? null,
    [species]
  );

  async function runAnnotationValidation(
    path: string,
    speciesId?: string,
    options?: { silent?: boolean }
  ) {
    if (!options?.silent) {
      setIsValidating(true);
    }
    try {
      const result = await invoke<AnnotationValidation>("validate_annotation_directory", {
        path,
        species: speciesId ?? null
      });
      setAnnotationValidation(result);
      return result;
    } finally {
      if (!options?.silent) {
        setIsValidating(false);
      }
    }
  }

  async function chooseAnnotationDirectory() {
    const selected = await open({
      directory: true,
      multiple: false
    });

    if (typeof selected !== "string" || !selected) {
      return;
    }

    setAnnotationDir(selected);
    await runAnnotationValidation(selected, selectedSpecies?.id);
  }

  useEffect(() => {
    if (!annotationDir) {
      setAnnotationValidation(null);
      return;
    }

    void runAnnotationValidation(annotationDir, selectedSpecies?.id, { silent: true });
  }, [annotationDir, selectedSpecies?.id, setAnnotationValidation]);

  useEffect(() => {
    if (!annotationDir || !selectedSpecies?.id) {
      return;
    }

    const refreshValidation = () => {
      void runAnnotationValidation(annotationDir, selectedSpecies.id, { silent: true });
    };

    const intervalId = window.setInterval(refreshValidation, 2500);
    window.addEventListener("focus", refreshValidation);
    document.addEventListener("visibilitychange", refreshValidation);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshValidation);
      document.removeEventListener("visibilitychange", refreshValidation);
    };
  }, [annotationDir, selectedSpecies?.id]);

  const annotationStatusTone = annotationValidation?.isValid
    ? "success"
    : annotationValidation
      ? "danger"
      : "warning";

  const annotationStatusText = annotationValidation?.isValid
    ? "Annotation bundle matched"
    : annotationValidation
      ? "Annotation bundle incomplete"
      : "Choose a directory to validate";

  const shouldShowAnnotationStatus = Boolean(selectedSpecies && annotationDir && annotationValidation);
  const isSetupReady = Boolean(annotationValidation?.isValid);

  function prettyMissingItemLabel(item: string) {
    const trimmed = item.trim().replace(/[\\/]+$/, "");
    if (!trimmed) {
      return item;
    }

    const parts = trimmed.split(/[/\\]/);
    return parts[parts.length - 1] || trimmed;
  }

  return (
    <section className="module-page setup-page">
      <div className="module-page__hero setup-hero">
        <div className="module-page__hero-copy">
          <span className="setup-hero__context">Reference workspace</span>
          <h1>Project Configuration</h1>
          <p>Select a reference genome and validate its annotation library for RNAmeta analyses.</p>
        </div>
      </div>

      <div className="setup-stack">
        <ConfigCard
          icon={<Settings2 size={18} />}
          title="Reference Genome"
          desc="Select the species entry used to match the corresponding reference annotation files."
        >
          <SpeciesSearchSelector selectedValue={species} onSelect={setSpecies} />
        </ConfigCard>

        <ConfigCard
          icon={<Database size={18} />}
          title="Annotation Library"
          desc="Choose the external annotation directory. The client checks the selected species annotation files and the additional reference files required by Genome Browser and Structure."
        >
          <PathRow
            placeholder="Select annotation directory..."
            value={annotationDir}
            buttonLabel={annotationDir ? "Change" : "Browse"}
            onBrowse={() => void chooseAnnotationDirectory()}
          />

          {shouldShowAnnotationStatus ? (
            <div className={`inline-alert inline-alert--${annotationStatusTone}`}>
              {annotationValidation?.isValid ? (
                <CheckCircle2 size={14} />
              ) : (
                <AlertTriangle size={14} />
              )}
              <span>
                {isValidating ? "Validating annotation directory..." : annotationStatusText}
              </span>
            </div>
          ) : null}

          {annotationValidation?.missingItems?.length ? (
            <div className="summary-list summary-list--tight">
              {annotationValidation.missingItems.map((item) => (
                <div key={item} className="summary-list__item summary-list__item--danger">
                  Missing: {prettyMissingItemLabel(item)}
                </div>
              ))}
            </div>
          ) : null}
        </ConfigCard>
      </div>

      <div className="module-status">
        <div className={`module-status__copy${isSetupReady ? " is-ready" : ""}`}>
          {isSetupReady ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>
            {isSetupReady
              ? "Project Status: annotation bundle verified, analysis can begin"
              : "Project Status: waiting for a complete annotation bundle"}
          </span>
        </div>
        <button
          type="button"
          className={`module-status__action${isSetupReady ? " is-ready" : ""}`}
          disabled={!isSetupReady}
          onClick={() => onNavigate?.("upload-run")}
        >
          {isSetupReady ? "Start Analysis" : "Locked"}
          {isSetupReady ? <ArrowRight size={14} /> : null}
        </button>
      </div>
    </section>
  );
}

function ConfigCard({
  icon,
  title,
  desc,
  children
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="config-card">
      <div className="config-card__head">
        <div className="config-card__icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          <p>{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function PathRow({
  placeholder,
  value,
  buttonLabel = "Browse",
  onBrowse
}: {
  placeholder: string;
  value?: string;
  buttonLabel?: string;
  onBrowse?: () => void;
}) {
  return (
    <div className="path-row">
      <div className="path-row__input">{value || placeholder}</div>
      <button type="button" className="path-row__button" onClick={onBrowse}>
        {buttonLabel}
      </button>
    </div>
  );
}
