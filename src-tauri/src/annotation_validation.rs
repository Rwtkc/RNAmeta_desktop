use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AnnotationValidation {
    pub(crate) exists: bool,
    pub(crate) is_valid: bool,
    pub(crate) root_path: String,
    pub(crate) registry_path: Option<String>,
    pub(crate) txdb_dir: Option<String>,
    pub(crate) txlens_dir: Option<String>,
    pub(crate) gff_dir: Option<String>,
    pub(crate) available_species: Vec<String>,
    pub(crate) species_supported: bool,
    pub(crate) missing_items: Vec<String>,
    pub(crate) species_files: Vec<String>,
}

fn first_existing(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|path| path.exists()).cloned()
}

fn reference_candidates(root: &Path, species: &str) -> [Vec<PathBuf>; 3] {
    let mut fasta = vec![root.join(format!("{species}.fa"))];
    let mut fai = vec![root.join(format!("{species}.fa.fai"))];
    let mut annotation = vec![root.join(format!("{species}.annotation.gtf"))];
    if species == "ara_TAIR10" {
        fasta.push(root.join("Arabidopsis_thaliana.TAIR10.dna.toplevel.fa"));
        fai.push(root.join("Arabidopsis_thaliana.TAIR10.dna.toplevel.fa.fai"));
        annotation.push(root.join("Arabidopsis_thaliana.TAIR10.51.gff3.gz"));
    }
    [fasta, fai, annotation]
}

#[tauri::command]
pub(crate) fn validate_annotation_directory(
    path: String,
    species: Option<String>,
) -> Result<AnnotationValidation, String> {
    let root = PathBuf::from(&path);
    let txdb_dir = root.join("txdb");
    let txlens_dir = root.join("txlens");
    let gff_dir = root.join("gff");
    let mut missing_items = Vec::new();
    if !root.exists() {
        missing_items.push("annotation directory".to_string());
    }

    let mut species_supported = species.is_none();
    let mut species_files = Vec::new();
    if let Some(target_species) = &species {
        let flat_core = [
            root.join(format!("{target_species}.txdb.sqlite")),
            root.join(format!("{target_species}.txlens.rda")),
            root.join(format!("{target_species}.gff.rda")),
        ];
        let core_present = flat_core.iter().all(|file| file.exists());
        if core_present {
            let files = &flat_core;
            species_files.extend(files.iter().map(|file| file.display().to_string()));
        } else {
            missing_items.extend(
                flat_core.iter().filter(|file| !file.exists()).map(|file| file.display().to_string()),
            );
        }

        for candidates in reference_candidates(&root, target_species) {
            if let Some(file) = first_existing(&candidates) {
                species_files.push(file.display().to_string());
            } else {
                missing_items.push(candidates[0].display().to_string());
            }
        }
        species_supported = core_present && species_files.len() == 6;
    }

    Ok(AnnotationValidation {
        exists: root.exists(),
        is_valid: missing_items.is_empty(),
        root_path: path,
        registry_path: None,
        txdb_dir: txdb_dir.exists().then(|| txdb_dir.display().to_string()),
        txlens_dir: txlens_dir.exists().then(|| txlens_dir.display().to_string()),
        gff_dir: gff_dir.exists().then(|| gff_dir.display().to_string()),
        available_species: Vec::new(),
        species_supported,
        missing_items,
        species_files,
    })
}

#[cfg(test)]
mod tests {
    use super::validate_annotation_directory;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn validates_flat_multispecies_bundle_and_reports_missing_reference() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("rnameta_osa_validation_{unique}"));
        fs::create_dir_all(&root).unwrap();
        let required = [
            "osa_IRGSP_1.txdb.sqlite", "osa_IRGSP_1.txlens.rda", "osa_IRGSP_1.gff.rda",
            "osa_IRGSP_1.fa", "osa_IRGSP_1.fa.fai", "osa_IRGSP_1.annotation.gtf",
        ];
        for file_name in required { fs::write(root.join(file_name), b"test").unwrap(); }

        let valid = validate_annotation_directory(root.display().to_string(), Some("osa_IRGSP_1".into())).unwrap();
        assert!(valid.is_valid);
        assert!(valid.species_supported);
        assert_eq!(valid.species_files.len(), 6);

        fs::remove_file(root.join("osa_IRGSP_1.fa.fai")).unwrap();
        let invalid = validate_annotation_directory(root.display().to_string(), Some("osa_IRGSP_1".into())).unwrap();
        assert!(!invalid.is_valid);
        assert!(!invalid.species_supported);
        assert!(invalid.missing_items.iter().any(|item| item.ends_with("osa_IRGSP_1.fa.fai")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn does_not_read_species_core_files_from_nested_annotation_directories() {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("rnameta_nested_validation_{unique}"));
        let nested = root.join("txdb");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("osa_IRGSP_1.txdb.sqlite"), b"test").unwrap();
        let result = validate_annotation_directory(root.display().to_string(), Some("osa_IRGSP_1".into())).unwrap();
        assert!(!result.is_valid);
        assert!(!result.species_supported);
        fs::remove_dir_all(root).unwrap();
    }
}
